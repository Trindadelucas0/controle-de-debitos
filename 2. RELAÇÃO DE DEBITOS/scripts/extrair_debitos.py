#!/usr/bin/env python3
"""Extrai e classifica PDFs ECAC/AGENCIANET com consenso multi-modo."""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import sys
import unicodedata
import zlib
from collections import Counter
from dataclasses import asdict, dataclass, field
from itertools import combinations
from pathlib import Path
from typing import Any

MODES = (
    "pypdf",
    "pdfplumber",
    "pymupdf",
    "zlib_literals",
    "cid_utf16_interleaved",
    "cid_hex_shifted",
)
PAIR_COMBOS = list(combinations(MODES, 2))
TRIPLE_COMBOS = [
    ("pypdf", "pdfplumber", "pymupdf"),
    ("pypdf", "pymupdf", "zlib_literals"),
    ("pymupdf", "zlib_literals", "cid_utf16_interleaved"),
    ("pdfplumber", "pymupdf", "cid_utf16_interleaved"),
    ("cid_hex_shifted", "pymupdf", "zlib_literals"),
]
SCORE_THRESHOLD = 6
CONSENSUS_MIN = 2

# Pastas físicas (o que o usuário vê no Explorer)
FOLDER_BY_CLASSE = {
    "COM_PENDENCIA": "pendencias",
    "SEM_PENDENCIA": "sem_pendencias",
    "REVISAR": "revisar",
}
CLASS_FOLDERS = tuple(FOLDER_BY_CLASSE.values())


@dataclass
class ModeResult:
    mode: str
    text: str = ""
    score: int = 0
    classe: str = "REVISAR"
    tipos: list[str] = field(default_factory=list)
    cnpj: str | None = None
    empresa: str | None = None
    error: str | None = None


@dataclass
class FileVerdict:
    codigo: str
    arquivo: str
    tipo_doc: str
    path: str
    classe: str
    tipos: list[str]
    cnpj: str | None
    empresa: str | None
    modos_concordantes: list[str]
    combinacoes_validas: list[str]
    classes_por_modo: dict[str, str]
    scores_por_modo: dict[str, int]
    texto_fonte: str
    motivo: str


def resolve_workspace_root() -> Path:
    """Raiz: .../2. RELAÇÃO DE DEBITOS (onde ficam scripts/ e resultados/)."""
    here = Path(__file__).resolve().parent
    if here.name.lower() == "scripts":
        return here.parent
    # fallback: pasta do script ou Downloads
    downloads = Path.home() / "Downloads"
    roots = [p for p in downloads.iterdir() if p.is_dir() and "DEBIT" in p.name.upper()]
    if roots:
        return roots[0]
    return here


def resolve_output_dir() -> Path:
    out = resolve_workspace_root() / "resultados"
    out.mkdir(parents=True, exist_ok=True)
    return out


COMPETENCIA_DIR_RE = re.compile(r"^\d{2}-\d{4}$")
# Prefixo legado no NOME do arquivo: {Date.now()}_{index}_{nomeOriginal}.pdf
INBOX_UPLOAD_PREFIX_RE = re.compile(r"^(\d{10,})_(\d+)_(.+)$")
# API atual grava só {index}_{nomeOriginal}.pdf (timestamp fica na pasta do lote).
INBOX_INDEX_PREFIX_RE = re.compile(r"^(\d+)_(.+)$")
INBOX_TIPO_STEM_RE = re.compile(
    r"(?i)^(?:\d+_)*\d+-(ECAC|AGENCIANET|MUNICIPAL)(?:__\d+)?$"
)


def _is_inbox_upload_path(path: Path) -> bool:
    """Inbox temporário da API não é pasta oficial de competência."""
    return "inbox_upload" in {part.lower() for part in path.parts}


def list_competencia_dirs(root: Path | None = None) -> list[Path]:
    """Pastas MM-YYYY com PDFs ou estrutura de ingestão (ex.: 07-2026).

    Ignora resultados/inbox_upload — lá só ficam PDFs temporários do upload.
    """
    base = root or resolve_workspace_root()
    found: dict[str, Path] = {}
    for path in base.rglob("*"):
        if not path.is_dir() or not COMPETENCIA_DIR_RE.match(path.name):
            continue
        if _is_inbox_upload_path(path):
            continue
        pdf_count = sum(1 for _ in path.rglob("*.pdf"))
        has_structure = any(
            (path / sub).is_dir()
            for sub in ("pendencias", "sem_pendencias", "revisar", "inbox")
        )
        if pdf_count == 0 and not has_structure:
            continue
        prev = found.get(path.name)
        if prev is None:
            found[path.name] = path
            continue
        prev_count = sum(1 for _ in prev.rglob("*.pdf"))
        if pdf_count > prev_count:
            found[path.name] = path

    def sort_key(name: str) -> tuple[int, int]:
        mes, ano = name.split("-")
        return (int(ano), int(mes))

    return [found[name] for name in sorted(found.keys(), key=sort_key)]


def competencias_parent_dir() -> Path:
    """Pasta-pai onde ficam os diretórios MM-YYYY (nunca inbox_upload)."""
    months = list_competencia_dirs()
    if months:
        return months[-1].parent
    root = resolve_workspace_root()
    nested = [
        p
        for p in root.iterdir()
        if p.is_dir() and "DEBIT" in p.name.upper() and p.resolve() != root.resolve()
    ]
    if nested:
        return nested[0]
    return root


def ensure_competencia_dir(competencia: str) -> Path:
    """Garante pasta MM-YYYY com pendencias/sem_pendencias/revisar/inbox."""
    if not COMPETENCIA_DIR_RE.match(competencia):
        raise ValueError(f"Competência inválida (use MM-YYYY): {competencia}")

    for existing in list_competencia_dirs():
        if existing.name == competencia:
            month = existing
            break
    else:
        month = competencias_parent_dir() / competencia

    for sub in ("pendencias", "sem_pendencias", "revisar", "inbox"):
        (month / sub).mkdir(parents=True, exist_ok=True)
    return month


def resolve_month_dir(explicit: str | None = None) -> Path:
    if explicit:
        path = Path(explicit)
        if COMPETENCIA_DIR_RE.match(path.name) and not path.exists():
            return ensure_competencia_dir(path.name)
        if path.exists():
            return path
        if COMPETENCIA_DIR_RE.match(str(explicit)):
            return ensure_competencia_dir(str(explicit))
        raise FileNotFoundError(path)

    months = list_competencia_dirs()
    if months:
        # Preferir a competência mais recente
        return months[-1]

    raise FileNotFoundError("Nenhuma pasta de competência MM-YYYY encontrada no workspace")

def fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = "".join(ch if ord(ch) < 128 else " " for ch in text.lower())
    return re.sub(r"\s+", " ", text)


