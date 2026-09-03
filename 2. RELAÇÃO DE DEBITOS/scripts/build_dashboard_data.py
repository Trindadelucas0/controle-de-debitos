#!/usr/bin/env python3
"""Gera dashboard/data/empresas.json com valores e esfera.

Regra de origem → esfera (fixixa):
  ECAC         → federal   (Receita Federal)
  AGENCIANET   → estadual  (Agenci@Net / SEFAZ-DF)
  MUNICIPAL    → municipal (relatório da Prefeitura)
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from extrair_debitos import (  # noqa: E402
    COMPETENCIA_DIR_RE,
    classify_text,
    codigo_from_filename,
    collapse_equivalent_codigos,
    extract_company,
    extract_company_from_pdf,
    fold,
    has_fiscal_markers,
    list_competencia_dirs,
    parse_ecac_apoio_certidao,
    pdf_string_literals,
    resolve_month_dir,
    resolve_workspace_root,
    run_all_modes,
    score_text,
    text_is_cid_garbage,
)

ESFERAS = ("federal", "estadual", "municipal")

DEBITO_ROW_RE = re.compile(
    r"(?P<code>\d{4}-\d{2})\s*-\s*(?P<nome>[a-z0-9Á-ú /.*-]+?)\s+"
    r"(?P<pa>(?:\d{2}/\d{2}/\d{4}|\d{2}/\d{4}|[1-4]o?\s*trim/\d{4}|[a-zç]{3}/\d{4}|20\d{2}))\s+"
    r"(?P<vcto>\d{2}/\d{2}/\d{4})\s+"
    r"(?P<original>[\d.]+,\d{2})\s+"
    r"(?P<saldo>[\d.]+,\d{2})\s+"
    r"(?P<multa>[\d.]+,\d{2})\s+"
    r"(?P<juros>[\d.]+,\d{2})\s+"
    r"(?P<consolidado>[\d.]+,\d{2})\s+"
    r"(?P<situacao>devedor|suspenso|ativo|quitado|parcelado|a vencer|a analisar(?:[- ]a vencer)?)",
    re.I,
)

# Agenci@Net: inscrição (número ou placa Mercosul) / ano / receita / tributo / [QPA] / valor
# Tributo até 120 chars: descrições longas (ex. ocupação área pública / propaganda).
AGENCIANET_ROW_RE = re.compile(
    r"(?P<insc>(?:[A-Z]{3}\d[A-Z0-9]{3}|\d{5,14}))\s+"
    r"(?P<ano>\d{4})\s+"
    r"(?P<receita>\d{1,6})\s+"
    r"(?P<tributo>[a-z0-9Á-ú /.*%-]{2,120}?)\s+"
    r"(?:\d{1,4}\s+)?"
    r"(?P<valor>\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|00)\b",
    re.I,
)

# Chrome/Skia no Linux: cada glifo é um Tj → inscrição+ano+valor saem colados, sem \s+.
# Tributo até 80 letras (descrições longas coladas). QPA opcional fica no tail
# e é separado por _peel_qpa_valor (ex. IPVA21324,47 → 1324,47).
AGENCIANET_ROW_GLUED_RE = re.compile(
    r"(?P<insc>(?:[A-Z]{3}\d[A-Z0-9]{3}|\d{8,12}))"
    r"(?P<ano>20\d{2})"
    r"(?P<receita>\d{3,4})"
    r"(?P<tributo>[A-Z]{2,80})"
    r"(?P<tail>\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})",
    re.I,
)

# Bloco A VENCER: inscrição / ano / descrição / código de receita (sem BRL)
AGENCIANET_AVENCER_RE = re.compile(
    r"(?P<insc>\d{5,14})\s+"
    r"(?P<ano>20\d{2})\s+"
    r"(?P<desc>[a-z0-9Á-ú /.*%-]{3,80}?)\s+"
    r"(?P<receita>\d{3,6})\b",
    re.I,
)

EMPTY_TOTAIS = {"original": 0.0, "saldo": 0.0, "multa": 0.0, "juros": 0.0, "consolidado": 0.0}

RECEITA_LIT_RE = re.compile(r"^(\d{4}-\d{2})\s*-\s*(.+)$", re.I)
SIMPLES_LIT_RE = re.compile(r"^SIMPLES\s+NAC\.?$", re.I)
SIMPLES_CODE_LIT_RE = re.compile(r"^(\d{4})(?:-\d{2})?-SIMPLES(?:\s+NAC\.?)?$", re.I)
PA_LIT_RE = re.compile(
    r"^(?:\d{2}/\d{4}|\d{2}/\d{2}/\d{4}|[1-4][oº°]?\s*TRIM/\d{4}|[A-ZÇÁ-Ú]{3}/\d{4}|20\d{2})$",
    re.I,
)
TRIM_ORD_LIT_RE = re.compile(r"^([1-4])[oº°]?$", re.I)
TRIM_TAIL_LIT_RE = re.compile(r"^TRIM\s*/\s*(20\d{2})$", re.I)
VCTO_LIT_RE = re.compile(r"^\d{2}/\d{2}/\d{4}$")
BRL_LIT_RE = re.compile(r"^\d{1,3}(?:\.\d{3})*,\d{2}$")
SITUACAO_LIT_RE = re.compile(
    r"^(DEVEDOR|SUSPENSO|ATIVO|QUITADO|PARCELADO|A VENCER|A ANALISAR(?:[- ]A VENCER)?)$",
    re.I,
)


def match_pa_at(literals: list[str], j: int) -> tuple[str, int] | None:
    """PA em um token (08/2024, 2º TRIM/2026) ou partido (4º + TRIM/2023)."""
    if j >= len(literals):
        return None
    tok = literals[j].strip()
    if PA_LIT_RE.match(tok):
        return normalize_pa(tok), 1
    ord_m = TRIM_ORD_LIT_RE.match(tok)
    if ord_m and j + 1 < len(literals):
        tail_m = TRIM_TAIL_LIT_RE.match(literals[j + 1].strip())
        if tail_m:
            return normalize_pa(f"{ord_m.group(1)}º TRIM/{tail_m.group(1)}"), 2
    return None


def normalize_pa(pa: str) -> str:
    """Unifica 4º / 4O / 4 TRIM/AAAA para o merge literais+regex não duplicar."""
    raw = re.sub(r"\s+", " ", (pa or "").strip().upper())
    folded = raw.replace("º", "O").replace("°", "O")
    match = re.match(r"^([1-4])O?\s*TRIM/(20\d{2})$", folded)
    if match:
        return f"{match.group(1)}º TRIM/{match.group(2)}"
    return raw
NOTIF_LANC_RE = re.compile(
    r"Notifica[cç][aã]o\s+de\s+lan[cç]amento\s*:\s*([0-9./-]+)",
    re.I,
)

MES_ABREV = ("JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ")
MES_TOKEN_RE = re.compile(r"\b(" + "|".join(MES_ABREV) + r")\b", re.I)
YEAR_MONTHS_RE = re.compile(
    r"^(20\d{2})\s*[-–]?\s*((?:(?:" + "|".join(MES_ABREV) + r")\s*)+)$",
    re.I,
)
YEAR_ONLY_RE = re.compile(r"^(20\d{2})\s*[-–]?\s*$")
# Corta lixo de outra página/seção que o regex de omissão lia como PA.
SECTION_BODY_STOP_RE = re.compile(
    r"diagnostico fiscal na procuradoria|"
    r"final do relatorio|"
    r"\bpagina\s*:|"
    r"ministerio da fazenda|"
    r"nao foram detectadas pend",
    re.I,
)
ECAC_TITULO_RE = re.compile(
    r"(?:pendencia\s*-+\s*)?(?:"
    r"omissao de dctfweb|"
    r"omissao de dctf\b|"
    r"omissao de dirf|"
    r"omissao de efd[- ]?contrib|"
    r"omissao de pgdas(?:-d)?|"
    r"omissao de (?!declar)[a-z0-9][a-z0-9 ./-]{1,40}|"
    r"irregularidade cadastral|"
    r"debito\s*\(\s*sief\s*\)|"
    r"debito\s*\(\s*sida\s*\)|"
    r"processo fiscal\s*\(\s*sief\s*\)|"
    r"inscricao\s*\(\s*sida\s*\)|"
    r"inscricao\s*\(\s*sistema divida\s*\)|"
    r"divergencia gfip\s*x\s*gps|"
    r"parcelamento\s*\([^)]{3,40}\)"
    r")"
    r"|debito com exigibilidade suspensa"
    r"|inscricao com exigibilidade suspensa"
    r"|parcelamento com exigibilidade suspensa",
    re.I,
)
CADASTRAL_FACT_RE = re.compile(
    r"(inscricao inapta(?:\s*-\s*omissao de declaracoes)?|"
    r"inapta(?:\s+omissao de declaracoes(?:\s+em\s+\d{2}/\d{2}/\d{4})?)?|"
    r"integrante do qsa.{0,80}?irregular|"
    r"inscricao baixada|"
    r"inscricao nula|"
    r"situacao cadastral (?:irregular|baixada|nula|inapta)|"
    r"omissao de declaracoes)",
    re.I,
)

OCR_TEXT_MIN_SCORE = 6
OCR_TEXT_MIN_ALNUM = 40


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")[:80] or "empresa"


def cnpj_digits(cnpj: str | None) -> str | None:
    if not cnpj:
        return None
    digits = re.sub(r"\D", "", cnpj)
    return digits if len(digits) == 14 else None


def cnpj_estabelecimento(cnpj: str | None) -> str | None:
    """Retorna o código de estabelecimento (4 dígitos) do CNPJ, ou None."""
    digits = cnpj_digits(cnpj)
    if not digits:
        return None
    return digits[8:12]


def is_cnpj_matriz(cnpj: str | None) -> bool:
    """Matriz = estabelecimento 0001 no CNPJ."""
    return cnpj_estabelecimento(cnpj) == "0001"


def is_cnpj_filial(cnpj: str | None) -> bool:
    """Filial real: CNPJ válido com estabelecimento diferente de /0001."""
    est = cnpj_estabelecimento(cnpj)
    return bool(est and est != "0001")


def parse_brl(value: str) -> float:
    return float(value.replace(".", "").replace(",", "."))


def best_text(path: Path) -> tuple[str, str]:
    """Escolhe o modo com melhor score; desempate favorece CNPJ/nome válidos."""
    modes = run_all_modes(path)

    def rank_key(item):
        res = item[1]
        blob = res.text or ""
        cnpj, nome = extract_company(blob)
        has_cnpj = 1 if cnpj and len(re.sub(r"\D", "", cnpj)) == 14 else 0
        has_nome = 1 if nome else 0
        has_fiscal = 1 if has_fiscal_markers(blob) else 0
        readable = 0 if text_is_cid_garbage(blob) else 1
        structured = 1 if blob.count("\n") >= 8 else 0
        return (readable, structured, has_fiscal, res.score, has_cnpj, has_nome, len(blob))

    ranked = sorted(modes.items(), key=rank_key, reverse=True)
    best_mode, best = ranked[0]
    return best.text or "", best_mode


def sort_codigos(codigos: set[str] | list[str]) -> list[str]:
    collapsed = collapse_equivalent_codigos(codigos)

    def key(code: str) -> tuple[int, str]:
        try:
            return (int(code), code)
        except ValueError:
            return (10**9, code)

    return sorted(set(collapsed), key=key)


def text_is_weak(text: str) -> bool:
    if not text or not text.strip():
        return True
    # Lixo CID/binário (muitos NULs) não conta como texto útil mesmo com score alto
    nul_ratio = text.count("\x00") / max(len(text), 1)
    if nul_ratio > 0.05:
        return True
    printable = sum(1 for ch in text if ch.isascii() and (ch.isalnum() or ch.isspace()))
    if printable / max(len(text), 1) < 0.2:
        return True
    if not has_fiscal_markers(text):
        return True
    if score_text(text) >= OCR_TEXT_MIN_SCORE:
        return False
    alnum = len(re.findall(r"[A-Za-zÁ-ú]{4,}", text))
    return alnum < OCR_TEXT_MIN_ALNUM


def ocr_pdf_text(path: Path) -> tuple[str, str | None]:
    """OCR das páginas via pymupdf + pytesseract. Retorna (texto, aviso)."""
    try:
        import fitz
    except ImportError:
        return "", "OCR indisponível (pymupdf não instalado)"
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        return "", "OCR indisponível (instale pytesseract e Pillow; Tesseract no PATH)"

    try:
        doc = fitz.open(str(path))
    except Exception as exc:  # noqa: BLE001
        return "", f"OCR falhou ao abrir {path.name}: {exc}"

    parts: list[str] = []
    try:
        for page in doc:
            # 2x zoom melhora OCR de PDFs Agenci@Net
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            try:
                parts.append(pytesseract.image_to_string(img, lang="por") or "")
            except pytesseract.TesseractNotFoundError:
                return "", "Tesseract OCR não encontrado no PATH (veja COMO_RODAR.txt)"
            except Exception as exc:  # noqa: BLE001
                parts.append("")
                _ = exc
    finally:
        doc.close()

    text = "\n".join(parts).strip()
    if not text:
        return "", f"OCR sem texto útil em {path.name}"
    return text, None


def resolve_pdf_text(path: Path, label: str) -> tuple[str, str, list[str]]:
    """Texto do PDF + modo + avisos. AGENCIANET/MUNICIPAL/ECAC fraco tenta OCR."""
    avisos: list[str] = []
    text, mode = best_text(path)
    if label in {"AGENCIANET", "MUNICIPAL", "ECAC"} and text_is_weak(text):
        ocr_text, ocr_aviso = ocr_pdf_text(path)
        if ocr_text and (
            score_text(ocr_text) > score_text(text)
            or (text_is_weak(text) and not text_is_weak(ocr_text))
            or len(ocr_text) > len(text)
        ):
            return ocr_text, "ocr", avisos
        if ocr_aviso:
            avisos.append(ocr_aviso)
        elif not ocr_text:
            avisos.append(f"OCR sem texto útil em {path.name}")
    return text, mode, avisos


MUNICIPAL_NAME_TOKENS = (
    "MUNICIPAL",
    "PREFEITURA",
    "IPTU",
    "ISSQN",
    "CCM",
    "NFSE",
)


def origem_label(file_name: str) -> str:
    """Identifica a fonte do PDF pelo nome do arquivo."""
    upper = file_name.upper()
    if "ECAC" in upper:
        return "ECAC"
    if "AGENCIANET" in upper:
        return "AGENCIANET"
    if any(token in upper for token in MUNICIPAL_NAME_TOKENS):
        return "MUNICIPAL"
    return "OUTRO"


def esfera_por_origem(label: str) -> str | None:
    """Mapeamento fixo origem → esfera."""
    if label == "ECAC":
        return "federal"
    if label == "AGENCIANET":
        return "estadual"
    if label == "MUNICIPAL":
        return "municipal"
    return None


def esfera_por_nome(file_name: str) -> str | None:
    return esfera_por_origem(origem_label(file_name))


def esfera_por_conteudo(text: str) -> tuple[str | None, bool]:
    """Fallback só para arquivos OUTRO (sem ECAC/AGENCIANET/MUNICIPAL no nome)."""
    f = fold(text)
    scores = {"federal": 0, "estadual": 0, "municipal": 0}

    federal_marks = [
        "receita federal",
        "fazenda nacional",
        "procuradoria-geral da fazenda",
        "procuradoria geral da fazenda",
        "diagnostico fiscal na receita",
        "dctfweb",
        " pendencia - debito",
        "sief",
    ]
    estadual_marks = [
        "fazenda.df",
        "agenci@net",
        "agencianet",
        "receita.fazenda.df",
        "secretaria de fazenda do distrito federal",
        "emissao de certidao negativa nao constam debitos",
        "consulta de debitos - identificacao do contribuinte",
    ]
    # Municipal só com sinal forte de prefeitura (não IPTU isolado no Agenci@Net).
    municipal_marks = [
        "prefeitura",
        "secretaria municipal",
        "tributos municipais",
        "nota fiscal de servicos eletronica",
    ]

    for mark in federal_marks:
        if mark in f:
            scores["federal"] += 2 if mark in {"receita federal", "fazenda nacional"} else 1
    for mark in estadual_marks:
        if mark in f:
            scores["estadual"] += 2 if "fazenda.df" in mark or "agenci" in mark else 1
    for mark in municipal_marks:
        if mark in f:
            scores["municipal"] += 3 if mark in {"prefeitura", "secretaria municipal"} else 1

    best = max(scores, key=lambda key: scores[key])
    if scores[best] == 0:
        return None, False
    forte = scores[best] >= 3
    return best, forte


def classify_esfera(file_name: str, text: str = "") -> str:
    """ECAC=federal, AGENCIANET=estadual, MUNICIPAL/PREFEITURA=municipal."""
    by_name = esfera_por_nome(file_name)
    if by_name:
        return by_name
    by_content, forte = esfera_por_conteudo(text)
    if forte and by_content:
        return by_content
    if by_content:
        return by_content
    return "federal"


def status_doc_from_classe(pasta_status: str, classe: str, has_rows: bool) -> str:
    # Débitos extraídos / COM_PENDENCIA prevalecem sobre pasta "regular"
    if has_rows or classe == "COM_PENDENCIA":
        return "pendencia"
    if pasta_status == "regular" or classe == "SEM_PENDENCIA":
        return "regular"
    return "indeterminado"


def _strip_ecac_decoration(text: str) -> str:
    """Remove sublinhados/asteriscos que o PDF do diagnóstico cola no título."""
    text = re.sub(r"[_*]{2,}", " ", text)
    text = text.replace("_", " ")
    return re.sub(r"\s+", " ", text).strip(" -")


def normalize_ecac_titulo(raw: str) -> str:
    """Normaliza título de seção do Diagnóstico Fiscal (sem strip de SIEF/SIDA)."""
    f = fold(_strip_ecac_decoration(raw))
    f = re.sub(r"[*]+", "", f)
    f = re.sub(r"\s+", " ", f).strip(" -")
    f = re.sub(r"^pendencia\s*-+\s*", "", f).strip(" -")
    if "irregularidade cadastral" in f:
        return "IRREGULARIDADE CADASTRAL"
    omissao = re.match(r"^omissao de (.+)$", f)
    if omissao:
        rest = re.sub(r"\s+", " ", omissao.group(1)).strip(" -")
        if rest.startswith("dctfweb"):
            return "OMISSAO DE DCTFWEB"
        if rest.startswith("dctf"):
            return "OMISSAO DE DCTF"
        if rest.startswith("dirf"):
            return "OMISSAO DE DIRF"
        if "efd" in rest and "contrib" in rest:
            return "OMISSAO DE EFD-CONTRIB"
        if rest.startswith("pgdas"):
            return "OMISSAO DE PGDAS-D"
        return f"OMISSAO DE {rest.upper()}"
    # Exigibilidade suspensa antes de Débito (SIEF): o título traz "(SIEF)" no fim.
    if "parcelamento" in f and "exigibilidade suspensa" in f:
        return "PARCELAMENTO SUSPENSO"
    if "inscricao" in f and "exigibilidade suspensa" in f:
        return "INSCRICAO SUSPENSA"
    if "debito" in f and "exigibilidade suspensa" in f:
        return "DEBITO SUSPENSO"
    if "debito" in f and "sief" in f:
        return "DEBITO (SIEF)"
    if "debito" in f and "sida" in f:
        return "DEBITO (SIDA)"
    if "processo fiscal" in f:
        return "PROCESSO FISCAL (SIEF)"
    if "divergencia gfip" in f:
        return "DIVERGENCIA GFIP X GPS"
    if "inscricao" in f and "sida" in f:
        return "INSCRICAO (SIDA)"
    if "inscricao" in f and "divida" in f:
        return "INSCRICAO (SISTEMA DIVIDA)"
    if "parcelamento" in f and ("parcsn" in f or "parcmei" in f):
        return "PARCELAMENTO (PARCSN/PARCMEI)"
    if f.startswith("parcelamento"):
        return "PARCELAMENTO"
    return f.upper().strip()


def is_omissao_titulo(titulo: str | None) -> bool:
    return bool(titulo and titulo.startswith("OMISSAO"))


def is_omissao_anual(titulo: str | None) -> bool:
    """ECF/ECD/DIRF são ano-calendário; DCTFWeb/DCTF/EFD/PGDAS são mensais."""
    if not is_omissao_titulo(titulo):
        return False
    up = (titulo or "").upper()
    if "DCTFWEB" in up or "DCTF" in up or "EFD" in up or "PGDAS" in up:
        return False
    return any(mark in up for mark in ("ECF", "ECD", "DIRF"))


def is_cadastral_titulo(titulo: str | None) -> bool:
    return titulo == "IRREGULARIDADE CADASTRAL"


def receita_for_omissao(titulo: str) -> str:
    if "DCTFWEB" in titulo:
        return "Omissão de DCTFWeb"
    if "EFD" in titulo:
        return "Omissão de EFD-Contrib"
    if "PGDAS" in titulo:
        return "Omissão de PGDAS-D"
    if "DCTF" in titulo:
        return "Omissão de DCTF"
    if "DIRF" in titulo:
        return "Omissão de DIRF"
    if titulo.startswith("OMISSAO DE "):
        return f"Omissão de {titulo[len('OMISSAO DE '):].strip()}"
    return "Omissão"


def _titulo_is_complete(folded: str) -> bool:
    if "exigibilidade suspensa" in folded:
        return True
    if "irregularidade cadastral" in folded:
        return True
    if folded.startswith("omissao de") and len(folded) >= 12:
        return True
    if "processo fiscal" in folded:
        return True
    if "inscricao" in folded and "sida" in folded:
        return True
    if folded.startswith("parcelamento") and len(folded) >= 12:
        return True
    match = re.search(r"pendencia\s*-+\s*(.+)", folded)
    if not match:
        return False
    rest = match.group(1).strip(" -*")
    return len(rest) >= 3


def _token_breaks_titulo(token: str) -> bool:
    stripped = token.strip()
    if (
        RECEITA_LIT_RE.match(stripped)
        or SIMPLES_LIT_RE.match(stripped)
        or SIMPLES_CODE_LIT_RE.match(stripped)
        or PA_LIT_RE.match(stripped)
        or TRIM_ORD_LIT_RE.match(stripped)
        or TRIM_TAIL_LIT_RE.match(stripped)
    ):
        return True
    if YEAR_MONTHS_RE.match(stripped) or YEAR_ONLY_RE.match(stripped):
        return True
    folded = fold(stripped)
    if "periodo de apuracao" in folded:
        return True
    if folded in {"receita", "pa/exerc.", "pa/exerc", "dt. vcto", "situacao", "vl. original"}:
        return True
    return False


def match_ecac_titulo_at(literals: list[str], i: int) -> tuple[str | None, int]:
    """Detecta título de seção nos literais; retorna (titulo, tokens consumidos)."""
    n = len(literals)
    if i >= n:
        return None, 0
    first = fold(literals[i])
    starts_titulo = (
        first.startswith("pendencia")
        or first.startswith("omissao de")
        or first.startswith("parcelamento")
        or "exigibilidade suspensa" in first
        or "processo fiscal" in first
        or "irregularidade cadastral" in first
        or ("inscricao" in first and "sida" in first)
    )
    if not starts_titulo:
        return None, 0
    max_join = min(4, n - i)
    for ntok in range(1, max_join + 1):
        last = literals[i + ntok - 1]
        if ntok > 1:
            last_fold = fold(last)
            if _token_breaks_titulo(last):
                break
            if last_fold.startswith("pendencia") or "exigibilidade suspensa" in last_fold:
                break
        combined = " ".join(literals[i : i + ntok])
        folded = fold(combined)
        if not _titulo_is_complete(folded):
            continue
        titulo = normalize_ecac_titulo(combined)
        if titulo and titulo not in {"PENDENCIA", "PENDENCIA -"}:
            return titulo, ntok
    return None, 0


def _clip_section_body(body: str) -> str:
    match = SECTION_BODY_STOP_RE.search(body)
    if match and match.start() > 0:
        return body[: match.start()]
    return body


def _parse_year_months_at(
    literals: list[str],
    i: int,
    *,
    anual: bool = False,
) -> tuple[str, list[str], int] | None:
    n = len(literals)
    if i >= n:
        return None
    token = literals[i].strip()
    match = YEAR_MONTHS_RE.match(token)
    if match:
        year = match.group(1)
        if anual:
            return year, [], 1
        months = [item.upper() for item in MES_TOKEN_RE.findall(token)]
        if months:
            return year, months, 1
    if not YEAR_ONLY_RE.match(token):
        return None
    year = YEAR_ONLY_RE.match(token).group(1)
    if anual:
        return year, [], 1
    j = i + 1
    if j < n and re.match(r"^[-–]$", literals[j].strip()):
        j += 1
    months: list[str] = []
    while j < n:
        nxt = literals[j].strip()
        if match_ecac_titulo_at(literals, j)[0]:
            break
        if YEAR_MONTHS_RE.match(nxt) or YEAR_ONLY_RE.match(nxt):
            break
        found = [item.upper() for item in MES_TOKEN_RE.findall(nxt)]
        if not found:
            folded = fold(nxt)
            if folded in {"", "-", "e", "/", "de"}:
                j += 1
                continue
            break
        months.extend(found)
        j += 1
    if not months:
        return year, [], j - i
    return year, months, j - i


def _make_omissao_rows(
    *,
    titulo: str,
    year: str,
    months: list[str],
    origem: str,
    arquivo: str,
    codigo: str,
    esfera: str,
) -> list[dict]:
    receita = receita_for_omissao(titulo)
    rows: list[dict] = []
    if not months:
        rows.append(
            _make_debito_row(
                receita=receita,
                pa=year,
                vencimento="",
                original=0.0,
                saldo=0.0,
                multa=0.0,
                juros=0.0,
                consolidado=0.0,
                situacao="OMISSAO",
                origem=origem,
                arquivo=arquivo,
                codigo=codigo,
                esfera=esfera,
                titulo=titulo,
            )
        )
        return rows
    for mes in months:
        rows.append(
            _make_debito_row(
                receita=receita,
                pa=f"{mes}/{year}",
                vencimento="",
                original=0.0,
                saldo=0.0,
                multa=0.0,
                juros=0.0,
                consolidado=0.0,
                situacao="OMISSAO",
                origem=origem,
                arquivo=arquivo,
                codigo=codigo,
                esfera=esfera,
                titulo=titulo,
            )
        )
    return rows


def _placeholder_rows_for_titulo(
    titulo: str,
    origem: str,
    arquivo: str,
    esfera: str,
) -> list[dict]:
    """Seção reconhecida sem tabela/período: ainda assim sobe no Federal."""
    codigo = codigo_from_filename(arquivo)
    if is_cadastral_titulo(titulo):
        return [
            _make_cadastral_row(
                receita="Irregularidade cadastral",
                origem=origem,
                arquivo=arquivo,
                codigo=codigo,
                esfera=esfera,
            )
        ]
    if is_omissao_titulo(titulo):
        return [
            _make_debito_row(
                receita=receita_for_omissao(titulo),
                pa="",
                vencimento="",
                original=0.0,
                saldo=0.0,
                multa=0.0,
                juros=0.0,
                consolidado=0.0,
                situacao="OMISSAO",
                origem=origem,
                arquivo=arquivo,
                codigo=codigo,
                esfera=esfera,
                titulo=titulo,
            )
        ]
    return []


def parse_omissao_periodos(
    body: str,
    titulo: str,
    origem: str,
    arquivo: str,
    esfera: str,
) -> list[dict]:
    codigo = codigo_from_filename(arquivo)
    rows: list[dict] = []
    seen: set[str] = set()
    body = _clip_section_body(body)
    anual = is_omissao_anual(titulo)

    if not anual:
        for match in re.finditer(
            r"(20\d{2})\s*[-–]?\s*((?:(?:" + "|".join(MES_ABREV) + r")\s*)+)",
            body,
            re.I,
        ):
            year = match.group(1)
            months = [item.upper() for item in MES_TOKEN_RE.findall(match.group(2))]
            for row in _make_omissao_rows(
                titulo=titulo,
                year=year,
                months=months,
                origem=origem,
                arquivo=arquivo,
                codigo=codigo,
                esfera=esfera,
            ):
                key = row["pa"]
                if key not in seen:
                    seen.add(key)
                    rows.append(row)
        if not rows:
            for match in re.finditer(r"(?<!\d/)(0[1-9]|1[0-2])/(20\d{2})\b", body):
                mes = MES_ABREV[int(match.group(1)) - 1]
                year = match.group(2)
                for row in _make_omissao_rows(
                    titulo=titulo,
                    year=year,
                    months=[mes],
                    origem=origem,
                    arquivo=arquivo,
                    codigo=codigo,
                    esfera=esfera,
                ):
                    key = row["pa"]
                    if key not in seen:
                        seen.add(key)
                        rows.append(row)

    if not rows:
        years = re.findall(r"(?<![/\d])(20\d{2})\b", body)
        for year in dict.fromkeys(years):
            for row in _make_omissao_rows(
                titulo=titulo,
                year=year,
                months=[],
                origem=origem,
                arquivo=arquivo,
                codigo=codigo,
                esfera=esfera,
            ):
                key = row["pa"]
                if key not in seen:
                    seen.add(key)
                    rows.append(row)
    return rows


def iter_ecac_sections(folded: str) -> list[tuple[str | None, str]]:
    matches = list(ECAC_TITULO_RE.finditer(folded))
    if not matches:
        return [(None, folded)]
    sections: list[tuple[str | None, str]] = []
    if matches[0].start() > 0:
        pre = folded[: matches[0].start()].strip()
        if pre:
            sections.append((None, pre))
    for idx, match in enumerate(matches):
        titulo = normalize_ecac_titulo(match.group(0))
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(folded)
        body = _clip_section_body(folded[match.end() : end])
        sections.append((titulo or None, body))
    return sections


def _debito_row_key(row: dict) -> tuple:
    if is_omissao_titulo(row.get("titulo")) or row.get("situacao") == "OMISSAO":
        return ("omissao", row.get("titulo") or "", row.get("pa") or "")
    if is_cadastral_titulo(row.get("titulo")) or row.get("situacao") == "INAPTA":
        return ("cadastral", fold(_clean_cadastral_fact(row.get("receita") or "")))
    return (
        "fin",
        row.get("receita") or "",
        row.get("pa") or "",
        row.get("vencimento") or "",
        round(float(row.get("consolidado") or 0), 2),
        (row.get("situacao") or "").upper(),
    )


def merge_ecac_rows(primary: list[dict], secondary: list[dict]) -> list[dict]:
    """Une literais + regex: omissões extras entram antes; o resto depois.

    Identidade financeira ignora `titulo` para não duplicar a mesma linha
    quando o regex (texto CID) atribui a seção errada.
    """
    secondary_by_key = {_debito_row_key(row): row for row in secondary}
    for row in primary:
        if row.get("titulo"):
            continue
        other = secondary_by_key.get(_debito_row_key(row))
        if other and other.get("titulo"):
            row["titulo"] = other["titulo"]

    seen = {_debito_row_key(row) for row in primary}
    omissao_extra: list[dict] = []
    other_extra: list[dict] = []
    for row in secondary:
        key = _debito_row_key(row)
        if key in seen:
            continue
        seen.add(key)
        if is_omissao_titulo(row.get("titulo")) or row.get("situacao") == "OMISSAO":
            omissao_extra.append(row)
        else:
            other_extra.append(row)
    return omissao_extra + primary + other_extra


def _make_debito_row(
    *,
    receita: str,
    pa: str,
    vencimento: str,
    original: float,
    saldo: float,
    multa: float,
    juros: float,
    consolidado: float,
    situacao: str,
    origem: str,
    arquivo: str,
    codigo: str,
    esfera: str,
    numero_lancamento: str | None = None,
    inscricao: str | None = None,
    titulo: str | None = None,
) -> dict:
    row = {
        "receita": receita,
        "pa": normalize_pa(pa),
        "vencimento": vencimento,
        "original": original,
        "saldo": saldo,
        "multa": multa,
        "juros": juros,
        "consolidado": consolidado,
        "situacao": situacao,
        "origem": origem,
        "arquivo": arquivo,
        "codigo": codigo,
        "esfera": esfera,
    }
    if numero_lancamento:
        row["numero_lancamento"] = numero_lancamento
    if inscricao:
        row["inscricao"] = inscricao
    if titulo:
        row["titulo"] = titulo
    return row


def _clean_cadastral_fact(text: str) -> str:
    text = _strip_ecac_decoration(text)
    text = re.sub(r"\)\s*Tj\s*$", "", text, flags=re.I)
    text = text.strip("() ")
    return re.sub(r"\s+", " ", text).strip()


def _cadastral_fact_from_token(token: str) -> str | None:
    """Fato cadastral (inapta/QSA) — não é receita nem novo título de seção."""
    stripped = _clean_cadastral_fact(token)
    if not stripped:
        return None
    if (
        RECEITA_LIT_RE.match(stripped)
        or PA_LIT_RE.match(stripped)
        or YEAR_MONTHS_RE.match(stripped)
        or YEAR_ONLY_RE.match(stripped)
    ):
        return None
    titulo, _ = match_ecac_titulo_at([stripped], 0)
    if titulo:
        return None
    folded = fold(stripped)
    if (
        "inapta" in folded
        or "omissao de declar" in folded
        or ("qsa" in folded and "irregular" in folded)
        or "situacao cadastral" in folded
        or "inscricao baixada" in folded
        or "inscricao nula" in folded
    ):
        return stripped
    return None


def _make_cadastral_row(
    *,
    receita: str,
    origem: str,
    arquivo: str,
    codigo: str,
    esfera: str,
) -> dict:
    return _make_debito_row(
        receita=receita,
        pa="",
        vencimento="",
        original=0.0,
        saldo=0.0,
        multa=0.0,
        juros=0.0,
        consolidado=0.0,
        situacao="INAPTA",
        origem=origem,
        arquivo=arquivo,
        codigo=codigo,
        esfera=esfera,
        titulo="IRREGULARIDADE CADASTRAL",
    )


def parse_irregularidade_body(
    body: str,
    origem: str,
    arquivo: str,
    esfera: str,
) -> list[dict]:
    codigo = codigo_from_filename(arquivo)
    rows: list[dict] = []
    seen: set[str] = set()
    for match in CADASTRAL_FACT_RE.finditer(body or ""):
        fact = _clean_cadastral_fact(match.group(0))
        if not fact or fact in seen:
            continue
        seen.add(fact)
        rows.append(
            _make_cadastral_row(
                receita=fact,
                origem=origem,
                arquivo=arquivo,
                codigo=codigo,
                esfera=esfera,
            )
        )
    return rows


def parse_ecac_from_literals(
    literals: list[str],
    origem: str,
    arquivo: str,
    esfera: str,
) -> list[dict]:
    """Varre literais PDF em sequência e monta linhas de débito ECAC por seção."""
    codigo = codigo_from_filename(arquivo)
    rows: list[dict] = []
    seen: set[tuple] = set()
    current_titulo: str | None = None
    titulos_vistos: set[str] = set()
    i = 0
    n = len(literals)

    while i < n:
        titulo, consumed = match_ecac_titulo_at(literals, i)
        if titulo:
            current_titulo = titulo
            titulos_vistos.add(titulo)
            i += consumed
            continue

        if is_omissao_titulo(current_titulo):
            parsed = _parse_year_months_at(
                literals, i, anual=is_omissao_anual(current_titulo)
            )
            if parsed:
                year, months, consumed = parsed
                for row in _make_omissao_rows(
                    titulo=current_titulo or "OMISSAO DE DCTFWEB",
                    year=year,
                    months=months,
                    origem=origem,
                    arquivo=arquivo,
                    codigo=codigo,
                    esfera=esfera,
                ):
                    key = _debito_row_key(row)
                    if key not in seen:
                        seen.add(key)
                        rows.append(row)
                i += consumed
                continue
            m_pa = re.match(r"^(0[1-9]|1[0-2])/(20\d{2})$", literals[i].strip())
            if m_pa:
                if is_omissao_anual(current_titulo):
                    i += 1
                    continue
                mes = MES_ABREV[int(m_pa.group(1)) - 1]
                year = m_pa.group(2)
                for row in _make_omissao_rows(
                    titulo=current_titulo or "OMISSAO DE DCTF",
                    year=year,
                    months=[mes],
                    origem=origem,
                    arquivo=arquivo,
                    codigo=codigo,
                    esfera=esfera,
                ):
                    key = _debito_row_key(row)
                    if key not in seen:
                        seen.add(key)
                        rows.append(row)
                i += 1
                continue

        if is_cadastral_titulo(current_titulo):
            fact = _cadastral_fact_from_token(literals[i])
            if fact:
                row = _make_cadastral_row(
                    receita=fact,
                    origem=origem,
                    arquivo=arquivo,
                    codigo=codigo,
                    esfera=esfera,
                )
                key = _debito_row_key(row)
                if key not in seen:
                    seen.add(key)
                    rows.append(row)
                i += 1
                continue

        token = literals[i]
        receita: str | None = None
        m_rec = RECEITA_LIT_RE.match(token)
        m_simples_code = SIMPLES_CODE_LIT_RE.match(token)
        if m_rec:
            receita = f"{m_rec.group(1)} - {m_rec.group(2).strip()}"
        elif SIMPLES_LIT_RE.match(token):
            receita = "SIMPLES NAC."
        elif m_simples_code:
            receita = f"{m_simples_code.group(1)}-SIMPLES"
        else:
            i += 1
            continue

        j = i + 1
        pa_hit = match_pa_at(literals, j)
        if not pa_hit:
            i += 1
            continue
        pa, pa_consumed = pa_hit
        j += pa_consumed
        if j >= n or not VCTO_LIT_RE.match(literals[j]):
            i += 1
            continue
        vencimento = literals[j].strip()
        j += 1

        values: list[float] = []
        while j < n and BRL_LIT_RE.match(literals[j]) and len(values) < 5:
            values.append(parse_brl(literals[j]))
            j += 1

        if j >= n or not SITUACAO_LIT_RE.match(literals[j]):
            i += 1
            continue
        situacao = literals[j].strip().upper()
        j += 1

        if len(values) >= 5:
            original, saldo, multa, juros, consolidado = values[:5]
        elif len(values) == 2:
            original, saldo = values
            multa = juros = 0.0
            consolidado = saldo
        else:
            i += 1
            continue

        numero_lancamento: str | None = None
        if j < n:
            m_notif = NOTIF_LANC_RE.search(literals[j])
            if m_notif:
                numero_lancamento = m_notif.group(1).strip()
                j += 1

        row = _make_debito_row(
            receita=receita,
            pa=pa,
            vencimento=vencimento,
            original=original,
            saldo=saldo,
            multa=multa,
            juros=juros,
            consolidado=consolidado,
            situacao=situacao,
            origem=origem,
            arquivo=arquivo,
            codigo=codigo,
            esfera=esfera,
            numero_lancamento=numero_lancamento,
            titulo=current_titulo,
        )
        key = _debito_row_key(row)
        if key not in seen:
            seen.add(key)
            rows.append(row)
        i = j if j > i + 1 else i + 1

    titulos_com_row = {r.get("titulo") for r in rows if r.get("titulo")}
    for titulo in titulos_vistos:
        if titulo in titulos_com_row:
            continue
        for row in _placeholder_rows_for_titulo(titulo, origem, arquivo, esfera):
            key = _debito_row_key(row)
            if key not in seen:
                seen.add(key)
                rows.append(row)
    return rows


def _parse_financial_rows_in_body(
    body: str,
    origem: str,
    arquivo: str,
    esfera: str,
    titulo: str | None,
) -> list[dict]:
    codigo = codigo_from_filename(arquivo)
    rows: list[dict] = []
    for match in DEBITO_ROW_RE.finditer(body):
        nome = re.sub(r"\s+", " ", match.group("nome")).strip().upper()
        receita = f"{match.group('code')} - {nome}"
        rows.append(
            _make_debito_row(
                receita=receita,
                pa=re.sub(r"\s+", " ", match.group("pa")).strip().upper(),
                vencimento=match.group("vcto"),
                original=parse_brl(match.group("original")),
                saldo=parse_brl(match.group("saldo")),
                multa=parse_brl(match.group("multa")),
                juros=parse_brl(match.group("juros")),
                consolidado=parse_brl(match.group("consolidado")),
                situacao=match.group("situacao").upper(),
                origem=origem,
                arquivo=arquivo,
                codigo=codigo,
                esfera=esfera,
                titulo=titulo,
            )
        )
    return rows


def parse_ecac_debitos_regex(text: str, origem: str, arquivo: str, esfera: str) -> list[dict]:
    f = fold(text)
    rows: list[dict] = []
    seen: set[tuple] = set()
    for titulo, body in iter_ecac_sections(f):
        section_rows: list[dict] = []
        if is_omissao_titulo(titulo):
            omiss = parse_omissao_periodos(
                body, titulo or "OMISSAO DE DCTFWEB", origem, arquivo, esfera
            )
            if not omiss:
                omiss = _placeholder_rows_for_titulo(
                    titulo or "OMISSAO DE DCTFWEB", origem, arquivo, esfera
                )
            section_rows.extend(omiss)
        if is_cadastral_titulo(titulo):
            cad = parse_irregularidade_body(body, origem, arquivo, esfera)
            if not cad:
                cad = _placeholder_rows_for_titulo(titulo, origem, arquivo, esfera)
            section_rows.extend(cad)
        section_rows.extend(_parse_financial_rows_in_body(body, origem, arquivo, esfera, titulo))
        for row in section_rows:
            key = _debito_row_key(row)
            if key not in seen:
                seen.add(key)
                rows.append(row)
    return rows


def text_to_ecac_literals(text: str) -> list[str]:
    """Quebra texto extraído (pymupdf/OCR) em tokens no mesmo formato dos literais PDF."""
    literals: list[str] = []
    for raw_line in (text or "").replace("\r", "\n").split("\n"):
        line = re.sub(r"\s+", " ", raw_line).strip()
        if line:
            literals.append(line)
    return literals


def parse_ecac_debitos(
    text: str,
    origem: str,
    arquivo: str,
    esfera: str,
    path: Path | None = None,
) -> list[dict]:
    lit_rows: list[dict] = []
    if path is not None and path.exists():
        try:
            lit_rows = parse_ecac_from_literals(pdf_string_literals(path), origem, arquivo, esfera)
        except Exception:
            lit_rows = []
    text_rows: list[dict] = []
    if text and text.strip():
        try:
            text_rows = parse_ecac_from_literals(text_to_ecac_literals(text), origem, arquivo, esfera)
        except Exception:
            text_rows = []
    regex_rows = parse_ecac_debitos_regex(text, origem, arquivo, esfera)
    merged = lit_rows
    if text_rows:
        merged = merge_ecac_rows(merged, text_rows) if merged else text_rows
    if regex_rows:
        merged = merge_ecac_rows(merged, regex_rows) if merged else regex_rows
    return merged


BRL_TOKEN_RE = r"\d{1,3}(?:\.\d{3})*,\d{2}"

# Cota do Lançamento Administrativo: cota + venc + principal + multa + juros + total
AGENCIANET_COTA_ROW_RE = re.compile(
    rf"(?P<cota>\d{{2}})\s+"
    rf"(?P<venc>\d{{2}}/\d{{2}}/\d{{4}})\s+"
    rf"(?P<principal>{BRL_TOKEN_RE})\s+"
    rf"(?P<multa>{BRL_TOKEN_RE})\s+"
    rf"(?P<juros>{BRL_TOKEN_RE})\s+"
    rf"(?P<total>{BRL_TOKEN_RE})",
    re.I,
)

# Evita trechos de código de barras como “cota”
BARCODE_LINE_RE = re.compile(r"\d{12,}")


def detect_agencianet_layout(text: str) -> str | None:
    """consulta_debitos (grade) | lancamento_admin (DAR / Lançamento Administrativo)."""
    f = fold(text)
    if "lancamento administrativo" in f or (
        "documento de arrecadacao" in f
        and ("relacao de cotas" in f or "agencianet.fazenda.df" in f or "fazenda.df" in f)
    ):
        return "lancamento_admin"
    if (
        "exibir debitos" in f
        or "consulta de debitos" in f
        or "valor debito" in f
        or "certidao positiva - exibir debitos" in f
    ):
        return "consulta_debitos"
    if "agencianet" in f or "fazenda.df" in f:
        return "consulta_debitos"
    return None


def detect_content_tipo(text: str) -> tuple[str | None, bool]:
    """Infere ECAC|AGENCIANET|MUNICIPAL pelo conteúdo. Retorna (tipo, forte)."""
    f = fold(text)
    scores = {"ECAC": 0, "AGENCIANET": 0, "MUNICIPAL": 0}

    if "receita federal" in f:
        scores["ECAC"] += 3
    if "fazenda nacional" in f:
        scores["ECAC"] += 2
    if "diagnostico fiscal" in f or "diagnostico fiscal na receita" in f:
        scores["ECAC"] += 3
    if "dctfweb" in f or "sief" in f:
        scores["ECAC"] += 1
    if "pendencia - debito" in f:
        scores["ECAC"] += 1

    if "lancamento administrativo" in f:
        scores["AGENCIANET"] += 4
    if "documento de arrecadacao" in f:
        scores["AGENCIANET"] += 3
    if "agencianet" in f or "agenci@net" in f:
        scores["AGENCIANET"] += 3
    if "fazenda.df" in f or "secretaria de fazenda do distrito federal" in f:
        scores["AGENCIANET"] += 2
    if "exibir debitos" in f or "consulta de debitos" in f:
        scores["AGENCIANET"] += 2
    if "relacao de cotas" in f:
        scores["AGENCIANET"] += 2

    if "prefeitura" in f or "secretaria municipal" in f:
        scores["MUNICIPAL"] += 3
    if "extrato de divida ativa" in f or "tributos municipais" in f:
        scores["MUNICIPAL"] += 2
    if "guias de parcelamento" in f or "extrato de parcelamento" in f:
        scores["MUNICIPAL"] += 4
    if "municipio de itajai" in f or (
        "guia de recolhimento" in f and "demonstrativo de debitos" in f
    ):
        scores["MUNICIPAL"] += 4
    if "portal do cidadao" in f or "balneario camboriu" in f or "prefeituraunai" in f:
        scores["MUNICIPAL"] += 3

    best = max(scores, key=lambda key: scores[key])
    if scores[best] == 0:
        return None, False
    # Empate: não forçar
    ordered = sorted(scores.values(), reverse=True)
    if len(ordered) > 1 and ordered[0] == ordered[1]:
        return None, False
    forte = scores[best] >= 3
    return best, forte


def _agencianet_header_fields(text: str) -> dict[str, str]:
    """Campos de cabeçalho do Lançamento Administrativo / DAR."""
    f = fold(text)
    out: dict[str, str] = {}

    # Preferir linha abaixo do rótulo (texto PDF com quebras)
    m = re.search(
        r"nome\s+da\s+receita\s*[:\n\r\u200b]*\s*(\d{3,6}\s*-\s*[^\n\r]+)",
        text,
        re.I,
    )
    if m:
        out["receita"] = re.sub(r"\s+", " ", m.group(1)).strip().upper()
    else:
        m = re.search(
            r"nome da receita\s+(\d{3,6}\s*-\s*[a-z0-9 /.*%-]{3,60}?)(?=\s+(?:n |no |numero |periodo |quantidade |data ))",
            f,
            re.I,
        )
        if m:
            out["receita"] = re.sub(r"\s+", " ", m.group(1)).strip().upper()
        else:
            m2 = re.search(r"codigo da receita\s+(\d{3,6})", f, re.I)
            m3 = re.search(
                r"especificacao da receita\s+([a-z0-9 /.*%-]{3,60}?)(?=\s+(?:\d{2}\s+|nome |cpf|endereco)|$)",
                f,
                re.I,
            )
            if m2 and m3:
                nome = re.sub(r"\s+", " ", m3.group(1)).strip().upper()
                out["receita"] = f"{m2.group(1)} - {nome}"
            elif m2:
                out["receita"] = m2.group(1)

    m = re.search(
        r"(?:n[ºo°]?|no|numero)\s*lancamento\s*[:\n\r\u200b]*\s*(\d{6,14})",
        text,
        re.I,
    )
    if not m:
        m = re.search(r"(?:n |no |numero )\s*lancamento\s+(\d{6,14})", f, re.I)
    if m:
        out["numero_lancamento"] = m.group(1)

    m = re.search(
        r"periodo\s*\(?\s*mes\s*/\s*ano\s*\)?\s*[:\n\r\u200b]*\s*(\d{2}/\d{4}\s*a\s*\d{2}/\d{4})",
        text,
        re.I,
    )
    if not m:
        m = re.search(
            r"periodo(?:\s*\(?\s*mes\s*/\s*ano\s*\)?|\s*:)\s*(\d{2}/\d{4}\s*a\s*\d{2}/\d{4})",
            f,
            re.I,
        )
    if m:
        out["pa"] = re.sub(r"\s+", " ", m.group(1)).strip()
    return out


def parse_agencianet_lancamento(text: str, origem: str, arquivo: str) -> list[dict]:
    """Extrai débitos do Lançamento Administrativo / DAR (SEFAZ-DF)."""
    f = fold(text)
    codigo = codigo_from_filename(arquivo)
    header = _agencianet_header_fields(text)
    receita = header.get("receita") or "TRIBUTO ESTADUAL"
    numero = header.get("numero_lancamento") or ""
    pa = header.get("pa") or ""
    rows: list[dict] = []
    seen: set[tuple] = set()

    # Preferir RELAÇÃO DE COTAS
    for match in AGENCIANET_COTA_ROW_RE.finditer(f):
        # Descarta se o “match” incluir pedaço de código de barras
        span = match.group(0)
        if BARCODE_LINE_RE.search(span.replace(" ", "")) and len(re.sub(r"\D", "", span)) > 24:
            continue
        principal = parse_brl(match.group("principal"))
        multa = parse_brl(match.group("multa"))
        juros = parse_brl(match.group("juros"))
        total = parse_brl(match.group("total"))
        venc = match.group("venc")
        if total <= 0 and principal <= 0:
            continue
        # SIT. “00” + data “pagar até” às vezes segue; não é segunda cota sem valores BRL
        key = (numero or match.group("cota"), venc, round(total, 2))
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            _make_debito_row(
                receita=receita,
                pa=pa or venc[-4:] if venc else "",
                vencimento=venc,
                original=principal,
                saldo=principal,
                multa=multa,
                juros=juros,
                consolidado=total if total > 0 else round(principal + multa + juros, 2),
                situacao="DEVEDOR",
                origem=origem,
                arquivo=arquivo,
                codigo=codigo,
                esfera="estadual",
                numero_lancamento=numero or None,
            )
        )

    if rows:
        return rows

    # Fallback campos DAR numerados
    def field_brl(label: str) -> float | None:
        m = re.search(rf"{label}\s+({BRL_TOKEN_RE})", f, re.I)
        if not m:
            return None
        return parse_brl(m.group(1))

    principal = field_brl(r"(?:13\s+)?principal") or field_brl(r"valor original da cota")
    multa = field_brl(r"(?:14\s+)?multa") or 0.0
    juros = field_brl(r"(?:15\s+)?juro(?:s)?(?:\s+de\s+mora)?") or 0.0
    total = field_brl(r"(?:17\s+)?valor total")
    venc_m = re.search(
        rf"(?:04\s+)?data\s+(?:do\s+)?vencimento\s+(\d{{2}}/\d{{2}}/\d{{4}})",
        f,
        re.I,
    )
    venc = venc_m.group(1) if venc_m else ""
    if principal is None and total is None:
        return []
    if principal is None:
        principal = 0.0
    if total is None:
        total = round(principal + (multa or 0) + (juros or 0), 2)
    if total <= 0 and principal <= 0:
        return []
    rows.append(
        _make_debito_row(
            receita=receita,
            pa=pa or (venc[-4:] if venc else ""),
            vencimento=venc,
            original=principal,
            saldo=principal,
            multa=multa or 0.0,
            juros=juros or 0.0,
            consolidado=total,
            situacao="DEVEDOR",
            origem=origem,
            arquivo=arquivo,
            codigo=codigo,
            esfera="estadual",
            numero_lancamento=numero or None,
        )
    )
    return rows


def _peel_qpa_valor(tail: str) -> str | None:
    """Separa QPA colado (ex. 21324,47 → 1324,47)."""
    raw = (tail or "").strip()
    if not raw:
        return None
    match = re.search(
        r"^(?P<head>\d*?)(?P<body>\d{1,3}(?:\.\d{3})+|\d{1,4}),(?P<dec>\d{2})$",
        raw,
    )
    if not match:
        return raw if re.fullmatch(r"\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}", raw) else None
    return f"{match.group('body')},{match.group('dec')}"


def _append_agencianet_consulta_row(
    *,
    rows: list[dict],
    seen: set[tuple],
    insc: str,
    ano: str,
    receita_code: str,
    tributo: str,
    valor: float,
    origem: str,
    arquivo: str,
    codigo: str,
) -> None:
    tributo_fold = fold(tributo)
    if tributo_fold in {"listar", "imprimir", "dar", "qpa", "situacao", "valor debito"}:
        return
    if insc.isdigit() and len(insc) == 14:
        return
    key = (insc, ano, receita_code, tributo_fold, valor)
    if key in seen:
        return
    seen.add(key)
    rows.append(
        _make_debito_row(
            receita=f"{receita_code} - {tributo.upper()}",
            pa=ano,
            vencimento="",
            original=valor,
            saldo=valor,
            multa=0.0,
            juros=0.0,
            consolidado=valor,
            situacao="DEVEDOR" if valor > 0 else "INDEFINIDO",
            origem=origem,
            arquivo=arquivo,
            codigo=codigo,
            esfera="estadual",
            inscricao=insc,
            numero_lancamento=insc,
        )
    )


def parse_agencianet_consulta(text: str, origem: str, arquivo: str) -> list[dict]:
    """Grade clássica Agenci@Net (inscrição / ano / receita / tributo / valor)."""
    f = fold(text)
    codigo = codigo_from_filename(arquivo)
    rows: list[dict] = []
    seen: set[tuple] = set()
    for match in AGENCIANET_ROW_RE.finditer(f):
        valor_raw = match.group("valor")
        valor = 0.0 if valor_raw == "00" else parse_brl(valor_raw)
        _append_agencianet_consulta_row(
            rows=rows,
            seen=seen,
            insc=match.group("insc").upper(),
            ano=match.group("ano"),
            receita_code=match.group("receita"),
            tributo=re.sub(r"\s+", " ", match.group("tributo")).strip(),
            valor=valor,
            origem=origem,
            arquivo=arquivo,
            codigo=codigo,
        )
    if not rows:
        glued = re.sub(r"\s+", "", f)
        for match in AGENCIANET_ROW_GLUED_RE.finditer(glued):
            valor_raw = _peel_qpa_valor(match.group("tail"))
            if not valor_raw:
                continue
            _append_agencianet_consulta_row(
                rows=rows,
                seen=seen,
                insc=match.group("insc").upper(),
                ano=match.group("ano"),
                receita_code=match.group("receita"),
                tributo=match.group("tributo"),
                valor=parse_brl(valor_raw),
                origem=origem,
                arquivo=arquivo,
                codigo=codigo,
            )
    rows.extend(_parse_agencianet_avencer(text, origem, arquivo, seen, codigo))
    return rows


def _seen_has_positive_insc_ano(seen: set[tuple], insc: str, ano: str) -> bool:
    """True se a grade clássica já capturou a mesma inscrição+ano com valor > 0."""
    for item in seen:
        if len(item) < 5:
            continue
        if item[0] == insc and item[1] == ano and float(item[4] or 0) > 0:
            return True
    return False


def _parse_agencianet_avencer(
    text: str,
    origem: str,
    arquivo: str,
    seen: set[tuple],
    codigo: str,
) -> list[dict]:
    """Bloco A VENCER: inscrição/ano/descrição/código, sem valor BRL na tela.

    Só parseia tabela própria (Identificação + Código de Receita).
    Ignora páginas cujo título fala em A VENCER mas a grade ainda é clássica
    (Tributo / Valor Débito) — evita fantasmas que engolem a inscrição vizinha.
    """
    f = fold(text)
    rows: list[dict] = []
    for block in re.finditer(
        r"d\s*e?\s*bito\(s\)\s+a vencer.*?(?=consta\(|clique no botao voltar|$)",
        f,
        re.S | re.I,
    ):
        chunk = block.group(0)
        # Cabeçalho da tabela A VENCER (não da grade clássica).
        if "identificacao" not in chunk or "codigo de receita" not in chunk:
            continue
        # Grade clássica no mesmo chunk → não inventar A VENCER zerado.
        if "valor debito" in chunk or re.search(r"\btributo\b", chunk):
            continue
        for match in AGENCIANET_AVENCER_RE.finditer(chunk):
            desc = re.sub(r"\s+", " ", match.group("desc")).strip()
            if fold(desc) in {
                "identificacao",
                "descricao",
                "codigo de receita",
                "ano",
            }:
                continue
            insc = match.group("insc").upper()
            ano = match.group("ano")
            receita_code = match.group("receita")
            if _seen_has_positive_insc_ano(seen, insc, ano):
                continue
            key = (insc, ano, receita_code, fold(desc), 0.0)
            if key in seen:
                continue
            seen.add(key)
            receita = f"{receita_code} - {desc.upper()}"
            rows.append(
                _make_debito_row(
                    receita=receita,
                    pa=ano,
                    vencimento="",
                    original=0.0,
                    saldo=0.0,
                    multa=0.0,
                    juros=0.0,
                    consolidado=0.0,
                    situacao="A VENCER",
                    origem=origem,
                    arquivo=arquivo,
                    codigo=codigo,
                    esfera="estadual",
                    inscricao=insc,
                    numero_lancamento=insc,
                )
            )
    return rows


def parse_agencianet_debitos(text: str, origem: str, arquivo: str) -> list[dict]:
    """Extrai linhas Agenci@Net (consulta clássica ou Lançamento Administrativo/DAR)."""
    layout = detect_agencianet_layout(text)
    if layout == "lancamento_admin":
        rows = parse_agencianet_lancamento(text, origem, arquivo)
        if rows:
            return rows
    rows = parse_agencianet_consulta(text, origem, arquivo)
    if rows:
        return rows
    # Última tentativa: layout admin mesmo sem keyword forte
    if layout != "consulta_debitos":
        rows = parse_agencianet_lancamento(text, origem, arquivo)
        if rows:
            return rows
    return _agencianet_bloco_sem_grade(text, origem, arquivo)


def _agencianet_bloco_sem_grade(text: str, origem: str, arquivo: str) -> list[dict]:
    """Consulta com 'seguinte(s) débito(s)' mas grade ilegível no CID: marca pendência sem inventar BRL."""
    f = fold(text)
    tem_bloco = "seguinte(s) debito(s)" in f or re.search(r"seguinte\(s\)\s+d\s*e?\s*bito", f)
    if not tem_bloco:
        return []
    if "parcelamento" in f:
        situacao = "PARCELADO"
        receita = "PARCELAMENTO ESTADUAL"
    elif re.search(r"d\s*e?\s*bito\(s\)\s+a vencer", f) or "a vencer" in f:
        situacao = "A VENCER"
        receita = "DEBITO ESTADUAL A VENCER"
    else:
        situacao = "DEVEDOR"
        receita = "DEBITO ESTADUAL"
    codigo = codigo_from_filename(arquivo)
    return [
        _make_debito_row(
            receita=receita,
            pa="",
            vencimento="",
            original=0.0,
            saldo=0.0,
            multa=0.0,
            juros=0.0,
            consolidado=0.0,
            situacao=situacao,
            origem=origem,
            arquivo=arquivo,
            codigo=codigo,
            esfera="estadual",
        )
    ]


# Portal do Cidadão (Balneário Camboriú): TRIBUTO \n ANO \n R$ valor
BC_PORTAL_ROW_RE = re.compile(
    r"(?P<tributo>(?:TVS-REN|TLF|TLL|TAS|IPTU|ISS|ISSQN|ITBI|"
    r"TAXA\s+[A-ZÁ-Úa-zá-ú0-9 /.*%-]{2,50}|"
    r"[A-Z][A-Z0-9Á-Ú/-]{2,40}))\s*\n\s*"
    r"(?P<ano>20\d{2})\s*\n\s*"
    r"R\$\s*(?P<valor>\d{1,3}(?:\.\d{3})*,\d{2})",
    re.I | re.M,
)

# Unaí — Extrato de Dívida Ativa (texto linearizado)
UNAI_DIVIDA_ROW_RE = re.compile(
    r"(?P<ref>20\d{2})\s+"
    r"(?P<titulo>\d+/\d{4})\s+"
    r"(?P<origem>[a-z0-9Á-ú ./-]{3,60}?)\s+"
    r"(?P<parcela>unica|\d+/\d+)\s+"
    r"(?P<data>\d{2}-\d{2}(?:-\d{4})?)\s+"
    r"(?P<sit>inc|abe|qui|par|sus|[a-z]{2,5})\s+"
    r"(?P<inscrito>\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s+"
    r"(?P<calculado>\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})",
    re.I,
)

# Unaí — Guias de Parcelamento da Dívida Ativa
# Ex.: Unica-04-09-2026-275,49275,49  ou  1/12-04-09-2026-100,00 100,00
UNAI_PARCELA_ROW_RE = re.compile(
    r"(?P<parcela>unica|\d+\s*/\s*\d+|[^\W\d_]?nica)\s*[-–]?\s*"
    r"(?P<data>\d{2}-\d{2}-\d{4})\s*[-–]?\s*"
    r"(?P<vparcela>\d{1,3}(?:\.\d{3})*,\d{2})\s*"
    r"(?P<vtotal>\d{1,3}(?:\.\d{3})*,\d{2})?",
    re.I,
)
UNAI_GUIA_RE = re.compile(
    r"Guia\s+(?P<guia>\d+/\d{4})\s+"
    r"(?P<origem>[A-Za-zÁ-ú0-9][A-Za-zÁ-ú0-9 ./-]{1,40}?)"
    r"\s*\[\s*Refer[^:\]]*:\s*(?P<ref>20\d{2})\s*\]",
    re.I,
)
UNAI_GUIA_LOOSE_RE = re.compile(
    r"Guia\s+(?P<guia>\d+/\d{4})\s+(?P<origem>DIV\.?\s*ATIV\.?|[A-Za-zÁ-ú0-9./-]{3,30})",
    re.I,
)

# Itajaí — Guia de recolhimento / Demonstrativo de débitos
ITAJAI_TOTAL_GERAL_RE = re.compile(
    r"TOTAL\s+GERAL\s+"
    r"(?P<original>\d{1,3}(?:\.\d{3})*,\d{2})\s+"
    r"(?P<hon>\d{1,3}(?:\.\d{3})*,\d{2})\s+"
    r"(?P<corr>\d{1,3}(?:\.\d{3})*,\d{2})\s+"
    r"(?P<juros>\d{1,3}(?:\.\d{3})*,\d{2})\s+"
    r"(?P<multa>\d{1,3}(?:\.\d{3})*,\d{2})\s+"
    r"(?P<consolidado>\d{1,3}(?:\.\d{3})*,\d{2})",
    re.I,
)
# Linha do demonstrativo: Exerc. Parc. Vencimento Original Hon Corr Juros Multa Corrigido
ITAJAI_DEMO_ROW_RE = re.compile(
    r"(?P<exerc>20\d{2})\s+"
    r"(?P<parc>\d{1,3})\s+"
    r"(?P<venc>\d{2}/\d{2}/\d{4})\s+"
    r"(?P<original>\d{1,3}(?:\.\d{3})*,\d{2})\s+"
    r"(?P<hon>\d{1,3}(?:\.\d{3})*,\d{2})\s+"
    r"(?P<corr>\d{1,3}(?:\.\d{3})*,\d{2})\s+"
    r"(?P<juros>\d{1,3}(?:\.\d{3})*,\d{2})\s+"
    r"(?P<multa>\d{1,3}(?:\.\d{3})*,\d{2})\s+"
    r"(?P<consolidado>\d{1,3}(?:\.\d{3})*,\d{2})",
    re.I,
)
ITAJAI_VALOR_COBRADO_RE = re.compile(
    r"\(=\)\s*VALOR\s+COBRADO\s+(\d{1,3}(?:\.\d{3})*,\d{2})",
    re.I,
)
ITAJAI_DIVIDA_RE = re.compile(r"D[ií]vida\s*:\s*([^\n\r]+)", re.I)
ITAJAI_TRIBUTO_RS_RE = re.compile(
    r"([A-ZÁ-Ú][A-ZÁ-Ú0-9 /().-]{3,80}?)\s*:\s*R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})",
    re.I,
)

BC_SKIP_TRIBUTOS = {
    "portal",
    "consulta",
    "pesquisar",
    "economico",
    "vencimento",
    "total",
    "guia",
    "carne",
    "prefeitura",
}


def detect_municipal_layout(text: str) -> str | None:
    f = fold(text)
    # Só "Guias/Extrato de Parcelamento" (não "Tipo: PARCELAMENTO WEB" do extrato de dívida)
    if "guias de parcelamento" in f or "extrato de parcelamento" in f:
        return "unai_parcelamento"
    if (
        "extrato de divida ativa" in f
        or "prefeituraunai" in f
        or ("portalcidadao" in f and "unai" in f)
    ):
        return "unai_divida"
    if (
        "municipio de itajai" in f
        or ("guia de recolhimento" in f and "demonstrativo de debitos" in f)
        or ("itajai" in f and "guia de recolhimento" in f)
        or ("itajai" in f and "valor cobrado" in f)
        or ("itajai" in f and "taxa de licenca" in f)
    ):
        return "itajai_guia"
    if (
        "portal do cidadao" in f
        or "balneario camboriu" in f
        or "cidadao.bc.sc.gov.br" in f
        or "parcela(s) em aberto" in f
    ):
        return "bc_portal"
    if "prefeitura" in f and "consulta de debitos" in f:
        return "bc_portal"
    return None


def parse_municipal_bc_portal(text: str, arquivo: str) -> list[dict]:
    """Layout Balneário Camboriú — Portal do Cidadão."""
    codigo = codigo_from_filename(arquivo)
    rows: list[dict] = []
    seen: set[tuple] = set()
    venc_match = re.search(r"Vencimento\s*\n?\s*(\d{2}/\d{2}/\d{4})", text, re.I)
    vencimento = venc_match.group(1) if venc_match else ""

    for match in BC_PORTAL_ROW_RE.finditer(text):
        tributo = re.sub(r"\s+", " ", match.group("tributo")).strip()
        if fold(tributo).split()[0] in BC_SKIP_TRIBUTOS:
            continue
        if fold(tributo) in BC_SKIP_TRIBUTOS:
            continue
        ano = match.group("ano")
        valor = parse_brl(match.group("valor"))
        key = (fold(tributo), ano, valor)
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            _make_debito_row(
                receita=tributo.upper(),
                pa=ano,
                vencimento=vencimento,
                original=valor,
                saldo=valor,
                multa=0.0,
                juros=0.0,
                consolidado=valor,
                situacao="DEVEDOR" if valor > 0 else "INDEFINIDO",
                origem="MUNICIPAL",
                arquivo=arquivo,
                codigo=codigo,
                esfera="municipal",
            )
        )
    return rows


def parse_municipal_unai_divida(text: str, arquivo: str) -> list[dict]:
    """Layout Unaí-MG — Extrato de Dívida Ativa."""
    codigo = codigo_from_filename(arquivo)
    f = fold(text)
    # Normaliza quebras quebradas tipo "28-02-\n2025"
    f = re.sub(r"(\d{2}-\d{2})-\s*(\d{4})", r"\1-\2", f)
    f = re.sub(r"(expediente|tas|tlfl)-\s*", r"\1-", f)
    rows: list[dict] = []
    seen: set[tuple] = set()
    for match in UNAI_DIVIDA_ROW_RE.finditer(f):
        origem = re.sub(r"\s+", " ", match.group("origem")).strip().upper()
        if origem in {"REFERENCIA", "TITULO", "ORIGEM", "PARCELA"}:
            continue
        inscrito = parse_brl(match.group("inscrito"))
        calculado = parse_brl(match.group("calculado"))
        titulo = match.group("titulo")
        ref = match.group("ref")
        data_raw = match.group("data")
        if re.match(r"^\d{2}-\d{2}-\d{4}$", data_raw):
            d, m, y = data_raw.split("-")
            vencimento = f"{d}/{m}/{y}"
        else:
            vencimento = data_raw
        key = (titulo, fold(origem), calculado)
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            _make_debito_row(
                receita=origem,
                pa=ref,
                vencimento=vencimento,
                original=inscrito,
                saldo=calculado,
                multa=0.0,
                juros=0.0,
                consolidado=calculado,
                situacao=match.group("sit").upper(),
                origem="MUNICIPAL",
                arquivo=arquivo,
                codigo=codigo,
                esfera="municipal",
                numero_lancamento=titulo,
            )
        )
    return rows


def parse_municipal_unai_parcelamento(text: str, arquivo: str) -> list[dict]:
    """Layout Unaí-MG — Guias / Extrato de Parcelamento da Dívida Ativa."""
    codigo = codigo_from_filename(arquivo)
    # Texto contínuo do decoder CID (sem espaços entre Tj) facilita o match
    compact = re.sub(r"\s+", " ", text)
    f = fold(compact)

    guia_m = UNAI_GUIA_RE.search(compact) or UNAI_GUIA_RE.search(text)
    if not guia_m:
        guia_m = UNAI_GUIA_LOOSE_RE.search(compact) or UNAI_GUIA_LOOSE_RE.search(text)
    guia = guia_m.group("guia") if guia_m else ""
    origem_raw = (guia_m.group("origem") if guia_m else "DIV.ATIV.").strip()
    origem = re.sub(r"\s+", " ", origem_raw).strip() or "DIV.ATIV."
    if re.match(r"(?i)div\.?\s*ativ\.?", origem):
        origem = "DIV.ATIV."
    ref = ""
    if guia_m and "ref" in guia_m.re.groupindex and guia_m.group("ref"):
        ref = guia_m.group("ref")
    if not ref:
        ref_m = re.search(r"refer\w*\s*:\s*(20\d{2})", f, re.I)
        ref = ref_m.group(1) if ref_m else ""

    rows: list[dict] = []
    seen: set[tuple] = set()
    # Preferir texto original (mantém vírgulas BRL); fold só para achar ínica→nica
    search_blob = compact
    # Normaliza glifo quebrado de Única (ïnica / nica após fold parcial)
    search_blob = re.sub(r"(?i)[^\W\d_]?nica\b", "Unica", search_blob)

    for match in UNAI_PARCELA_ROW_RE.finditer(search_blob):
        parcela = re.sub(r"\s+", "", match.group("parcela")).strip()
        if fold(parcela) in {"parcela", "vencimento"}:
            continue
        if re.search(r"nica$", fold(parcela)) and not re.match(r"(?i)unica", parcela):
            parcela = "Unica"
        data_raw = match.group("data")
        d, m, y = data_raw.split("-")
        vencimento = f"{d}/{m}/{y}"
        vparcela = parse_brl(match.group("vparcela"))
        vtotal_raw = match.group("vtotal")
        vtotal = parse_brl(vtotal_raw) if vtotal_raw else vparcela
        if vparcela <= 0 and vtotal <= 0:
            continue
        valor = vtotal if vtotal > 0 else vparcela
        key = (guia or parcela, vencimento, round(valor, 2))
        if key in seen:
            continue
        seen.add(key)
        receita = f"{origem} · PARCELA {parcela.upper()}"
        if guia:
            receita = f"GUIA {guia} · {receita}"
        rows.append(
            _make_debito_row(
                receita=receita,
                pa=ref or y,
                vencimento=vencimento,
                original=valor,
                saldo=valor,
                multa=0.0,
                juros=0.0,
                consolidado=valor,
                situacao="PARCELADO",
                origem="MUNICIPAL",
                arquivo=arquivo,
                codigo=codigo,
                esfera="municipal",
                numero_lancamento=guia or parcela,
            )
        )
    return rows


def parse_municipal_itajai_guia(text: str, arquivo: str) -> list[dict]:
    """Layout Itajaí-SC — Guia de recolhimento / Demonstrativo de débitos."""
    codigo = codigo_from_filename(arquivo)
    # PDF costuma vir duplicado (2 vias); usa a 1ª metade para campos únicos
    count_itajai = len(re.findall(r"MUNIC[IÍ]PIO\s+DE\s+ITAJAI", text, re.I))
    half = text[: max(len(text) // 2, 1)] if count_itajai > 1 else text

    divida_m = ITAJAI_DIVIDA_RE.search(half) or ITAJAI_DIVIDA_RE.search(text)
    receita = (
        re.sub(r"\s+", " ", divida_m.group(1)).strip().strip("- ")
        if divida_m
        else "GUIA DE RECOLHIMENTO ITAJAI"
    )

    original = multa = juros = consolidado = 0.0
    numero = ""
    vencimento = ""
    pa = ""

    # 1) Linha do demonstrativo (mais fiel ao layout impresso)
    demo = ITAJAI_DEMO_ROW_RE.search(half) or ITAJAI_DEMO_ROW_RE.search(text)
    if demo:
        pa = demo.group("exerc")
        numero = demo.group("parc")
        vencimento = demo.group("venc")
        original = parse_brl(demo.group("original"))
        juros = parse_brl(demo.group("juros"))
        multa = parse_brl(demo.group("multa"))
        consolidado = parse_brl(demo.group("consolidado"))

    # 2) TOTAL GERAL
    tot = ITAJAI_TOTAL_GERAL_RE.search(half) or ITAJAI_TOTAL_GERAL_RE.search(text)
    if tot:
        if original <= 0:
            original = parse_brl(tot.group("original"))
        if juros <= 0:
            juros = parse_brl(tot.group("juros"))
        if multa <= 0:
            multa = parse_brl(tot.group("multa"))
        if consolidado <= 0:
            consolidado = parse_brl(tot.group("consolidado"))

    # 3) Valor cobrado do boleto (oficial)
    cobrado_m = ITAJAI_VALOR_COBRADO_RE.search(half) or ITAJAI_VALOR_COBRADO_RE.search(text)
    if cobrado_m:
        consolidado = parse_brl(cobrado_m.group(1))

    if original <= 0:
        trib = ITAJAI_TRIBUTO_RS_RE.search(half) or ITAJAI_TRIBUTO_RS_RE.search(text)
        if trib:
            if not divida_m:
                receita = re.sub(r"\s+", " ", trib.group(1)).strip()
            original = parse_brl(trib.group(2))

    if consolidado <= 0 and original <= 0:
        return []
    if consolidado <= 0:
        consolidado = original + multa + juros
    if original <= 0:
        original = consolidado

    if not vencimento:
        venc_m = re.search(
            r"Data\s+vencimento\s*\n?\s*(\d{2}/\d{2}/\d{4})",
            half,
            re.I,
        ) or re.search(
            r"Data\s+vencimento\s*\n?\s*(\d{2}/\d{2}/\d{4})",
            text,
            re.I,
        )
        vencimento = venc_m.group(1) if venc_m else ""

    if not pa:
        ano_m = re.search(r"\bAno\s*\n?\s*(20\d{2})\b", half, re.I) or re.search(
            r"\bAno\s*\n?\s*(20\d{2})\b", text, re.I
        )
        pa = ano_m.group(1) if ano_m else (vencimento[-4:] if vencimento else "")

    if not numero:
        parc_m = re.search(
            r"(?:Parc\.?|N[ºo]\s*termo)\s*.{0,80}?\b(\d{1,3})\b",
            half,
            re.I | re.S,
        )
        numero = parc_m.group(1) if parc_m else ""

    return [
        _make_debito_row(
            receita=receita.upper(),
            pa=pa,
            vencimento=vencimento,
            original=original,
            saldo=original,
            multa=multa,
            juros=juros,
            consolidado=consolidado,
            situacao="DEVEDOR" if consolidado > 0 else "INDEFINIDO",
            origem="MUNICIPAL",
            arquivo=arquivo,
            codigo=codigo,
            esfera="municipal",
            numero_lancamento=numero or None,
        )
    ]


def parse_municipal_debitos(text: str, arquivo: str) -> tuple[list[dict], str | None, list[str]]:
    """Retorna (linhas, layout, avisos)."""
    avisos: list[str] = []
    layout = detect_municipal_layout(text)
    if layout == "bc_portal":
        rows = parse_municipal_bc_portal(text, arquivo)
    elif layout == "unai_parcelamento":
        rows = parse_municipal_unai_parcelamento(text, arquivo)
    elif layout == "itajai_guia":
        rows = parse_municipal_itajai_guia(text, arquivo)
    elif layout == "unai_divida":
        rows = parse_municipal_unai_divida(text, arquivo)
        # Fallback: alguns PDFs Unaí só têm guia de parcelamento
        if not rows:
            rows_parc = parse_municipal_unai_parcelamento(text, arquivo)
            if rows_parc:
                rows = rows_parc
                layout = "unai_parcelamento"
    else:
        avisos.append(
            "layout municipal não reconhecido (BC/Unaí/Itajaí) — revisar PDF"
        )
        rows = []
    if layout and not rows:
        avisos.append(f"layout {layout} detectado mas sem linhas extraídas")
    return rows, layout, avisos


def make_documento(
    *,
    arquivo: str,
    esfera: str,
    origem_label: str,
    status_doc: str,
    debitos: list[dict],
    cadastro: dict | None = None,
) -> dict:
    doc = {
        "arquivo": arquivo,
        "codigo": codigo_from_filename(arquivo),
        "esfera": esfera,
        "origemLabel": origem_label,
        "statusDoc": status_doc,
        "debitos": debitos,
        "totais": sum_totais(debitos),
    }
    if cadastro:
        doc["cadastro"] = cadastro
    return doc


def extract_documentos_from_pdf(
    *,
    pdf_name: str,
    text: str,
    pasta_status: str,
    path: Path | None = None,
) -> tuple[list[dict], list[str]]:
    """Um PDF → uma esfera, conforme a fonte (ECAC / Agenci@Net / Prefeitura)."""
    label = origem_label(pdf_name)
    esfera = classify_esfera(pdf_name, text)
    classe, found_tipos = classify_text(text)

    if esfera == "estadual":
        rows = parse_agencianet_debitos(text, label if label != "OUTRO" else "AGENCIANET", pdf_name)
        if not rows:
            rows = parse_ecac_debitos(
                text,
                label if label != "OUTRO" else "AGENCIANET",
                pdf_name,
                "estadual",
                path=path,
            )
            for row in rows:
                row["esfera"] = "estadual"
        origem = "AGENCIANET" if label == "OUTRO" else label
    elif esfera == "municipal":
        rows, _layout, mun_avisos = parse_municipal_debitos(text, pdf_name)
        _ = mun_avisos  # avisos sobem no ingest; rebuild só usa linhas
        origem = "MUNICIPAL"
        if rows and "TRIBUTO_MUNICIPAL" not in found_tipos:
            found_tipos = [*found_tipos, "TRIBUTO_MUNICIPAL"]
    else:
        # Receita Federal (ECAC)
        rows = parse_ecac_debitos(text, label if label != "OUTRO" else "ECAC", pdf_name, "federal", path=path)
        origem = "ECAC" if label == "OUTRO" else label

    cadastro = parse_ecac_apoio_certidao(text) if esfera == "federal" else {}

    return (
        [
            make_documento(
                arquivo=pdf_name,
                esfera=esfera,
                origem_label=origem,
                status_doc=status_doc_from_classe(pasta_status, classe, bool(rows)),
                debitos=rows,
                cadastro=cadastro or None,
            )
        ],
        found_tipos,
    )


def sum_totais(debitos: list[dict]) -> dict:
    keys = ("original", "saldo", "multa", "juros", "consolidado")
    return {key: round(sum(item[key] for item in debitos), 2) for key in keys}


def empty_esfera() -> dict:
    return {
        "qtdDocs": 0,
        "status": "sem_documento",
        "totais": dict(EMPTY_TOTAIS),
        "arquivos": [],
        "qtd_debitos": 0,
    }


def build_esferas(documentos: list[dict]) -> dict:
    esferas = {key: empty_esfera() for key in ESFERAS}
    for doc in documentos:
        esfera = doc["esfera"]
        bucket = esferas[esfera]
        bucket["qtdDocs"] += 1
        bucket["arquivos"].append(doc["arquivo"])
        bucket["qtd_debitos"] += len(doc["debitos"])
        for key, value in doc["totais"].items():
            bucket["totais"][key] = round(bucket["totais"][key] + value, 2)

    for esfera, bucket in esferas.items():
        if bucket["qtdDocs"] == 0:
            bucket["status"] = "sem_documento"
            continue
        # ECAC filial (ignorado) não define o status da esfera
        active = [
            doc
            for doc in documentos
            if doc["esfera"] == esfera and doc["statusDoc"] != "ignorado"
        ]
        if not active:
            bucket["status"] = "indeterminado"
        elif any(doc["statusDoc"] == "pendencia" for doc in active):
            bucket["status"] = "pendencia"
        elif all(doc["statusDoc"] == "regular" for doc in active):
            bucket["status"] = "regular"
        else:
            bucket["status"] = "indeterminado"
    return esferas


STATUS_FOLDER_TO_EMPRESA = {
    "pendencias": "pendencia",
    "sem_pendencias": "regular",
    "revisar": "indeterminado",
}
EMPRESA_STATUS_FOLDERS = frozenset(STATUS_FOLDER_TO_EMPRESA.keys())


def compute_totais_gerais(empresas: list[dict]) -> dict:
    return {
        "empresas": len(empresas),
        "com_pendencia": sum(1 for item in empresas if item["status"] == "pendencia"),
        "regulares": sum(1 for item in empresas if item["status"] == "regular"),
        "saldo": round(sum(item["totais"]["saldo"] for item in empresas), 2),
        "consolidado": round(sum(item["totais"]["consolidado"] for item in empresas), 2),
        "docs_federal": sum(item["esferas"]["federal"]["qtdDocs"] for item in empresas),
        "docs_estadual": sum(item["esferas"]["estadual"]["qtdDocs"] for item in empresas),
        "docs_municipal": sum(item["esferas"]["municipal"]["qtdDocs"] for item in empresas),
    }


def _status_path_parts(value: str) -> list[str] | None:
    """Partes a partir da pasta de status (pendencias|sem_pendencias|revisar)."""
    rel = value.replace("\\", "/").strip()
    parts = [p for p in rel.split("/") if p]
    if parts and len(parts[0]) == 2 and parts[0][1] == ":":
        parts = parts[1:]
    idx = next(
        (i for i, part in enumerate(parts) if part.lower() in EMPRESA_STATUS_FOLDERS),
        None,
    )
    if idx is None or len(parts) < idx + 2:
        return None
    return parts[idx:]


def normalize_empresa_relpath(value: str) -> str | None:
    """`pendencias/EMPRESA` a partir de destino relativo ou path absoluto."""
    parts = _status_path_parts(value)
    if not parts:
        return None
    return f"{parts[0]}/{parts[1]}"


def empresa_relpath_from_destino(destino: str) -> str | None:
    return normalize_empresa_relpath(destino)


def _empresa_matches_relpath(empresa: dict, relpath: str) -> bool:
    rel = (normalize_empresa_relpath(relpath) or relpath).replace("\\", "/").strip("/").lower()
    pasta = str(empresa.get("pasta") or "").replace("\\", "/").lower()
    if not rel or not pasta:
        return False
    pasta_norm = pasta.strip("/")
    if f"/{rel}/" in f"/{pasta_norm}/":
        return True
    pasta_tail = "/".join(pasta_norm.split("/")[-2:])
    return pasta_tail == rel


def build_empresa_from_folder(
    folder: Path,
    *,
    status: str,
    competencia: str,
    used_ids: set[str],
    preserve_id: str | None = None,
) -> dict | None:
    """Monta uma empresa a partir da pasta no disco (parsers calibrados)."""
    pdfs = sorted(folder.glob("*.pdf"))
    if not pdfs:
        return None

    nome = folder.name
    cnpj: str | None = None
    cnpj_matriz: str | None = None
    codigo_ecac_matriz: str | None = None
    had_ecac_matriz = False
    tipos: list[str] = []
    debitos: list[dict] = []
    documentos: list[dict] = []
    arquivos: list[str] = []
    codigos: set[str] = set()
    avisos: list[str] = []
    parsed_pdfs: list[dict] = []

    for pdf in pdfs:
        label = origem_label(pdf.name)
        codigo = codigo_from_filename(pdf.name)
        codigos.add(codigo)
        text, _mode, text_avisos = resolve_pdf_text(pdf, label)
        avisos.extend(text_avisos)
        found_cnpj, found_nome = extract_company_from_pdf(pdf, text)
        parsed_pdfs.append(
            {
                "pdf": pdf,
                "label": label,
                "codigo": codigo,
                "text": text,
                "found_cnpj": found_cnpj,
                "found_nome": found_nome,
            }
        )
        if label == "ECAC" and found_cnpj and is_cnpj_matriz(found_cnpj):
            had_ecac_matriz = True
            codigo_ecac_matriz = codigo

    for item in parsed_pdfs:
        pdf = item["pdf"]
        label = item["label"]
        text = item["text"]
        found_cnpj = item["found_cnpj"]
        found_nome = item["found_nome"]

        if found_cnpj:
            if is_cnpj_matriz(found_cnpj):
                cnpj_matriz = found_cnpj
                cnpj = found_cnpj
            elif not cnpj or not is_cnpj_matriz(cnpj):
                if not cnpj:
                    cnpj = found_cnpj

        folder_is_generic = fold(nome).replace(" ", "_") in {
            "sem_nome",
            "semnome",
            "revisar",
        } or nome.strip().isdigit()
        if found_nome and folder_is_generic:
            nome = found_nome
        elif found_nome and not folder_is_generic:
            if fold(found_nome).startswith(fold(nome)[:12]) and len(found_nome) > len(nome) + 5:
                nome = found_nome

        skip_filial = (
            label == "ECAC"
            and is_cnpj_filial(found_cnpj)
            and had_ecac_matriz
        )
        if skip_filial:
            est = cnpj_estabelecimento(found_cnpj) or "?"
            avisos.append(
                f"ECAC filial ignorado nos totais ({pdf.name}, /{est}) — matriz /0001 já importada"
            )
            arquivos.append(pdf.name)
            documentos.append(
                make_documento(
                    arquivo=pdf.name,
                    esfera="federal",
                    origem_label=label,
                    status_doc="indeterminado",
                    debitos=[],
                    cadastro=parse_ecac_apoio_certidao(text) or None,
                )
            )
            continue

        if not text.strip():
            avisos.append(f"sem texto em {pdf.name}")

        arquivos.append(pdf.name)
        docs, found_tipos = extract_documentos_from_pdf(
            pdf_name=pdf.name,
            text=text,
            pasta_status=status,
            path=pdf,
        )
        for tipo in found_tipos:
            if tipo not in tipos:
                tipos.append(tipo)
        documentos.extend(docs)
        for doc in docs:
            debitos.extend(doc["debitos"])

    if debitos:
        avisos = [
            item
            for item in avisos
            if "OCR indisponível" not in item and "OCR sem texto" not in item
        ]

    if status == "pendencia" and not debitos and not tipos:
        tipos = ["PENDENCIA_SEM_VALORES_EXTRAIDOS"]
        avisos.append("valores não extraídos — abrir PDF")
    elif status == "pendencia" and not debitos:
        avisos.append("valores não extraídos — abrir PDF")
    elif status == "indeterminado":
        avisos.append("documento em revisar — conferir extração / layout")
        if not tipos:
            tipos = ["REVISAR"]

    empresa_status = status
    if status == "indeterminado":
        empresa_status = "pendencia"
    elif debitos and status == "regular":
        empresa_status = "pendencia"
        avisos.append("status elevado a pendencia — débitos extraídos do PDF")
    elif status == "regular":
        tipos = []

    esferas = build_esferas(documentos)
    codigos_sorted = sort_codigos(codigos)
    codigo_principal = (
        codigo_ecac_matriz
        or next(
            (codigo_from_filename(name) for name in arquivos if "ECAC" in name.upper()),
            None,
        )
        or (codigos_sorted[0] if codigos_sorted else "")
    )
    cnpj = cnpj_matriz or cnpj

    folder_dig = re.sub(r"\D", "", folder.name)
    cnpj_dig = re.sub(r"\D", "", cnpj or "")
    pasta_so_cnpj = folder.name.isdigit() or (
        bool(cnpj_dig) and folder_dig == cnpj_dig and len(folder_dig) == 14
    )
    if nome and not nome.strip().isdigit() and pasta_so_cnpj:
        safe = re.sub(r'[<>:"/\\|?*]', "_", nome).strip(" .")[:120]
        target = folder.parent / safe
        if safe and safe != folder.name and not target.exists():
            try:
                folder.rename(target)
                folder = target
            except OSError:
                pass

    empresa_id = preserve_id
    if not empresa_id:
        base_id = slugify(f"{codigo_principal}-{nome}" if codigo_principal else nome)
        empresa_id = base_id
        idx = 2
        while empresa_id in used_ids:
            empresa_id = f"{base_id}-{idx}"
            idx += 1
    used_ids.add(empresa_id)

    empresa = {
        "id": empresa_id,
        "nome": nome,
        "cnpj": cnpj,
        "codigo": codigo_principal,
        "codigos": codigos_sorted,
        "status": empresa_status,
        "tipos": tipos,
        "totais": sum_totais(debitos),
        "debitos": debitos,
        "documentos": documentos,
        "esferas": esferas,
        "temFederal": esferas["federal"]["qtdDocs"] > 0,
        "temEstadual": esferas["estadual"]["qtdDocs"] > 0,
        "temMunicipal": esferas["municipal"]["qtdDocs"] > 0,
        "arquivos": arquivos,
        "pasta": str(folder),
        "avisos": avisos,
        "qtd_debitos": len(debitos),
        "competencia": competencia,
    }
    print(
        f"[{competencia}] {empresa_status:10} [{codigo_principal:>4}] {nome[:36]:36} "
        f"F={esferas['federal']['qtdDocs']} "
        f"E={esferas['estadual']['qtdDocs']} "
        f"M={esferas['municipal']['qtdDocs']} "
        f"deb={len(debitos)}",
        file=sys.stderr,
    )
    return empresa


def apply_touch_relpaths_to_snapshot(
    month: Path,
    snap: dict,
    touch_relpaths: list[str],
    *,
    emit_event: Any | None = None,
) -> dict:
    """Atualiza só as pastas tocadas no snapshot existente do mês."""
    competencia = month.name
    empresas = list(snap.get("empresas") or [])
    used_ids = {str(e.get("id")) for e in empresas if e.get("id")}

    touches = []
    for raw in touch_relpaths:
        rel = normalize_empresa_relpath(raw)
        if rel and rel not in touches:
            touches.append(rel)

    total = len(touches)
    for idx, relpath in enumerate(touches):
        if emit_event:
            emit_event(
                {
                    "event": "rebuild",
                    "fase": "atualizando_painel",
                    "index": idx,
                    "total": total,
                    "nome": relpath.split("/")[-1],
                    "competencia": competencia,
                }
            )

        empresas = [e for e in empresas if not _empresa_matches_relpath(e, relpath)]
        preserve = next(
            (e.get("id") for e in (snap.get("empresas") or []) if _empresa_matches_relpath(e, relpath)),
            None,
        )

        parts = relpath.replace("\\", "/").split("/")
        status_folder = parts[0]
        empresa_folder = parts[1]
        status = STATUS_FOLDER_TO_EMPRESA.get(status_folder.lower(), "pendencia")
        folder = month / status_folder / empresa_folder
        if folder.is_dir():
            built = build_empresa_from_folder(
                folder,
                status=status,
                competencia=competencia,
                used_ids=used_ids,
                preserve_id=str(preserve) if preserve else None,
            )
            if built:
                empresas.append(built)

    empresas.sort(key=lambda item: (0 if item["status"] == "pendencia" else 1, item["nome"].upper()))
    return {
        "competencia": competencia,
        "gerado_em": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "pasta_mes": str(month),
        "totais_gerais": compute_totais_gerais(empresas),
        "empresas": empresas,
    }


def build_snapshot_for_month(month: Path) -> dict:
    """Monta o snapshot completo de uma competência (pasta MM-YYYY)."""
    competencia = month.name
    empresas: list[dict] = []
    used_ids: set[str] = set()

    for pasta_raiz, status in (
        ("pendencias", "pendencia"),
        ("sem_pendencias", "regular"),
        ("revisar", "indeterminado"),
    ):
        root = month / pasta_raiz
        if not root.exists():
            continue
        for folder in sorted(root.iterdir(), key=lambda item: item.name.lower()):
            if not folder.is_dir():
                continue
            built = build_empresa_from_folder(
                folder,
                status=status,
                competencia=competencia,
                used_ids=used_ids,
            )
            if built:
                empresas.append(built)

    empresas.sort(key=lambda item: (0 if item["status"] == "pendencia" else 1, item["nome"].upper()))

    return {
        "competencia": competencia,
        "gerado_em": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "pasta_mes": str(month),
        "totais_gerais": compute_totais_gerais(empresas),
        "empresas": empresas,
    }


def _atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    data = json.dumps(payload, ensure_ascii=False, indent=2)
    tmp.write_text(data, encoding="utf-8")
    tmp.replace(path)


def _load_existing_dashboard(out_json: Path) -> dict | None:
    if not out_json.exists():
        return None
    try:
        return json.loads(out_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"aviso: JSON existente ilegível ({exc})", file=sys.stderr)
        return None


def rebuild_dashboard(
    *,
    include_empty: bool = True,
    only_competencias: list[str] | None = None,
    touch_relpaths: list[str] | None = None,
    emit_event: Any | None = None,
) -> dict:
    """Regenera dashboard/data/empresas.json de forma atômica.

    Se only_competencias for informado, reprocessa só esses meses e preserva
    os demais snapshots já salvos no JSON.

    Com touch_relpaths (ex.: pendencias/EMPRESA), só reprocessa essas pastas
    no mês — upload/exclusão no servidor não relê 80+ empresas por PDF.
    """
    workspace = resolve_workspace_root()
    out_dir = workspace / "dashboard" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_json = out_dir / "empresas.json"

    months = list_competencia_dirs()
    if not months:
        months = [resolve_month_dir()]

    only_set = {c for c in (only_competencias or []) if COMPETENCIA_DIR_RE.match(c)}
    if only_set:
        months = [m for m in months if m.name in only_set]
        if not months:
            raise RuntimeError(
                f"Competência(s) não encontrada(s) para rebuild: {sorted(only_set)}"
            )

    touch_list = [
        rel
        for raw in (touch_relpaths or [])
        if (rel := normalize_empresa_relpath(raw))
    ]
    touch_list = list(dict.fromkeys(touch_list))

    snapshots: dict[str, dict] = {}
    existing = _load_existing_dashboard(out_json)
    if only_set or touch_list:
        if existing and isinstance(existing.get("snapshots"), dict):
            snapshots = dict(existing["snapshots"])

    for month in months:
        print(f"=== Competência {month.name} ===", file=sys.stderr)
        if touch_list:
            base = snapshots.get(month.name) or build_snapshot_for_month(month)
            snap = apply_touch_relpaths_to_snapshot(
                month,
                base,
                touch_list,
                emit_event=emit_event,
            )
        else:
            snap = build_snapshot_for_month(month)
        if not include_empty and not snap["empresas"]:
            snapshots.pop(month.name, None)
            continue
        snapshots[month.name] = snap

    if not snapshots:
        raise RuntimeError("Nenhuma competência para gerar o dashboard")

    def sort_key(name: str) -> tuple[int, int]:
        mes, ano = name.split("-")
        return (int(ano), int(mes))

    competencias = sorted(snapshots.keys(), key=sort_key)
    atual = competencias[-1]
    atual_snap = snapshots[atual]

    payload = {
        "gerado_em": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "competencias": competencias,
        "atual": atual,
        "snapshots": snapshots,
        "competencia": atual,
        "pasta_mes": atual_snap["pasta_mes"],
        "totais_gerais": atual_snap["totais_gerais"],
        "empresas": atual_snap["empresas"],
    }

    _atomic_write_json(out_json, payload)
    print("Salvo:", out_json, file=sys.stderr)

    ascii_out = Path.home() / "Downloads" / "debitos-dashboard" / "data" / "empresas.json"
    if ascii_out.parent.parent.exists():
        _atomic_write_json(ascii_out, payload)
        print("Salvo (ASCII):", ascii_out, file=sys.stderr)

    print("Competências:", competencias, file=sys.stderr)
    print("Atual:", atual, "Resumo:", atual_snap["totais_gerais"], file=sys.stderr)
    return payload


def main() -> int:
    rebuild_dashboard()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
