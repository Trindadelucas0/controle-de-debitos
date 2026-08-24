#!/usr/bin/env python3
"""Ingere PDFs tipados (ECAC / AGENCIANET / MUNICIPAL) em uma competência MM-YYYY.

Stdout: apenas JSON final.
Stderr: logs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from build_dashboard_data import (  # noqa: E402
    detect_content_tipo,
    extract_documentos_from_pdf,
    parse_municipal_debitos,
    rebuild_dashboard,
    resolve_pdf_text,
    sum_totais,
)
from extrair_debitos import (  # noqa: E402
    COMPETENCIA_DIR_RE,
    classify_text,
    codigo_from_filename,
    detect_competencia_from_text,
    ensure_competencia_dir,
    extract_company,
    fold,
    has_fiscal_markers,
    list_competencia_dirs,
    competencias_parent_dir,
    resolve_workspace_root,
    strip_inbox_upload_prefix,
)

TIPOS_VALIDOS = ("ECAC", "AGENCIANET", "MUNICIPAL")
TIPO_TO_ESFERA = {
    "ECAC": "federal",
    "AGENCIANET": "estadual",
    "MUNICIPAL": "municipal",
}
SAFE_NAME_RE = re.compile(r"[<>:\"/\\|?*\x00-\x1f]")


class IngestLock:
    """Lock de arquivo para ingestão/exclusão.

    Locks com PID morto ou com idade > STALE_AFTER_SEC são descartados —
    evita exclusão falhar com LOCKED depois de rebuild longo/travado.
    """

    STALE_AFTER_SEC = 20 * 60

    def __init__(self, path: Path) -> None:
        self.path = path
        self.acquired = False

    def acquire(self) -> bool:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists():
            stale = False
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                pid = int(data.get("pid", 0))
                ts = float(data.get("ts", 0) or 0)
                age = time.time() - ts if ts else 99999.0
                if age >= self.STALE_AFTER_SEC:
                    stale = True
                elif pid and _pid_alive(pid):
                    return False
                else:
                    stale = True
            except Exception:
                stale = True
            if stale:
                try:
                    self.path.unlink()
                except OSError:
                    return False
        payload = {"pid": os.getpid(), "ts": time.time()}
        self.path.write_text(json.dumps(payload), encoding="utf-8")
        self.acquired = True
        return True

    def release(self) -> None:
        if not self.acquired:
            return
        try:
            self.path.unlink(missing_ok=True)
        except OSError:
            pass
        self.acquired = False


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    # Windows: OpenProcess é mais confiável que os.kill(pid, 0)
    if os.name == "nt":
        try:
            import ctypes

            kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
            handle = kernel32.OpenProcess(0x1000, False, pid)
            if handle:
                kernel32.CloseHandle(handle)
                return True
            return False
        except Exception:
            return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False
    except AttributeError:
        return False


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def is_pdf_magic(path: Path) -> bool:
    try:
        with path.open("rb") as fh:
            head = fh.read(1024)
        if not head:
            return False
        idx = head.find(b"%PDF")
        return 0 <= idx < 32
    except OSError:
        return False


def sanitize_stem(name: str) -> str:
    stem = Path(name).stem
    stem = SAFE_NAME_RE.sub("_", stem).strip(" .")
    return (stem[:80] or "arquivo").strip()


def digits_cnpj(value: str | None) -> str | None:
    if not value:
        return None
    digits = re.sub(r"\D", "", value)
    return digits if len(digits) == 14 else None


def _nome_generico(nome: str | None) -> bool:
    if not nome or not str(nome).strip():
        return True
    cleaned = str(nome).strip()
    if cleaned.isdigit():
        return True
    dig = digits_cnpj(cleaned)
    if dig and dig == re.sub(r"\D", "", cleaned):
        return True
    folded = fold(cleaned).replace(" ", "_")
    return folded in {"sem_nome", "semnome", "revisar", "doc", "smoke"}


def lookup_nome_historico(
    *,
    cnpj: str | None,
    codigo: str | None,
    exclude_competencia: str | None = None,
) -> str | None:
    """Reusa razão social de outra competência. Com CNPJ: só mesmo CNPJ. Sem CNPJ: código."""
    dig = digits_cnpj(cnpj)
    code = (codigo or "").strip()
    if not dig and not code:
        return None
    if code.upper() in {"ECAC", "AGENCIANET", "MUNICIPAL", "PDF", "DOC", "SMOKE"}:
        code = ""
    json_path = resolve_workspace_root() / "dashboard" / "data" / "empresas.json"
    if not json_path.exists():
        return None
    try:
        payload = json.loads(json_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    snapshots = payload.get("snapshots") or {}
    # Preferir competências mais recentes (MM-YYYY ordenado desc)
    comps = sorted(
        (k for k in snapshots.keys() if COMPETENCIA_DIR_RE.match(str(k))),
        key=lambda k: (k.split("-")[1], k.split("-")[0]),
        reverse=True,
    )
    for comp in comps:
        if exclude_competencia and comp == exclude_competencia:
            continue
        for emp in (snapshots[comp] or {}).get("empresas") or []:
            nome = emp.get("nome")
            if _nome_generico(nome):
                continue
            emp_dig = digits_cnpj(emp.get("cnpj"))
            # CNPJ no PDF: identidade = CNPJ. Não reusa nome por código de outra empresa.
            if dig:
                if emp_dig and dig == emp_dig:
                    return str(nome).strip()
                continue
            codes = [str(c) for c in (emp.get("codigos") or []) if c]
            if emp.get("codigo"):
                codes.append(str(emp["codigo"]))
            if code and code in codes:
                return str(nome).strip()
    return None


def load_empresa_index(month: Path) -> list[dict[str, Any]]:
    """Índice de empresas já existentes na competência."""
    index: list[dict[str, Any]] = []
    json_path = resolve_workspace_root() / "dashboard" / "data" / "empresas.json"
    competencia = month.name
    if json_path.exists():
        try:
            payload = json.loads(json_path.read_text(encoding="utf-8"))
            snap = (payload.get("snapshots") or {}).get(competencia) or {}
            for emp in snap.get("empresas") or []:
                pasta = Path(emp.get("pasta") or "")
                if pasta.exists():
                    codigos = [str(c) for c in (emp.get("codigos") or []) if c]
                    if emp.get("codigo") and str(emp["codigo"]) not in codigos:
                        codigos.append(str(emp["codigo"]))
                    for pdf in pasta.glob("*.pdf"):
                        code = codigo_from_filename(pdf.name)
                        if code and code not in codigos:
                            codigos.append(code)
                    index.append(
                        {
                            "nome": emp.get("nome") or pasta.name,
                            "pasta": pasta,
                            "cnpj": digits_cnpj(emp.get("cnpj")),
                            "id": emp.get("id"),
                            "codigo": emp.get("codigo") or (codigos[0] if codigos else None),
                            "codigos": codigos,
                        }
                    )
        except Exception as exc:  # noqa: BLE001
            print(f"aviso: indice JSON: {exc}", file=sys.stderr)

    for status_folder in ("pendencias", "sem_pendencias", "revisar"):
        root = month / status_folder
        if not root.exists():
            continue
        for folder in root.iterdir():
            if not folder.is_dir():
                continue
            if any(item["pasta"].resolve() == folder.resolve() for item in index):
                # enriquecer códigos dos PDFs na pasta já indexada
                for item in index:
                    if item["pasta"].resolve() == folder.resolve():
                        codes = list(item.get("codigos") or [])
                        for pdf in folder.glob("*.pdf"):
                            code = codigo_from_filename(pdf.name)
                            if code and code not in codes:
                                codes.append(code)
                        item["codigos"] = codes
                        if not item.get("codigo") and codes:
                            item["codigo"] = codes[0]
                        break
                continue
            codes: list[str] = []
            for pdf in folder.glob("*.pdf"):
                code = codigo_from_filename(pdf.name)
                if code and code not in codes:
                    codes.append(code)
            index.append(
                {
                    "nome": folder.name,
                    "pasta": folder,
                    "cnpj": None,
                    "id": None,
                    "codigo": codes[0] if codes else None,
                    "codigos": codes,
                }
            )
    return index


def match_empresa(
    index: list[dict[str, Any]],
    *,
    cnpj: str | None,
    nome: str | None,
    codigo: str | None = None,
) -> dict[str, Any] | None:
    """Identidade = CNPJ. Com CNPJ: só mesmo CNPJ. Sem CNPJ: código ou nome exato/prefixo."""
    dig = digits_cnpj(cnpj)
    # PDF com CNPJ: anexa só na pasta do mesmo CNPJ. Não usa código/nome para cruzar empresas.
    if dig:
        for item in index:
            if item.get("cnpj") == dig:
                return item
        return None

    if codigo:
        code = str(codigo).strip()
        # ignora códigos genéricos de nome forçado (smoke, doc, etc.)
        if code and code.upper() not in {"DOC", "PDF", "SMOKE", "ARQUIVO"}:
            for item in index:
                item_codes = {
                    str(item.get("codigo") or "").strip(),
                    *[str(c).strip() for c in (item.get("codigos") or [])],
                }
                item_codes.discard("")
                if code in item_codes:
                    return item
                # PDF na pasta com prefixo do código
                pasta = item["pasta"]
                if pasta.exists():
                    for pdf in pasta.glob("*.pdf"):
                        if codigo_from_filename(pdf.name) == code:
                            return item
                pasta_name = item["pasta"].name
                if pasta_name.upper().startswith(f"{code} ") or pasta_name.upper().startswith(
                    f"{code}-"
                ):
                    return item

    if nome:
        alvo = fold(nome)
        if len(alvo) >= 6:
            for item in index:
                alvo_item = fold(item["nome"])
                if alvo_item == alvo:
                    return item
            for item in index:
                alvo_item = fold(item["nome"])
                if len(alvo) >= 12 and (
                    alvo_item.startswith(alvo[:16]) or alvo.startswith(alvo_item[:16])
                ):
                    return item
            # Sem match por token de palavra (COMERCIO, INDUSTRIA, etc. cruzam empresas).
    return None


def safe_empresa_dirname(nome: str | None, codigo: str, cnpj: str | None) -> str:
    if nome and nome.strip():
        cleaned = SAFE_NAME_RE.sub(" ", nome).strip()
        cleaned = re.sub(r"\s+", " ", cleaned)
        if cleaned:
            return cleaned[:120]
    if cnpj:
        return digits_cnpj(cnpj) or cnpj
    return codigo or "sem_nome"


def unique_dest_path(folder: Path, filename: str, source: Path) -> tuple[Path, str | None]:
    """Evita sobrescrever: hash igual = skip; diferente = nome__N.pdf."""
    dest = folder / filename
    if not dest.exists():
        return dest, None
    try:
        if sha256_file(dest) == sha256_file(source):
            return dest, "já importado (mesmo hash)"
    except OSError:
        pass
    stem = Path(filename).stem
    suffix = Path(filename).suffix
    for i in range(2, 100):
        candidate = folder / f"{stem}__{i}{suffix}"
        if not candidate.exists():
            return candidate, None
    return folder / f"{stem}__{int(time.time())}{suffix}", None


def force_filename(codigo: str, tipo: str, original_name: str) -> str:
    """Nome final {codigo}-{TIPO}.pdf, sem prefixo de inbox da API."""
    code = codigo_from_filename(original_name)
    if codigo and codigo not in {"", original_name}:
        candidate = codigo_from_filename(f"{strip_inbox_upload_prefix(codigo)}-{tipo}.pdf")
        if candidate and candidate.upper() not in {tipo, "PDF"}:
            code = candidate
    if not code or code.upper() in {tipo, "PDF"}:
        code = sanitize_stem(strip_inbox_upload_prefix(original_name)).split("-")[0]
        code = codigo_from_filename(f"{code}-{tipo}.pdf")
    code = re.sub(r"[^\w.-]", "", code) or "doc"
    return f"{code}-{tipo}.pdf"


def paste_status_from_classe(classe: str) -> str:
    if classe == "COM_PENDENCIA":
        return "pendencias"
    if classe == "SEM_PENDENCIA":
        return "sem_pendencias"
    return "revisar"


def resolve_month_for_ingest(competencia: str, *, dry_run: bool) -> Path:
    """Pasta MM-YYYY: cria subdirs no commit; no preview só resolve o caminho."""
    if not dry_run:
        return ensure_competencia_dir(competencia)
    for existing in list_competencia_dirs():
        if existing.name == competencia:
            return existing
    return competencias_parent_dir() / competencia


def ingest_one(
    path: Path,
    *,
    tipo: str,
    month: Path,
    indexes: dict[str, list[dict[str, Any]]],
    selected_competencia: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    tipo = tipo.upper()
    selected = selected_competencia or month.name
    result: dict[str, Any] = {
        "ok": False,
        "arquivo": path.name,
        "arquivo_final": None,
        "tipo": tipo,
        "esfera": TIPO_TO_ESFERA.get(tipo),
        "classe": None,
        "empresa": None,
        "cnpj": None,
        "destino": None,
        "empresa_id": None,
        "qtd_debitos": 0,
        "titulos": [],
        "totais": {"original": 0, "saldo": 0, "multa": 0, "juros": 0, "consolidado": 0},
        "avisos": [],
        "erro": None,
        "competencia": selected,
        "competencia_selecionada": selected,
        "layout_municipal": None,
        "duplicado": False,
        "inbox_path": str(path.resolve()) if path.exists() else str(path),
        "dry_run": dry_run,
    }

    if tipo not in TIPOS_VALIDOS:
        result["erro"] = f"tipo inválido: {tipo}"
        return result
    if not path.exists():
        result["erro"] = "arquivo não encontrado"
        return result
    if not is_pdf_magic(path):
        result["erro"] = "não é PDF válido (%PDF)"
        return result

    text, mode, text_avisos = resolve_pdf_text(path, tipo)
    result["avisos"].extend(text_avisos)
    result["avisos"].append(f"texto via {mode}")

    # Auto-corrige zona se o conteúdo do PDF discordar com confiança alta
    content_tipo, forte = detect_content_tipo(text)
    if forte and content_tipo and content_tipo != tipo:
        result["avisos"].append(
            f"zona {tipo} corrigida para {content_tipo} pelo conteúdo do PDF"
        )
        tipo = content_tipo
        result["tipo"] = tipo
        result["esfera"] = TIPO_TO_ESFERA.get(tipo)

    forced_name = force_filename(codigo_from_filename(path.name), tipo, path.name)
    esfera = TIPO_TO_ESFERA[tipo]

    detected, emissao = detect_competencia_from_text(text)
    result["competencia"] = selected
    if detected and COMPETENCIA_DIR_RE.match(detected) and detected != selected:
        emissao_txt = emissao or "?"
        result["avisos"].append(
            f"PDF emitido em {detected} (emissão {emissao_txt}); "
            f"gravando na competência selecionada {selected}"
        )
    if month.name != selected:
        month = resolve_month_for_ingest(selected, dry_run=dry_run)

    index = indexes.setdefault(
        result["competencia"],
        load_empresa_index(month) if month.exists() else [],
    )

    classe, tipos = classify_text(text)
    cnpj, nome = extract_company(text)
    nome = cleanup_municipal_nome(nome, text)
    # Unaí: Nome: no cabeçalho (fallback)
    if not nome:
        m_nome = re.search(
            r"Nome:\s*(.+?)(?:CPF\s*/\s*CNPJ|CNPJ)\s*:",
            text,
            re.I | re.S,
        )
        if m_nome:
            nome = cleanup_municipal_nome(m_nome.group(1), text)
        else:
            m_nome = re.search(r"Nome:\s*\n?\s*([^\n]+)", text, re.I)
            if m_nome:
                nome = cleanup_municipal_nome(m_nome.group(1).strip(), text)
    codigo_pdf = codigo_from_filename(path.name)
    if _nome_generico(nome):
        hist = lookup_nome_historico(
            cnpj=cnpj,
            codigo=codigo_pdf,
            exclude_competencia=str(result.get("competencia") or selected),
        )
        if hist:
            nome = hist
            result["avisos"].append(f"nome reutilizado do histórico: {hist}")
    result["cnpj"] = cnpj
    result["empresa"] = nome
    result["classe"] = classe

    if tipo == "MUNICIPAL":
        rows, layout, mun_avisos = parse_municipal_debitos(text, forced_name)
        result["layout_municipal"] = layout
        result["avisos"].extend(mun_avisos)
        if rows:
            classe = "COM_PENDENCIA"
            result["classe"] = classe
            if layout == "unai_parcelamento" and "PARCELAMENTO_MUNICIPAL" not in tipos:
                tipos.append("PARCELAMENTO_MUNICIPAL")
            if layout == "itajai_guia" and "TRIBUTO_MUNICIPAL" not in tipos:
                tipos.append("TRIBUTO_MUNICIPAL")
            if "TRIBUTO_MUNICIPAL" not in tipos:
                tipos.append("TRIBUTO_MUNICIPAL")
            if layout:
                result["avisos"].append(f"layout municipal: {layout}")
        elif text_is_really_empty(text):
            classe = "REVISAR"
            result["classe"] = classe
    else:
        docs, found_tipos = extract_documentos_from_pdf(
            pdf_name=forced_name,
            text=text,
            pasta_status="pendencia" if classe == "COM_PENDENCIA" else (
                "regular" if classe == "SEM_PENDENCIA" else "pendencia"
            ),
            path=path,
        )
        tipos = list({*tipos, *found_tipos})
        rows = []
        for doc in docs:
            rows.extend(doc.get("debitos") or [])

    # Força esfera do tipo no preview
    for row in rows:
        row["esfera"] = esfera
        row["origem"] = tipo
        row["arquivo"] = forced_name

    result["qtd_debitos"] = len(rows)
    result["totais"] = sum_totais(rows)
    titulos: list[str] = []
    for row in rows:
        titulo = str(row.get("titulo") or "").strip()
        if titulo and titulo not in titulos:
            titulos.append(titulo)
    result["titulos"] = titulos

    if not rows:
        result["avisos"].append(
            "conteúdo sem layout de débitos reconhecido — revisar PDF"
        )

    extract_failed = False
    if not rows and classe != "SEM_PENDENCIA":
        extract_failed = True
        if tipo == "ECAC" and not has_fiscal_markers(text):
            result["erro"] = (
                "Não foi possível ler o Diagnóstico Fiscal deste PDF "
                "(texto ilegível). Reexporte o arquivo ou instale pymupdf."
            )
        else:
            result["erro"] = (
                "Nenhum lançamento extraído. A importação não pode ser "
                "confirmada até extrair de verdade."
            )
        result["classe"] = "REVISAR"
        classe = "REVISAR"
        result["avisos"].append("extração incompleta — não gravar no painel")

    if extract_failed:
        result["ok"] = False
        result["arquivo_final"] = forced_name
        return result

    if classe == "REVISAR" and not rows:
        status_folder = "revisar"
    elif rows or classe == "COM_PENDENCIA":
        status_folder = "pendencias"
        classe = "COM_PENDENCIA"
        result["classe"] = classe
    elif classe == "SEM_PENDENCIA":
        status_folder = "sem_pendencias"
    else:
        status_folder = "revisar"

    matched = match_empresa(
        index,
        cnpj=cnpj,
        nome=nome,
        codigo=codigo_from_filename(forced_name),
    )
    if matched:
        dest_folder = matched["pasta"]
        # Mantém pasta existente (não troca pendencias <-> sem_pendencias),
        # mas promove revisar → pendencias quando a importação extraiu débitos.
        result["empresa"] = matched.get("nome") or nome
        result["empresa_id"] = matched.get("id")
        result["avisos"].append(f"anexado à pasta existente: {dest_folder.name}")
        dest_folder, promo_msg = promote_revisar_to_pendencias(
            dest_folder,
            month,
            should_promote=bool(rows) or status_folder == "pendencias",
            dry_run=dry_run,
        )
        if promo_msg:
            result["avisos"].append(promo_msg)
            matched["pasta"] = dest_folder
        dest_folder, rename_msg = rename_cnpj_folder_to_nome(
            dest_folder,
            nome=result.get("empresa") or nome,
            cnpj=cnpj,
            dry_run=dry_run,
        )
        if rename_msg:
            result["avisos"].append(rename_msg)
            matched["pasta"] = dest_folder
            result["empresa"] = dest_folder.name
    else:
        # Preferir anexar se empresa do mesmo status já existir só por nome de pasta
        codigo = codigo_from_filename(forced_name)
        dirname = safe_empresa_dirname(nome, codigo, cnpj)
        dest_folder = month / status_folder / dirname
        # Se já existe com outro status, reusa
        for alt in ("pendencias", "sem_pendencias", "revisar"):
            alt_path = month / alt / dirname
            if alt_path.exists() and alt_path.is_dir():
                dest_folder = alt_path
                result["avisos"].append(f"pasta irmã reutilizada em {alt}")
                break
        dest_folder, promo_msg = promote_revisar_to_pendencias(
            dest_folder,
            month,
            should_promote=bool(rows) or status_folder == "pendencias",
            dry_run=dry_run,
        )
        if promo_msg:
            result["avisos"].append(promo_msg)
        dest_folder, rename_msg = rename_cnpj_folder_to_nome(
            dest_folder, nome=nome, cnpj=cnpj, dry_run=dry_run
        )
        if rename_msg:
            result["avisos"].append(rename_msg)
            result["empresa"] = dest_folder.name
        if not dry_run:
            dest_folder.mkdir(parents=True, exist_ok=True)
        index.append(
            {
                "nome": dest_folder.name,
                "pasta": dest_folder,
                "cnpj": digits_cnpj(cnpj),
                "id": None,
                "codigo": codigo,
                "codigos": [codigo] if codigo else [],
            }
        )

    # libera texto grande antes do próximo arquivo
    del text

    dest_path, skip_reason = unique_dest_path(dest_folder, forced_name, path)
    result["destino"] = str(dest_folder.relative_to(month)) if month in dest_folder.parents or dest_folder.parent == month else str(dest_folder)
    try:
        result["destino"] = f"{dest_folder.parent.name}/{dest_folder.name}/{dest_path.name}"
    except Exception:
        result["destino"] = str(dest_path)

    if skip_reason:
        result["ok"] = True
        result["arquivo_final"] = dest_path.name
        result["avisos"].append(skip_reason)
        if "já importado (mesmo hash)" in skip_reason:
            result["duplicado"] = True
        return result

    if dry_run:
        result["ok"] = True
        result["arquivo_final"] = dest_path.name
        result["avisos"].append(f"preview — tipos: {', '.join(tipos) if tipos else '—'}")
        return result

    try:
        shutil.move(str(path), str(dest_path))
    except OSError:
        try:
            shutil.copy2(str(path), str(dest_path))
            path.unlink(missing_ok=True)
        except OSError as exc:
            result["erro"] = f"falha ao mover arquivo: {exc}"
            return result

    result["ok"] = True
    result["arquivo_final"] = dest_path.name
    result["avisos"].append(f"tipos: {', '.join(tipos) if tipos else '—'}")
    return result

def text_is_really_empty(text: str) -> bool:
    return len(re.findall(r"[A-Za-zÁ-ú]{4,}", text or "")) < 10


def cleanup_municipal_nome(nome: str | None, text: str) -> str | None:
    """Nome Unaí compacto (Nome:EMPRESA CPF/CNPJ:) e cola ME+CPF."""
    if nome:
        cleaned = re.split(r"(?i)CPF\s*/\s*CNPJ|CNPJ\s*:", nome)[0]
        cleaned = re.sub(r"(?i)[\s\-]*CPF\s*/?\s*$", "", cleaned).strip(" -.,;:|_")
        if cleaned and len(re.findall(r"[A-Za-zÁ-ú]", cleaned)) >= 5:
            return cleaned[:140]
    m = re.search(
        r"Nome:\s*(.+?)(?:CPF\s*/\s*CNPJ|CNPJ)\s*:",
        text,
        re.I | re.S,
    )
    if not m:
        return nome
    cleaned = re.sub(r"(?i)[\s\-]*CPF\s*/?\s*$", "", m.group(1)).strip(" -.,;:|_")
    cleaned = re.sub(r"\s+", " ", cleaned)
    if cleaned and len(re.findall(r"[A-Za-zÁ-ú]", cleaned)) >= 5:
        return cleaned[:140]
    return nome


def promote_revisar_to_pendencias(
    dest_folder: Path,
    month: Path,
    *,
    should_promote: bool,
    dry_run: bool = False,
) -> tuple[Path, str | None]:
    """Sobe pasta de revisar → pendencias quando a importação extraiu débitos."""
    if not should_promote:
        return dest_folder, None
    try:
        if dest_folder.parent.name != "revisar":
            return dest_folder, None
    except Exception:
        return dest_folder, None

    target = month / "pendencias" / dest_folder.name
    if target.exists() and (
        not dest_folder.exists() or target.resolve() != dest_folder.resolve()
    ):
        return target, f"promovido para pasta existente em pendencias: {target.name}"
    if dest_folder.exists() and target.resolve() == dest_folder.resolve():
        return dest_folder, None
    if dry_run:
        return target, f"destino previsto pendencias: {target.name}"
    target.parent.mkdir(parents=True, exist_ok=True)
    if dest_folder.exists():
        shutil.move(str(dest_folder), str(target))
        return target, f"pasta promovida revisar → pendencias: {target.name}"
    target.mkdir(parents=True, exist_ok=True)
    return target, f"destino ajustado para pendencias: {target.name}"


def rename_cnpj_folder_to_nome(
    dest_folder: Path,
    *,
    nome: str | None,
    cnpj: str | None,
    dry_run: bool = False,
) -> tuple[Path, str | None]:
    """Troca pasta só-dígitos (CNPJ) pelo nome da empresa quando disponível."""
    if not nome or _nome_generico(nome):
        return dest_folder, None
    dig = digits_cnpj(cnpj) or ""
    folder_name = dest_folder.name.strip()
    folder_dig = re.sub(r"\D", "", folder_name)
    if not (folder_name.isdigit() or (dig and folder_dig == dig)):
        return dest_folder, None
    safe = SAFE_NAME_RE.sub("_", nome).strip(" .")[:120] or folder_name
    if safe == folder_name:
        return dest_folder, None
    target = dest_folder.parent / safe
    if target.exists() and (
        not dest_folder.exists() or target.resolve() != dest_folder.resolve()
    ):
        return target, f"pasta CNPJ redirecionada para nome existente: {target.name}"
    if dry_run:
        return target, f"destino previsto nome: {target.name}"
    if dest_folder.exists():
        shutil.move(str(dest_folder), str(target))
        return target, f"pasta renomeada {folder_name} → {target.name}"
    target.mkdir(parents=True, exist_ok=True)
    return target, f"destino ajustado para nome: {target.name}"


def emit_line(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def attach_empresa_ids(results: list[dict[str, Any]], payload: dict) -> None:
    """Associa empresa_id usando snapshots de todas as competências dos itens."""
    comps = {
        str(item.get("competencia") or "")
        for item in results
        if item.get("competencia")
    }
    empresa_ids: dict[str, str] = {}
    for competencia in comps:
        snap = (payload.get("snapshots") or {}).get(competencia) or {}
        for emp in snap.get("empresas") or []:
            emp_id = emp.get("id") or ""
            for arq in emp.get("arquivos") or []:
                empresa_ids[arq] = emp_id
            pasta = emp.get("pasta")
            if pasta:
                empresa_ids[str(Path(pasta).name)] = emp_id
            if emp.get("nome"):
                empresa_ids[str(emp["nome"])] = emp_id
    for item in results:
        if not item.get("empresa") and item.get("destino"):
            parts = str(item["destino"]).replace("\\", "/").split("/")
            if len(parts) >= 2:
                item["empresa"] = item.get("empresa") or parts[-2]
        final = item.get("arquivo_final")
        if final and final in empresa_ids:
            item["empresa_id"] = empresa_ids[final]
        if not item.get("empresa_id") and item.get("destino"):
            parts = str(item["destino"]).replace("\\", "/").split("/")
            if len(parts) >= 2:
                item["empresa_id"] = empresa_ids.get(parts[-2]) or item.get("empresa_id")
        if not item.get("empresa_id") and item.get("empresa"):
            item["empresa_id"] = empresa_ids.get(str(item["empresa"])) or item.get("empresa_id")


def run(
    competencia: str,
    items: list[tuple[Path, str]],
    *,
    stream: bool = False,
    dry_run: bool = False,
) -> dict[str, Any]:
    if not COMPETENCIA_DIR_RE.match(competencia):
        payload = {
            "ok": False,
            "code": "INVALID_COMPETENCIA",
            "erro": "competência deve ser MM-YYYY",
            "competencia": competencia,
            "itens": [],
        }
        if stream:
            emit_line({"event": "done", **payload})
        return payload

    workspace = resolve_workspace_root()
    lock = IngestLock(workspace / "resultados" / "ingest.lock")
    if not lock.acquire():
        payload = {
            "ok": False,
            "code": "LOCKED",
            "erro": "outra ingestão em andamento",
            "competencia": competencia,
            "itens": [],
        }
        if stream:
            emit_line({"event": "done", **payload})
        return payload

    try:
        month = resolve_month_for_ingest(competencia, dry_run=dry_run)
        indexes: dict[str, list[dict[str, Any]]] = {
            competencia: load_empresa_index(month) if month.exists() else [],
        }
        results: list[dict[str, Any]] = []
        total = len(items)
        if stream:
            emit_line(
                {
                    "event": "start",
                    "competencia": competencia,
                    "total": total,
                    "dry_run": dry_run,
                }
            )

        for idx, (path, tipo) in enumerate(items):
            if stream:
                emit_line(
                    {
                        "event": "progress",
                        "index": idx,
                        "total": total,
                        "arquivo": path.name,
                        "tipo": tipo,
                    }
                )
            try:
                item = ingest_one(
                    path,
                    tipo=tipo,
                    month=month,
                    indexes=indexes,
                    selected_competencia=competencia,
                    dry_run=dry_run,
                )
            except Exception as exc:  # noqa: BLE001
                item = {
                    "ok": False,
                    "arquivo": path.name,
                    "tipo": tipo,
                    "competencia": competencia,
                    "competencia_selecionada": competencia,
                    "erro": f"{type(exc).__name__}: {exc}",
                    "avisos": [],
                    "qtd_debitos": 0,
                    "titulos": [],
                    "totais": sum_totais([]),
                    "duplicado": False,
                    "inbox_path": str(path),
                    "dry_run": dry_run,
                }
            results.append(item)
            if stream:
                emit_line({"event": "item", "index": idx, "total": total, **item})

        rebuild_ok = True
        rebuild_error = None
        if not dry_run:
            try:
                comps = {competencia}
                for item in results:
                    comp = str(item.get("competencia") or "").strip()
                    if COMPETENCIA_DIR_RE.match(comp):
                        comps.add(comp)
                payload_dash = rebuild_dashboard(only_competencias=sorted(comps))
                attach_empresa_ids(results, payload_dash)
            except Exception as exc:  # noqa: BLE001
                rebuild_ok = False
                rebuild_error = str(exc)
                print(f"REBUILD_FAILED: {exc}", file=sys.stderr)

        # Competência efetiva mais frequente entre itens OK (para link do painel)
        effective_comps = [
            str(r.get("competencia"))
            for r in results
            if r.get("ok") and r.get("competencia")
        ]
        competencia_painel = (
            Counter(effective_comps).most_common(1)[0][0]
            if effective_comps
            else competencia
        )

        payload = {
            "ok": (rebuild_ok or dry_run) and any(r.get("ok") for r in results),
            "code": None if rebuild_ok or dry_run else "REBUILD_FAILED",
            "erro": rebuild_error,
            "competencia": competencia_painel,
            "competencia_selecionada": competencia,
            "itens": results,
            "dry_run": dry_run,
            "aviso_global": (
                None
                if dry_run or rebuild_ok
                else "PDFs movidos, mas JSON falhou — rode npm run data"
            ),
        }
        if stream:
            if not dry_run:
                for idx, item in enumerate(results):
                    emit_line(
                        {
                            "event": "item_final",
                            "index": idx,
                            "total": total,
                            **item,
                        }
                    )
            emit_line({"event": "done", **payload})
        return payload
    finally:
        lock.release()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingere PDFs tipados por competência")
    parser.add_argument("--competencia", required=True, help="MM-YYYY")
    parser.add_argument("--files", nargs="+", required=True, help="Caminhos dos PDFs")
    parser.add_argument(
        "--tipos",
        nargs="+",
        help="Tipos alinhados a --files (ECAC|AGENCIANET|MUNICIPAL). Se omitido, use --tipo",
    )
    parser.add_argument(
        "--tipo",
        choices=TIPOS_VALIDOS,
        help="Tipo único aplicado a todos os arquivos",
    )
    parser.add_argument(
        "--stream",
        action="store_true",
        help="Emite NDJSON (1 evento por linha) e rebuild só no fim",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Extrai e valida sem mover PDF nem regenerar o painel",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    files = [Path(f) for f in args.files]
    if args.tipos:
        if len(args.tipos) != len(files):
            err = {
                "ok": False,
                "code": "BAD_ARGS",
                "erro": "--tipos deve ter o mesmo tamanho de --files",
                "itens": [],
            }
            if args.stream:
                emit_line({"event": "done", **err})
            else:
                print(json.dumps(err, ensure_ascii=False))
            return 2
        tipos = [t.upper() for t in args.tipos]
    elif args.tipo:
        tipos = [args.tipo.upper()] * len(files)
    else:
        err = {
            "ok": False,
            "code": "BAD_ARGS",
            "erro": "informe --tipo ou --tipos",
            "itens": [],
        }
        if args.stream:
            emit_line({"event": "done", **err})
        else:
            print(json.dumps(err, ensure_ascii=False))
        return 2

    payload = run(
        args.competencia,
        list(zip(files, tipos)),
        stream=bool(args.stream),
        dry_run=bool(args.dry_run),
    )
    if not args.stream:
        print(json.dumps(payload, ensure_ascii=False))
    return 0 if payload.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