FISCAL_MARKERS = (
    "cnpj",
    "diagnostico fiscal",
    "pendencia",
    "omissao de",
    "sief",
    "sida",
    "receita federal",
    "certidao negativa",
    "certidao positiva",
    "nao constam debitos",
    "nao foram detectadas",
    "exigibilidade suspensa",
    "exibir debitos",
    "simples nac",
    "dctfweb",
    "prefeitura",
    "agencianet",
    "guia de recolhimento",
    "divida ativa",
    "portalcidadao",
    "prefeituraunai",
    "municipio de",
    "consulta de debitos",
    "lancamento administrativo",
    "documento de arrecadacao",
)


def has_fiscal_markers(text: str) -> bool:
    """True se o texto parece um documento fiscal legível (não lixo CID)."""
    if not text:
        return False
    f = fold(text)
    return any(marker in f for marker in FISCAL_MARKERS)


def printable_ratio(text: str) -> float:
    """Fração ASCII alfanumérica/espaço — CID lixo fica perto de 0."""
    if not text:
        return 0.0
    printable = sum(1 for ch in text if ch.isascii() and (ch.isalnum() or ch.isspace()))
    return printable / max(len(text), 1)


def text_is_cid_garbage(text: str) -> bool:
    """UTF-16/CID mal decodificado: longo, pouco ASCII, ou cheio de NUL."""
    if not text or not str(text).strip():
        return False
    n = len(text)
    if text.count("\x00") / n > 0.05:
        return True
    return printable_ratio(text) < 0.25


def _caesar_printable(text: str, shift: int) -> str:
    out: list[str] = []
    for ch in text:
        code = ord(ch)
        if 32 + shift <= code <= 126 + shift:
            out.append(chr(code - shift))
        else:
            out.append(ch)
    return "".join(out)


def _literal_quality(text: str) -> int:
    if not text:
        return -999
    f = fold(text)
    score = 0
    for key in (
        "pendencia",
        "omissao",
        "dctf",
        "sief",
        "sida",
        "receita",
        "devedor",
        "simples",
        "cnpj",
        "diagnostico",
        "parcelamento",
        "dirf",
        "certificado",
        "federal",
        "apuracao",
        "exigibilidade",
        "processo fiscal",
    ):
        if key in f:
            score += 20
    words = re.findall(r"[A-Za-zÁ-ú]{3,}", text)
    score += len(words)
    score += sum(1 for word in words for ch in word.lower() if ch in "aeiou")
    score -= text.count("\x00") * 8
    return score


