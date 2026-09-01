#!/usr/bin/env python3
"""Exclui PDFs importados de uma competência e regenera o dashboard.

Aceita destinos relativos à pasta MM-YYYY (ex.: pendencias/EMPRESA/123-ECAC.pdf)
ou caminhos absolutos dentro de pendencias|sem_pendencias|revisar.

Stdout: JSON único (ou NDJSON com --stream).
Stderr: logs.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from build_dashboard_data import empresa_relpath_from_destino, rebuild_dashboard  # noqa: E402
from extrair_debitos import (  # noqa: E402
    COMPETENCIA_DIR_RE,
    ensure_competencia_dir,
    resolve_workspace_root,
)
from ingest_upload import IngestLock  # noqa: E402

STATUS_FOLDERS = frozenset({"pendencias", "sem_pendencias", "revisar"})


def emit(payload: dict[str, Any], *, stream: bool) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def normalize_rel(value: str) -> str:
    return value.replace("\\", "/").strip().lstrip("/")


def resolve_target(month: Path, destino: str) -> Path | None:
    """Resolve destino relativo ou absoluto para um PDF sob a competência."""
    raw = destino.strip()
    if not raw:
        return None

    candidate = Path(raw)
    if candidate.is_absolute():
        try:
            resolved = candidate.resolve()
            month_res = month.resolve()
            resolved.relative_to(month_res)
        except (OSError, ValueError):
            return None
        return resolved

    rel = normalize_rel(raw)
    parts = Path(rel).parts
    if not parts or parts[0].lower() not in STATUS_FOLDERS:
        return None
    if ".." in parts:
        return None
    return (month / Path(*parts)).resolve()


def is_safe_pdf(month: Path, target: Path) -> bool:
    try:
        rel = target.resolve().relative_to(month.resolve())
    except (OSError, ValueError):
        return False
    parts = rel.parts
    if len(parts) < 2:
        return False
    if parts[0].lower() not in STATUS_FOLDERS:
        return False
    if ".." in parts:
        return False
    if not target.name.lower().endswith(".pdf"):
        return False
    return True


def cleanup_empty_dirs(month: Path, file_path: Path) -> list[str]:
    """Remove pasta da empresa se ficou sem PDF; não remove status/competência."""
    removed: list[str] = []
    month_res = month.resolve()
    current = file_path.parent
    try:
        while True:
            cur_res = current.resolve()
            if cur_res == month_res:
                break
            rel = cur_res.relative_to(month_res)
            if len(rel.parts) <= 1:
                # pasta de status (pendencias/...) — não remove
                break
            if not cur_res.is_dir():
                break
            remaining = list(cur_res.iterdir())
            if remaining:
                break
            cur_res.rmdir()
            removed.append(str(rel).replace("\\", "/"))
            current = cur_res.parent
    except OSError as exc:
        print(f"aviso: limpeza pasta: {exc}", file=sys.stderr)
    return removed


def delete_one(month: Path, destino: str) -> dict[str, Any]:
    item: dict[str, Any] = {
        "ok": False,
        "destino": destino,
        "arquivo": None,
        "removido": False,
        "pastas_removidas": [],
        "erro": None,
    }
    target = resolve_target(month, destino)
    if target is None or not is_safe_pdf(month, target):
        item["erro"] = "destino inválido ou fora da competência"
        return item

    item["arquivo"] = target.name
    item["destino"] = str(target.relative_to(month.resolve())).replace("\\", "/")

    if not target.exists():
        item["ok"] = True
        item["removido"] = False
        item["erro"] = None
        item["aviso"] = "arquivo já não existia"
        return item

    try:
        target.unlink()
    except OSError as exc:
        item["erro"] = f"falha ao excluir: {exc}"
        return item

    item["ok"] = True
    item["removido"] = True
    item["pastas_removidas"] = cleanup_empty_dirs(month, target)
    return item


def run(
    competencia: str,
    destinos: list[str],
    *,
    stream: bool = False,
) -> dict[str, Any]:
    if not COMPETENCIA_DIR_RE.match(competencia):
        payload = {
            "ok": False,
            "code": "INVALID_COMPETENCIA",
            "erro": "competência deve ser MM-YYYY",
            "competencia": competencia,
            "itens": [],
        }
        emit(payload, stream=stream)
        return payload

    if not destinos:
        payload = {
            "ok": False,
            "code": "NO_FILES",
            "erro": "nenhum destino informado",
            "competencia": competencia,
            "itens": [],
        }
        emit(payload, stream=stream)
        return payload

    workspace = resolve_workspace_root()
    lock = IngestLock(workspace / "resultados" / "ingest.lock")
    if not lock.acquire():
        payload = {
            "ok": False,
            "code": "LOCKED",
            "erro": "outra ingestão/exclusão em andamento",
            "competencia": competencia,
            "itens": [],
        }
        emit(payload, stream=stream)
        return payload

    try:
        month = ensure_competencia_dir(competencia)
        results = [delete_one(month, d) for d in destinos]

        rebuild_ok = True
        rebuild_error = None
        try:
            touch_paths: list[str] = []
            for item in results:
                destino = item.get("destino")
                if destino:
                    rel = empresa_relpath_from_destino(str(destino))
                    if rel:
                        touch_paths.append(rel)
            touch_paths = list(dict.fromkeys(touch_paths))
            emit_cb = (lambda payload: emit(payload, stream=True)) if stream else None
            rebuild_dashboard(
                only_competencias=[competencia],
                touch_relpaths=touch_paths or None,
                emit_event=emit_cb,
            )
        except Exception as exc:  # noqa: BLE001
            rebuild_ok = False
            rebuild_error = str(exc)
            print(f"REBUILD_FAILED: {exc}", file=sys.stderr)

        any_ok = any(r.get("ok") for r in results)
        payload = {
            "ok": rebuild_ok and any_ok,
            "code": None if rebuild_ok else "REBUILD_FAILED",
            "erro": rebuild_error,
            "competencia": competencia,
            "itens": results,
            "excluidos": sum(1 for r in results if r.get("removido")),
            "aviso_global": None
            if rebuild_ok
            else "Arquivos excluídos, mas JSON falhou — rode npm run data",
        }
        emit(payload, stream=stream)
        return payload
    finally:
        lock.release()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Exclui PDFs importados e regenera o dashboard")
    parser.add_argument("--competencia", required=True, help="MM-YYYY")
    parser.add_argument(
        "--destinos",
        nargs="+",
        required=True,
        help="Caminhos relativos (pendencias/EMP/file.pdf) ou absolutos",
    )
    parser.add_argument(
        "--stream",
        action="store_true",
        help="Mesmo formato JSON (compatível com callers que esperam stream)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    payload = run(args.competencia, list(args.destinos), stream=args.stream)
    return 0 if payload.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