def decode_pdf_literal_bytes(raw: bytes) -> str:
    """Decodifica literal PDF; tenta UTF-16/CID + Caesar quando há NULs."""
    latin = raw.decode("latin-1", errors="ignore").strip()
    nul_count = raw.count(b"\x00")
    if nul_count < 2 or nul_count < max(2, len(raw) // 10):
        return latin

    candidates = [latin]
    for enc in ("utf-16-be", "utf-16-le"):
        try:
            decoded = raw.decode(enc, errors="ignore").strip()
        except Exception:
            decoded = ""
        if decoded:
            candidates.append(decoded)

    interleaved = bytearray()
    i = 0
    while i + 1 < len(raw):
        a, b = raw[i], raw[i + 1]
        if a == 0 and 1 <= b <= 255:
            interleaved.append(b)
            i += 2
            continue
        if b == 0 and 32 <= a < 127:
            interleaved.append(a)
            i += 2
            continue
        i += 1
    inter = interleaved.decode("latin-1", errors="ignore").strip()
    if inter:
        candidates.append(inter)
        for shift in range(1, 8):
            candidates.append(_caesar_printable(inter, shift))
    return max(candidates, key=_literal_quality)


def _zlib_decompressed_streams(path: Path) -> bytes:
    data = path.read_bytes()
    texts: list[bytes] = []
    for match in re.finditer(rb"stream\r?\n([\s\S]*?)\r?\nendstream", data):
        chunk = match.group(1)
        for candidate in (chunk, chunk.lstrip(b"\r\n")):
            try:
                texts.append(zlib.decompress(candidate))
                break
            except Exception:
                continue
    return b"\n".join(texts)


def pdf_string_literals(path: Path) -> list[str]:
    """Sequência ordenada de literais (...) dos streams FlateDecode do PDF."""
    raw = _zlib_decompressed_streams(path)
    decoded: list[str] = []
    for lit in re.findall(rb"\((?:\\.|[^\\)]){1,}\)", raw):
        s = lit[1:-1].replace(b"\\n", b" ").replace(b"\\r", b" ")
        s = re.sub(rb"\\([()\\])", rb"\1", s)
        text = decode_pdf_literal_bytes(s)
        if text:
            decoded.append(text)
    return decoded


def extract_zlib_literals(path: Path) -> str:
    raw = _zlib_decompressed_streams(path)
    decoded = pdf_string_literals(path)
    return raw.decode("latin-1", errors="ignore") + "\n" + " ".join(decoded)


def extract_cid_utf16_interleaved(path: Path) -> str:
    """Recupera texto CID onde caracteres aparecem intercalados (A\\x00B\\x00...)."""
    base = extract_zlib_literals(path)
    # Também tenta no binário bruto decompressado
    data = path.read_bytes()
    chunks: list[bytes] = []
    for match in re.finditer(rb"stream\r?\n([\s\S]*?)\r?\nendstream", data):
        chunk = match.group(1)
        for candidate in (chunk, chunk.lstrip(b"\r\n")):
            try:
                chunks.append(zlib.decompress(candidate))
                break
            except Exception:
                continue
    raw = b"\n".join(chunks)

    recovered: list[str] = []
    # UTF-16BE-like pairs with nulls
    for enc in ("utf-16-be", "utf-16-le"):
        try:
            recovered.append(raw.decode(enc, errors="ignore"))
        except Exception:
            pass

    # Interleaved ASCII: take chars when pattern looks like X\0Y\0
    chars = []
    i = 0
    while i < len(raw) - 1:
        a, b = raw[i], raw[i + 1]
        if b == 0 and 32 <= a < 127:
            chars.append(chr(a))
            i += 2
            continue
        if a == 0 and 32 <= b < 127:
            chars.append(chr(b))
            i += 2
            continue
        i += 1
    interleaved = "".join(chars)
    recovered.append(interleaved)
    for shift in (3, 1, 2, 4, 5):
        shifted = _caesar_printable(interleaved, shift)
        if shifted and shifted != interleaved:
            recovered.append(shifted)
    recovered.append(base)
    return "\n".join(recovered)


# Unaí Portal do Cidadão (e similares): hex <00XX...> Tj com código = ASCII - 0x1D
CID_HEX_TJ_RE = re.compile(r"<([0-9A-Fa-f]{4,})>\s*Tj")
CID_HEX_SHIFT_CANDIDATES = (0x1D, 0x20, 0x00)


def _decode_cid_hex_tj(hex_body: str, shift: int) -> str:
    try:
        raw = bytes.fromhex(hex_body)
    except ValueError:
        return ""
    chars: list[str] = []
    for i in range(0, len(raw) - 1, 2):
        code = (raw[i] << 8) | raw[i + 1]
        mapped = code + shift
        if mapped <= 0:
            continue
        if mapped < 32 and mapped not in (9, 10, 13):
            chars.append(" ")
            continue
        if mapped > 0x10FFFF:
            continue
        try:
            chars.append(chr(mapped))
        except ValueError:
            continue
    return "".join(chars)


def _cid_hex_shift_score(text: str) -> int:
    """Pontua texto decodificado (marcadores legíveis > lixo)."""
    f = fold(text)
    score = 0
    for token, pts in (
        ("parcelamento", 4),
        ("prefeituraunai", 4),
        ("portal do cidadao", 3),
        ("divida ativa", 3),
        ("cnpj", 2),
        ("guia", 2),
        ("extrato", 2),
        ("vencimento", 1),
        ("consulta de debitos", 3),
        ("agencianet", 3),
        ("certidao positiva", 2),
        ("lancamento", 1),
    ):
        if token in f:
            score += pts
    # CNPJ formatado
    if re.search(r"\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}", text):
        score += 3
    # valores BRL
    score += min(len(re.findall(r"\d{1,3}(?:\.\d{3})*,\d{2}", text)), 3)
    return score


def extract_cid_hex_shifted(path: Path) -> str:
    """Decodifica literais hex Tj de fontes CID (ex.: Unaí, código = ASCII - 0x1D)."""
    base = extract_zlib_literals(path)
    hexes = CID_HEX_TJ_RE.findall(base)
    if not hexes:
        return ""

    best_text = ""
    best_score = -1
    for shift in CID_HEX_SHIFT_CANDIDATES:
        parts = [_decode_cid_hex_tj(h, shift) for h in hexes]
        clean = [p.strip() for p in parts if p and p.strip()]
        # Compacto primeiro: extract_company pega "RENATO" e não "R E N A T O".
        # Uma linha por Tj: o parser Agenci@Net precisa de \s+ entre inscrição/ano/valor.
        newline_joined = "\n".join(clean)
        spaced = " ".join(clean)
        compact = "".join(parts)
        candidate = f"{compact}\n{newline_joined}\n{spaced}"
        sc = _cid_hex_shift_score(candidate)
        if sc > best_score:
            best_score = sc
            best_text = candidate
    return best_text if best_score > 0 else ""


def extract_pypdf(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    parts: list[str] = []
    for page in reader.pages:
        parts.append(page.extract_text() or "")
    return "\n".join(parts)


def extract_pdfplumber(path: Path) -> str:
    import pdfplumber

    parts: list[str] = []
    with pdfplumber.open(str(path)) as pdf:
        for page in pdf.pages:
            parts.append(page.extract_text() or "")
    return "\n".join(parts)


def extract_pymupdf(path: Path) -> str:
    import fitz

    doc = fitz.open(str(path))
    parts: list[str] = []
    for page in doc:
        parts.append(page.get_text("text") or "")
        parts.append(page.get_text("blocks") and "" or "")
        # rawdict helps some CID docs
        try:
            parts.append(page.get_text("rawdict") and page.get_text("text") or "")
        except Exception:
            pass
    doc.close()
    return "\n".join(parts)


EXTRACTORS = {
    "pypdf": extract_pypdf,
    "pdfplumber": extract_pdfplumber,
    "pymupdf": extract_pymupdf,
    "zlib_literals": extract_zlib_literals,
    "cid_utf16_interleaved": extract_cid_utf16_interleaved,
    "cid_hex_shifted": extract_cid_hex_shifted,
}


def score_text(text: str) -> int:
    if not text or not text.strip():
        return 0
    f = fold(text)
    score = 0
    if "cnpj" in f:
        score += 3
    if "diagnostico fiscal" in f or "diagnostico fiscal na receita" in f:
        score += 3
    if "nao foram detectadas pend" in f or "pendencia -" in f:
        score += 4
    if "certidao negativa" in f or "certidao positiva" in f:
        score += 3
    if "consulta de debitos" in f or "agencianet" in f:
        score += 3
    if "nao constam debitos" in f:
        score += 4
    if "exigibilidade suspensa" in f:
        score += 3
    # Municipal (Unaí / Portal do Cidadão / Itajaí)
    if "prefeituraunai" in f or "portalcidadao" in f:
        score += 4
    if "parcelamento" in f and ("divida" in f or "guia" in f):
        score += 4
    if "extrato de divida ativa" in f or "guias de parcelamento" in f:
        score += 3
    if "municipio de itajai" in f or "guia de recolhimento" in f:
        score += 4
    if "balneario camboriu" in f or "parcela(s) em aberto" in f:
        score += 3
    useful = len(re.findall(r"[A-Za-z0-9]{3,}", f))
    if has_fiscal_markers(text):
        score += min(useful // 40, 4)
    else:
        # Lixo CID/binário não pode ganhar de um modo com texto fiscal real
        score = min(score, 1)
    # Penaliza lixo com NULs (CID mal decodificado)
    if text.count("\x00") > 50:
        score = min(score, 1)
    if text_is_cid_garbage(text):
        score = min(score, 1)
    return score


# Lookbehind evita inscrição SIDA colada (ex. 12376.850.567/2021-83)
CNPJ_STRICT_RE = re.compile(r"(?<!\d)(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})(?!\d)")
CNPJ_DIGITS_RE = re.compile(r"\b(\d{14})\b")
# ET/BT são operadores PDF; (?<![A-Za-zÁ-ú]) evita apagar BUFFET/MARKET/INTERNET.
PDF_JUNK_RE = re.compile(
    r"(?:\)Tj|Tj\b|Tf\b|Tm\b|(?<![A-Za-zÁ-ú])ET\b|(?<![A-Za-zÁ-ú])BT\b|cm\b|/F\d+|\\\\\(|\\\\\)|\bobj\b|\bendobj\b)",
    re.I,
)
# Órgãos públicos / certificados que aparecem no cabeçalho do e-CAC
CNPJ_BLOQUEADOS = {
    "29859815000102",  # Procuradoria-Geral da Fazenda Nacional (certificado)
}
NOME_BLOQUEADOS = (
    "procuradoria",
    "fazenda nacional",
    "receita federal",
    "secretaria especial",
    "ministerio da fazenda",
    "certidao",
    "informacoes de apoio",
)


def cnpj_checksum_ok(digits: str) -> bool:
    raw = re.sub(r"\D", "", digits)
    if len(raw) != 14 or raw == raw[0] * 14:
        return False

    def _dv(base: str, weights: tuple[int, ...]) -> str:
        total = sum(int(d) * w for d, w in zip(base, weights))
        rest = total % 11
        return "0" if rest < 2 else str(11 - rest)

    d1 = _dv(raw[:12], (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
    d2 = _dv(raw[:12] + d1, (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
    return raw[-2:] == d1 + d2


def format_cnpj_digits(digits: str, *, allow_blocked: bool = False) -> str | None:
    raw = re.sub(r"\D", "", digits)
    if len(raw) != 14:
        return None
    if not cnpj_checksum_ok(raw):
        return None
    if raw in CNPJ_BLOQUEADOS and not allow_blocked:
        return None
    return f"{raw[:2]}.{raw[2:5]}.{raw[5:8]}/{raw[8:12]}-{raw[12:]}"


def _cnpj_window_is_certificado(text: str, start: int) -> bool:
    return "certificado" in text[max(0, start - 40) : start].lower()


def _prefer_cnpj_matriz(cnpjs: list[str]) -> str | None:
    if not cnpjs:
        return None
    for item in cnpjs:
        digits = re.sub(r"\D", "", item)
        if len(digits) == 14 and digits[8:12] == "0001":
            return item
    return cnpjs[0]


def clean_company_name(name: str | None) -> str | None:
    if not name:
        return None
    # Zero-width / invisíveis comuns em PDFs Agenci@Net (DAR)
    name = re.sub(r"[\u200b\u200c\u200d\ufeff\u00ad]", "", name)
    name = PDF_JUNK_RE.split(name)[0]
    name = re.sub(r"[\x00-\x1f\x7f-\x9f]", " ", name)
    name = re.sub(r"\s+", " ", name).strip(" -.,;:|_")
    name = re.split(
        r"Dados Cadastrais|Certid|UA de|Endere|Diagn[oó]stico|D[eé]bito|Parcelamento|Receita|CPF\s*/\s*CNPJ|CPF/CNPJ",
        name,
        flags=re.I,
    )[0]
    name = re.sub(r"(?i)[\s\-]*CPF\s*/?\s*$", "", name)
    name = name.strip(" -.,;:|_")
    folded = fold(name)
    if any(token in folded for token in NOME_BLOQUEADOS):
        return None
    letters = re.findall(r"[A-Za-zÁ-ú]", name)
    if len(letters) < 5:
        return None
    if PDF_JUNK_RE.search(name):
        return None
    if re.fullmatch(r"[\d\W]+", name):
        return None
    return name[:140] or None


def _next_nonempty_line(text: str, start: int) -> str | None:
    """Próxima linha com conteúdo (ignora vazios e só zero-width)."""
    rest = text[start:]
    for line in rest.splitlines():
        cleaned = re.sub(r"[\u200b\u200c\u200d\ufeff\u00ad]", "", line).strip()
        if cleaned:
            return cleaned
    return None


def extract_company(text: str) -> tuple[str | None, str | None]:
    """Extrai CNPJ do contribuinte e razão social, ignorando certificado/lixo PDF."""
    if not text:
        return None, None

    cnpj: str | None = None
    name: str | None = None

    # 1) Padrão ECAC legível: "CNPJ: 09.437.719 - AF DA SILVA REPRESENTACAO"
    m = re.search(
        r"CNPJ:\s*(\d{2}\.\d{3}\.\d{3})(?:/\d{4}-\d{2})?\s*-\s*"
        r"([A-Za-zÁ-ú0-9& /.\-]{5,120})",
        text,
        re.I,
    )
    if m:
        name = clean_company_name(m.group(2))
        prefix = re.sub(r"\D", "", m.group(1))
        matches: list[str] = []
        blocked_matches: list[str] = []
        for hit in CNPJ_STRICT_RE.finditer(text):
            if _cnpj_window_is_certificado(text, hit.start()):
                continue
            digits = re.sub(r"\D", "", hit.group(1))
            if not digits.startswith(prefix):
                continue
            formatted = format_cnpj_digits(hit.group(1))
            if formatted:
                matches.append(formatted)
                continue
            # Mesmo CNPJ do certificado PGFN, mas no cabeçalho da empresa
            allowed = format_cnpj_digits(hit.group(1), allow_blocked=True)
            if allowed:
                blocked_matches.append(allowed)
        cnpj = _prefer_cnpj_matriz(matches) or _prefer_cnpj_matriz(blocked_matches)

    # 2) Label explícito "CNPJ: xx.xxx.xxx/xxxx-xx" (não certificado)
    if not cnpj:
        for m in re.finditer(
            r"CNPJ:\s*(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})",
            text,
            re.I,
        ):
            if _cnpj_window_is_certificado(text, m.start()):
                continue
            cnpj = format_cnpj_digits(m.group(1))
            if cnpj:
                break

    # 3) Qualquer CNPJ estrito válido que não seja do certificado / bloqueado
    if not cnpj:
        matches = []
        for hit in CNPJ_STRICT_RE.finditer(text):
            if _cnpj_window_is_certificado(text, hit.start()):
                continue
            formatted = format_cnpj_digits(hit.group(1))
            if formatted:
                matches.append(formatted)
        cnpj = _prefer_cnpj_matriz(matches)

    # 4) Agenci@net: Razão Social: EMPRESA ... CPF/CNPJ: ... (valor pode estar na linha seguinte)
    if not name or not cnpj:
        m = re.search(
            r"(?:Nome\s*/\s*)?Raz[aã]o social:\s*\n?\s*([^\n\r]{5,120}?)\s*"
            r"(?:CPF/)?CNPJ:\s*\n?\s*([\d\.\s/-]{11,22})",
            text,
            re.I,
        )
        if m:
            name = name or clean_company_name(m.group(1))
            cnpj = cnpj or format_cnpj_digits(m.group(2))

    # 4b) Unaí / Portal do Cidadão: Nome: EMPRESA CPF/CNPJ: xx.xxx...
    # Texto CID compacto cola "ME"+"CPF" → evita NOME:...MECPF/CNPJ:
    if not name or not cnpj:
        m = re.search(
            r"Nome:\s*(.+?)(?:CPF\s*/\s*CNPJ|CNPJ)\s*:\s*([\d.\s/-]{14,22})",
            text,
            re.I | re.S,
        )
        if m:
            raw_nome = re.sub(r"(?i)[\s\-]*CPF\s*/?\s*$", "", m.group(1)).strip()
            name = name or clean_company_name(raw_nome)
            cnpj = cnpj or format_cnpj_digits(m.group(2))

    # 4d) CND GDF: CERTIDÃO Nº:\n{numero}\n{RAZÃO SOCIAL}\nNOME:
    if not name or not cnpj:
        m = re.search(
            r"CERTID[AÃ]O\s+N[ºO°]?\s*:?\s*\n\s*\d+\s*\n\s*"
            r"([A-Za-zÁ-ú0-9& /.,\-]{5,120})\s*\n\s*NOME\s*:",
            text,
            re.I,
        )
        if m:
            name = name or clean_company_name(m.group(1))
        if not cnpj:
            for hit in CNPJ_STRICT_RE.finditer(text):
                formatted = format_cnpj_digits(hit.group(1))
                if formatted:
                    cnpj = formatted
                    break

    # 4c) Itajaí: Nome do contribuinte: 7270309 - EMPRESA + CNPJ: xx...
    if not name or not cnpj:
        m = re.search(
            r"Nome\s+do\s+contribuinte\s*:\s*(?:\d+\s*-\s*)?([^\n\r]{5,120})",
            text,
            re.I,
        )
        if m:
            name = name or clean_company_name(m.group(1))
        if not cnpj:
            m_c = re.search(
                r"CNPJ\s*:\s*(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})",
                text,
                re.I,
            )
            if m_c:
                cnpj = format_cnpj_digits(m_c.group(1))

    # 5) Certidão Negativa RFB: NOME: ... CNPJ: ...
    if not name or not cnpj:
        m = re.search(
            r"NOME:\s*([A-Z0-9ÁÀÂÃÉÊÍÓÔÕÚÇ& /\.\-]{5,120}).{0,200}?CNPJ:\s*([\d\.\s/-]{14,22})",
            text,
            re.I | re.S,
        )
        if m:
            raw_nome = re.sub(r"(?i)[\s\-]*CPF\s*/?\s*$", "", m.group(1)).strip()
            name = name or clean_company_name(raw_nome)
            cnpj = cnpj or format_cnpj_digits(m.group(2))

    # 6) DAR / Lançamento Administrativo: NOME OU RAZÃO SOCIAL\n{nome}\nCPF/CNPJ\n{cnpj}
    if not name or not cnpj:
        m = re.search(r"NOME\s+OU\s+RAZ[AÃ]O\s+SOCIAL\s*[:=\s]*", text, re.I)
        if m:
            cand_nome = _next_nonempty_line(text, m.end())
            if cand_nome and not re.search(r"CPF\s*/?\s*CNPJ", cand_nome, re.I):
                name = name or clean_company_name(cand_nome)
        m_cnpj = re.search(r"CPF\s*/?\s*CNPJ\s*[:=\s]*", text, re.I)
        if m_cnpj and not cnpj:
            cand_cnpj = _next_nonempty_line(text, m_cnpj.end())
            if cand_cnpj:
                # mesma linha ou só dígitos na linha seguinte
                cnpj = format_cnpj_digits(cand_cnpj) or cnpj
                if not cnpj:
                    digits = re.sub(r"\D", "", cand_cnpj)
                    if len(digits) >= 14:
                        cnpj = format_cnpj_digits(digits[:14])

    # 7) Agenci@net URL/path com 14 dígitos
    if not cnpj:
        m = re.search(r"exibirdebitoscp/(\d{14})", text, re.I)
        if m:
            cnpj = format_cnpj_digits(m.group(1))

    if not cnpj and "agenci" in fold(text):
        m = CNPJ_DIGITS_RE.search(text)
        if m:
            cnpj = format_cnpj_digits(m.group(1))

    return cnpj, name


def extract_company_from_pdf(
    path: Path,
    text: str = "",
) -> tuple[str | None, str | None]:
    """CNPJ/razão do texto extraído; se o nome falhar, tenta literais do PDF."""
    cnpj, nome = extract_company(text)
    if cnpj and nome:
        return cnpj, nome
    try:
        joined = "\n".join(pdf_string_literals(path))
    except Exception:
        return cnpj, nome
    if not joined.strip():
        return cnpj, nome
    lit_cnpj, lit_nome = extract_company(joined)
    return (lit_cnpj or cnpj), (lit_nome or nome)


def strip_inbox_upload_prefix(stem_or_name: str) -> str:
    """Remove prefixo de inbox da API: {timestamp}_{index}_ e/ou {index}_.

    A rota grava `0_09-ECAC.pdf` (índice + nome original). Sem este strip o
    código vira `0_09` e o destino colide com o próprio arquivo do inbox.
    """
    stem = Path(stem_or_name).stem if "." in stem_or_name else stem_or_name
    match = INBOX_UPLOAD_PREFIX_RE.match(stem)
    if match:
        stem = match.group(3)
    while True:
        prefixed = INBOX_INDEX_PREFIX_RE.match(stem)
        if not prefixed or not INBOX_TIPO_STEM_RE.match(stem):
            break
        stem = prefixed.group(2)
    return stem


def codigo_from_filename(file_name: str) -> str:
    """Prefixo numérico do PDF: 86-ECAC.pdf -> 86; inbox 0_09-ECAC -> 09."""
    stem = strip_inbox_upload_prefix(Path(file_name).stem)
    return stem.split("-")[0]


# Data/hora de emissão no cabeçalho ECAC: "17/07/2026 09:57:32"
EMISSAO_DT_RE = re.compile(r"\b(\d{2})/(\d{2})/(20\d{2})\s+\d{2}:\d{2}:\d{2}\b")


def detect_competencia_from_text(text: str) -> tuple[str | None, str | None]:
    """Retorna (MM-YYYY, DD/MM/YYYY) da emissão do cabeçalho, se houver."""
    if not text or not text.strip():
        return None, None
    # Cabeçalho costuma estar no início; evita datas de vencimento no corpo
    for window in (text[:12000], text):
        match = EMISSAO_DT_RE.search(window)
        if not match:
            continue
        day, month, year = match.group(1), match.group(2), match.group(3)
        month_n = int(month)
        if month_n < 1 or month_n > 12:
            continue
        return f"{month}-{year}", f"{day}/{month}/{year}"
    return None, None


def _has_receita_pendencia_signals(folded: str) -> bool:
    """Sinais de pendência/exigibilidade na Receita (não só PGFN limpa)."""
    if "pendencia -" in folded or "pendencia-" in folded:
        return True
    if "debito com exigibilidade suspensa" in folded:
        return True
    if "inscricao com exigibilidade suspensa" in folded:
        return True
    if "parcelamento com exigibilidade suspensa" in folded:
        return True
    return False


def classify_text(text: str) -> tuple[str, list[str]]:
    f = fold(text)

    # Frase "não foram detectadas pend…" aparece também na PGFN com Receita pendente.
    # Só SEM_PENDENCIA se não houver sinais de pendência da Receita.
    if "nao foram detectadas pend" in f and not _has_receita_pendencia_signals(f):
        return "SEM_PENDENCIA", []

    # CND estadual GDF (PDF da certidão, ~5 KB) — frase diferente da consulta
    if (
        "certidao negativa de debitos" in f
        and "relativos aos tributos federais" not in f
        and "exibir debitos" not in f
        and (
            "nao constam debitos de tribut" in f
            or "nao constam debitos de competencia" in f
        )
    ):
        return "SEM_PENDENCIA", []

    tem_bloco_consulta = bool(
        "seguinte(s) debito(s)" in f
        or re.search(r"seguinte\(s\)\s+d\s*e?\s*bito", f)
    )

    # Agenci@net estadual sem débitos (prioridade sobre títulos de menu)
    # Não vale se a mesma tela lista LANÇAMENTO / A VENCER / DÍVIDA ATIVA.
    if (
        "nao constam debitos para o objeto consultado" in f
        or ("emissao de certidao negativa" in f and "exibir debitos" not in f)
    ) and not tem_bloco_consulta:
        return "SEM_PENDENCIA", []

    # Certidão Negativa federal completa (CND), sem diagnóstico de pendência ativa
    if "certidao negativa de debitos relativos aos tributos federais" in f:
        if "pendencia -" not in f and "exigibilidade suspensa" not in f:
            return "SEM_PENDENCIA", []

    tipos: list[str] = []
    for match in re.finditer(r"pendencia(?:\s|-)+([a-z0-9 /*()]{3,70})", f):
        label = re.sub(r"\s+", " ", match.group(1)).strip().upper()
        label = label.replace("(SIEF)", "").replace("(SIDA)", "").strip()
        if not label:
            continue
        if label not in tipos:
            tipos.append(label)

    if "pendencia - debito" in f or "pendencia debito" in f:
        if "DEBITO" not in tipos and "DEBITO (SIEF)" not in "".join(tipos):
            tipos.insert(0, "DEBITO")

    # Débito/inscrição/parcelamento com exigibilidade suspensa = há débito (suspenso)
    if "debito com exigibilidade suspensa" in f:
        if "DEBITO_SUSPENSO" not in tipos:
            tipos.append("DEBITO_SUSPENSO")
    if "inscricao com exigibilidade suspensa" in f:
        if "INSCRICAO_SUSPENSA" not in tipos:
            tipos.append("INSCRICAO_SUSPENSA")
    if "parcelamento com exigibilidade suspensa" in f:
        if "PARCELAMENTO_SUSPENSO" not in tipos:
            tipos.append("PARCELAMENTO_SUSPENSO")
    if "pendencia parcelamento" in f and "PARCELAMENTO" not in "".join(tipos):
        tipos.append("PARCELAMENTO")

    # Certidão Positiva estadual real (tela de débitos), não item de menu
    if "certidao positiva - exibir debitos" in f or (
        "agenci" in f and "exibir debitos" in f and "certidao positiva" in f
    ):
        if "CERTIDAO_POSITIVA_ESTADUAL" not in tipos:
            tipos.append("CERTIDAO_POSITIVA_ESTADUAL")

    if "debito(s) a vencer" in f or "debitos a vencer" in f:
        if "DEBITO_A_VENCER" not in tipos:
            tipos.append("DEBITO_A_VENCER")
    if "em parcelamento" in f and "PARCELAMENTO_ESTADUAL" not in tipos:
        if tem_bloco_consulta:
            tipos.append("PARCELAMENTO_ESTADUAL")

    # CID quebra o é de débito: o bloco da consulta basta para COM_PENDENCIA.
    if tem_bloco_consulta and "CERTIDAO_POSITIVA_ESTADUAL" not in tipos:
        tipos.append("CERTIDAO_POSITIVA_ESTADUAL")

    # Lançamento Administrativo / DAR (SEFAZ-DF) com valores de cota
    if "lancamento administrativo" in f or (
        "documento de arrecadacao" in f and ("relacao de cotas" in f or "agencianet" in f)
    ):
        has_valor = bool(
            re.search(r"val(?:or)?\.?\s*total\s+\d{1,3}(?:\.\d{3})*,\d{2}", f)
            or re.search(r"valor total\s+\d{1,3}(?:\.\d{3})*,\d{2}", f)
            or re.search(r"\b\d{1,3}(?:\.\d{3})*,\d{2}\b", f)
        )
        if has_valor:
            if "LANCAMENTO_ADMIN_ESTADUAL" not in tipos:
                tipos.append("LANCAMENTO_ADMIN_ESTADUAL")

    # Municipal Unaí / Portal do Cidadão / Itajaí
    if "guias de parcelamento" in f or "extrato de parcelamento" in f:
        if "PARCELAMENTO_MUNICIPAL" not in tipos:
            tipos.append("PARCELAMENTO_MUNICIPAL")
    if "extrato de divida ativa" in f and (
        "prefeituraunai" in f or "portalcidadao" in f or "prefeitura" in f
    ):
        if "TRIBUTO_MUNICIPAL" not in tipos:
            tipos.append("TRIBUTO_MUNICIPAL")
    if "municipio de itajai" in f or (
        "guia de recolhimento" in f and "demonstrativo de debitos" in f
    ):
        if "TRIBUTO_MUNICIPAL" not in tipos:
            tipos.append("TRIBUTO_MUNICIPAL")

    if tipos:
        return "COM_PENDENCIA", tipos

    if "exigibilidade suspensa" in f:
        return "COM_PENDENCIA", ["EXIGIBILIDADE_SUSPENSA"]

    return "REVISAR", []


def run_mode(path: Path, mode: str) -> ModeResult:
    result = ModeResult(mode=mode)
    try:
        text = EXTRACTORS[mode](path)
        result.text = text or ""
        result.score = score_text(result.text)
        result.classe, result.tipos = classify_text(result.text)
        result.cnpj, result.empresa = extract_company(result.text)
        # Low score cannot claim SEM/COM confidently at mode level for consensus input
        if result.score < SCORE_THRESHOLD and result.classe != "REVISAR":
            # keep classe for diagnostics but mark weak by zeroing agreement later via threshold
            pass
    except Exception as exc:  # noqa: BLE001 - must never crash batch
        result.error = f"{type(exc).__name__}: {exc}"
        result.classe = "REVISAR"
        result.score = 0
    return result


def run_all_modes(path: Path) -> dict[str, ModeResult]:
    return {mode: run_mode(path, mode) for mode in MODES}


def majority_value(values: list[str | None]) -> str | None:
    clean = [v for v in values if v]
    if not clean:
        return None
    return Counter(clean).most_common(1)[0][0]


def consensus_from_modes(modes: dict[str, ModeResult]) -> tuple[str, list[str], list[str], list[str], str, str | None, str | None]:
    """Retorna classe, tipos, modos_concordantes, combinacoes_validas, motivo, cnpj, empresa."""
    eligible = {
        name: res
        for name, res in modes.items()
        if res.error is None and res.score >= SCORE_THRESHOLD and res.classe in {"SEM_PENDENCIA", "COM_PENDENCIA"}
    }

    classes_por_modo = {n: m.classe for n, m in modes.items()}

    # Evaluate pairs/triples that agree
    valid_combos: list[str] = []
    for combo in PAIR_COMBOS + TRIPLE_COMBOS:
        subset = [eligible[m] for m in combo if m in eligible]
        if len(subset) < 2:
            continue
        classes = {s.classe for s in subset}
        if len(classes) == 1 and classes.pop() in {"SEM_PENDENCIA", "COM_PENDENCIA"}:
            valid_combos.append("+".join(combo))

    # Count class votes among eligible modes
    votes = Counter(res.classe for res in eligible.values())
    if not votes:
        # try merge top texts
        ranked = sorted(modes.values(), key=lambda r: r.score, reverse=True)
        merged = "\n".join(r.text for r in ranked[:3] if r.text)
        classe, tipos = classify_text(merged)
        if classe in {"SEM_PENDENCIA", "COM_PENDENCIA"} and score_text(merged) >= SCORE_THRESHOLD:
            cnpj = majority_value([r.cnpj for r in ranked[:3]])
            empresa = majority_value([r.empresa for r in ranked[:3]])
            return classe, tipos, [r.mode for r in ranked[:3] if r.score > 0], [], "texto_fundido", cnpj, empresa
        return "REVISAR", [], [], [], "sem_modos_uteis", None, None

    top_class, top_count = votes.most_common(1)[0]
    if top_count < CONSENSUS_MIN:
        ranked = sorted(eligible.values(), key=lambda r: r.score, reverse=True)
        # conflict or single voice
        if len(votes) > 1:
            merged = "\n".join(r.text for r in ranked)
            classe, tipos = classify_text(merged)
            if classe in {"SEM_PENDENCIA", "COM_PENDENCIA"}:
                cnpj = majority_value([r.cnpj for r in ranked])
                empresa = majority_value([r.empresa for r in ranked])
                return (
                    classe,
                    tipos,
                    [r.mode for r in ranked],
                    valid_combos,
                    "conflito_resolvido_por_fusao",
                    cnpj,
                    empresa,
                )
            return "REVISAR", [], [r.mode for r in ranked], valid_combos, "conflito_sem_consenso", None, None
        return "REVISAR", [], [r.mode for r in ranked], valid_combos, "apenas_1_modo_util", None, None

    supporters = [name for name, res in eligible.items() if res.classe == top_class]
    tipos: list[str] = []
    for name in supporters:
        for tipo in eligible[name].tipos:
            if tipo not in tipos:
                tipos.append(tipo)
    cnpj = majority_value([eligible[n].cnpj for n in supporters])
    empresa = majority_value([eligible[n].empresa for n in supporters])
    motivo = "consenso_multi_modo"
    if not valid_combos and top_count >= CONSENSUS_MIN:
        motivo = "consenso_votos_sem_combo_nomeada"
    return top_class, tipos, supporters, valid_combos, motivo, cnpj, empresa


def sanitize_folder_name(name: str) -> str:
    name = re.sub(r'[<>:"/\\|?*]', "_", name)
    name = re.sub(r"\s+", "_", name.strip())
    name = re.sub(r"_+", "_", name)
    return name[:80].strip("_") or "SEM_NOME"


def list_target_pdfs(month_dir: Path) -> list[Path]:
    """Lista ECAC/AGENCIANET na raiz, ESTADUAIS ou pastas já separadas."""
    seen: set[Path] = set()
    files: list[Path] = []
    patterns = ("*-ECAC.pdf", "*-AGENCIANET.pdf")
    search_roots = [
        month_dir,
        month_dir / "ESTADUAIS",
        month_dir / "pendencias",
        month_dir / "sem_pendencias",
        month_dir / "revisar",
        # compatibilidade com nomes antigos
        month_dir / "COM_PENDENCIA",
        month_dir / "SEM_PENDENCIA",
        month_dir / "REVISAR",
    ]
    for root in search_roots:
        if not root.exists():
            continue
        for pattern in patterns:
            for path in root.rglob(pattern):
                key = path.resolve()
                if key in seen:
                    continue
                seen.add(key)
                files.append(path)

    def sort_key(p: Path) -> tuple[int, str]:
        try:
            return (int(p.stem.split("-")[0]), p.name.upper())
        except ValueError:
            return (10**9, p.name.upper())

    return sorted(files, key=sort_key)


def find_pdf_by_name(month_dir: Path, name: str) -> Path | None:
    for path in list_target_pdfs(month_dir):
        if path.name.lower() == name.lower():
            return path
    return None


def analyze_file(path: Path) -> FileVerdict:
    stem = path.stem
    codigo = codigo_from_filename(path.name)
    tipo_doc = "ECAC" if stem.upper().endswith("ECAC") else "AGENCIANET"
    modes = run_all_modes(path)
    classe, tipos, supporters, combos, motivo, cnpj, empresa = consensus_from_modes(modes)

    # For estaduais, if extraction weak, keep REVISAR at file level; grouping uses ECAC later
    best_text = ""
    if supporters:
        best_text = max((modes[m].text for m in supporters), key=len, default="")
    else:
        best_text = max((m.text for m in modes.values()), key=len, default="")

    return FileVerdict(
        codigo=codigo,
        arquivo=path.name,
        tipo_doc=tipo_doc,
        path=str(path),
        classe=classe,
        tipos=tipos,
        cnpj=cnpj,
        empresa=empresa,
        modos_concordantes=supporters,
        combinacoes_validas=combos,
        classes_por_modo={k: v.classe for k, v in modes.items()},
        scores_por_modo={k: v.score for k, v in modes.items()},
        texto_fonte=best_text[:2000],
        motivo=motivo,
    )


def group_by_codigo(verdicts: list[FileVerdict]) -> dict[str, dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {}
    for v in verdicts:
        g = groups.setdefault(
            v.codigo,
            {
                "codigo": v.codigo,
                "classe": "REVISAR",
                "tipos": [],
                "cnpj": None,
                "empresa": None,
                "arquivos": [],
                "ecac": None,
                "estadual": None,
                "motivo": "",
            },
        )
        g["arquivos"].append(v)
        if v.tipo_doc == "ECAC":
            g["ecac"] = v
        else:
            g["estadual"] = v

    for codigo, g in groups.items():
        ecac: FileVerdict | None = g["ecac"]
        est: FileVerdict | None = g["estadual"]

        if ecac and est:
            # Qualquer documento com pendência manda o grupo para COM_PENDENCIA
            if ecac.classe == "COM_PENDENCIA" or est.classe == "COM_PENDENCIA":
                g["classe"] = "COM_PENDENCIA"
                tipos: list[str] = []
                for src in (ecac, est):
                    for tipo in src.tipos:
                        prefix = "" if src.tipo_doc == "ECAC" else "EST_"
                        label = tipo if src.tipo_doc == "ECAC" else f"ESTADUAL_{tipo}"
                        if label not in tipos:
                            tipos.append(label)
                g["tipos"] = tipos
                g["cnpj"] = ecac.cnpj or est.cnpj
                g["empresa"] = ecac.empresa or est.empresa
                g["motivo"] = f"ecac={ecac.classe};estadual={est.classe}"
            elif ecac.classe == "SEM_PENDENCIA" and est.classe == "SEM_PENDENCIA":
                g["classe"] = "SEM_PENDENCIA"
                g["tipos"] = []
                g["cnpj"] = ecac.cnpj or est.cnpj
                g["empresa"] = ecac.empresa or est.empresa
                g["motivo"] = "ambos_sem_pendencia"
            else:
                # Prioriza ECAC se classificado; senão estadual
                primary = ecac if ecac.classe != "REVISAR" else est
                g["classe"] = primary.classe
                g["tipos"] = primary.tipos
                g["cnpj"] = ecac.cnpj or est.cnpj
                g["empresa"] = ecac.empresa or est.empresa
                g["motivo"] = f"ecac={ecac.classe};estadual={est.classe}"
        elif ecac:
            g["classe"] = ecac.classe
            g["tipos"] = ecac.tipos
            g["cnpj"] = ecac.cnpj
            g["empresa"] = ecac.empresa
            g["motivo"] = ecac.motivo
        elif est:
            g["classe"] = est.classe
            g["tipos"] = est.tipos
            g["cnpj"] = est.cnpj
            g["empresa"] = est.empresa
            g["motivo"] = est.motivo or "somente_estadual"
    return groups


def destination_for_group(month_dir: Path, group: dict[str, Any]) -> Path:
    classe = group["classe"]
    root_name = FOLDER_BY_CLASSE.get(classe, "revisar")
    codigo = group["codigo"]
    if root_name == "revisar":
        return month_dir / root_name / codigo
    empresa = sanitize_folder_name(group.get("empresa") or "SEM_NOME").replace("_", " ")
    empresa = re.sub(r"\s+", " ", empresa).strip() or "SEM_NOME"
    return month_dir / root_name / empresa


def move_group(month_dir: Path, group: dict[str, Any], dry_run: bool) -> list[dict[str, str]]:
    dest = destination_for_group(month_dir, group)
    moves: list[dict[str, str]] = []
    if not dry_run:
        dest.mkdir(parents=True, exist_ok=True)
    for verdict in group["arquivos"]:
        src = Path(verdict.path)
        if not src.exists():
            continue
        target = dest / src.name
        moves.append({"from": str(src), "to": str(target)})
        if not dry_run:
            if target.exists():
                continue
            shutil.move(str(src), str(target))
    return moves


def write_reports(month_dir: Path, groups: dict[str, dict[str, Any]], moves: list[dict[str, str]], dry_run: bool) -> None:
    rows = []
    for codigo in sorted(groups, key=lambda x: int(x)):
        g = groups[codigo]
        rows.append(
            {
                "codigo": codigo,
                "classe": g["classe"],
                "tipos": "; ".join(g.get("tipos") or []),
                "cnpj": g.get("cnpj") or "",
                "empresa": g.get("empresa") or "",
                "motivo": g.get("motivo") or "",
                "arquivos": ", ".join(v.arquivo for v in g["arquivos"]),
                "modos_concordantes": ", ".join((g["ecac"].modos_concordantes if g.get("ecac") else [])),
                "combinacoes_validas": ", ".join((g["ecac"].combinacoes_validas if g.get("ecac") else [])[:8]),
                "scores": json.dumps(g["ecac"].scores_por_modo if g.get("ecac") else {}, ensure_ascii=False),
                "destino": str(destination_for_group(month_dir, g)),
            }
        )

    out_dir = resolve_output_dir()
    csv_path = out_dir / "relatorio_debitos_07-2026.csv"
    json_path = out_dir / "relatorio_debitos_07-2026.json"
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()) if rows else ["codigo"])
        writer.writeheader()
        writer.writerows(rows)

    empresas_json = []
    for codigo in sorted(groups, key=lambda x: int(x)):
        g = groups[codigo]
        empresas_json.append(
            {
                "codigo": g["codigo"],
                "classe": g["classe"],
                "tipos": g.get("tipos") or [],
                "cnpj": g.get("cnpj"),
                "empresa": g.get("empresa"),
                "motivo": g.get("motivo") or "",
                "ecac": asdict(g["ecac"]) if g.get("ecac") else None,
                "estadual": asdict(g["estadual"]) if g.get("estadual") else None,
                "arquivos": [asdict(a) for a in g["arquivos"]],
                "destino": str(destination_for_group(month_dir, g)),
            }
        )
    payload = {
        "dry_run": dry_run,
        "workspace": str(resolve_workspace_root()),
        "pasta_mes": str(month_dir),
        "pasta_resultados": str(out_dir),
        "total_empresas": len(groups),
        "resumo": dict(Counter(g["classe"] for g in groups.values())),
        "moves": moves,
        "empresas": empresas_json,
    }
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Relatorio CSV: {csv_path}")
    print(f"Relatorio JSON: {json_path}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Extrai e separa débitos ECAC por consenso multi-modo")
    parser.add_argument("--dir", default=None, help="Pasta 07-2026")
    parser.add_argument("--dry-run", action="store_true", help="Não move arquivos")
    args = parser.parse_args(argv)

    month_dir = resolve_month_dir(args.dir)
    print(f"Pasta: {month_dir}")
    pdfs = list_target_pdfs(month_dir)
    print(f"PDFs encontrados: {len(pdfs)}")

    verdicts = []
    for i, path in enumerate(pdfs, 1):
        print(f"[{i}/{len(pdfs)}] {path.name}")
        verdicts.append(analyze_file(path))

    groups = group_by_codigo(verdicts)
    moves: list[dict[str, str]] = []
    for codigo in sorted(groups, key=lambda x: int(x)):
        moves.extend(move_group(month_dir, groups[codigo], dry_run=args.dry_run))

    write_reports(month_dir, groups, moves, dry_run=args.dry_run)
    resumo = Counter(g["classe"] for g in groups.values())
    print("Resumo:", dict(resumo))
    print("Dry-run:" if args.dry_run else "Movimentacao:", "sim" if args.dry_run else "concluida")
    return 0


if __name__ == "__main__":
    sys.exit(main())
