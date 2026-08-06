#!/usr/bin/env python3
"""Regressão: smoke-ECAC classifica, extrai valores e detecta competência 07-2026."""

from __future__ import annotations

import shutil
import sys
import tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from build_dashboard_data import (  # noqa: E402
    extract_documentos_from_pdf,
    parse_ecac_debitos,
    resolve_pdf_text,
)
from extrair_debitos import classify_text, detect_competencia_from_text  # noqa: E402


def assert_true(cond: bool, msg: str, failures: list[str]) -> None:
    if not cond:
        failures.append(msg)


def find_smoke_pdf() -> Path | None:
    candidates = [
        Path(r"c:\Users\trind\Downloads\smoke-ECAC.pdf"),
        SCRIPTS.parent / "resultados" / "_smoke" / "smoke-ECAC.pdf",
    ]
    # Também procura na competência 08
    root = SCRIPTS.parent / "2. RELAÇÃO DE DEBITOS"
    for folder in root.glob("*/**/smoke-ECAC.pdf"):
        candidates.append(folder)
    for path in candidates:
        if path.exists():
            return path
    return None


def main() -> int:
    failures: list[str] = []
    path = find_smoke_pdf()
    assert_true(path is not None, "smoke-ECAC.pdf ausente", failures)
    if path is None:
        print("FALHAS:")
        for item in failures:
            print(" -", item)
        return 1

    print("PDF:", path)
    text, mode, _ = resolve_pdf_text(path, "ECAC")
    print("texto via", mode, "len", len(text))

    classe, tipos = classify_text(text)
    assert_true(classe == "COM_PENDENCIA", f"classe={classe} tipos={tipos}", failures)

    comp, emissao = detect_competencia_from_text(text)
    assert_true(comp == "07-2026", f"competência={comp} emissao={emissao}", failures)

    rows = parse_ecac_debitos(text, "ECAC", path.name, "federal", path=path)
    assert_true(len(rows) >= 5, f"esperado >=5 linhas, obtido {len(rows)}", failures)
    consolidado = round(sum(r["consolidado"] for r in rows), 2)
    assert_true(
        abs(consolidado - 1149.68) < 0.05,
        f"consolidado={consolidado}, esperado ~1149.68",
        failures,
    )

    # Mesmo com pasta_status regular, não pode zerar
    docs, _ = extract_documentos_from_pdf(
        pdf_name="smoke-ECAC.pdf",
        text=text,
        pasta_status="regular",
        path=path,
    )
    assert_true(
        len(docs[0]["debitos"]) >= 5,
        f"wipe ainda ativo: {len(docs[0]['debitos'])} débitos",
        failures,
    )
    assert_true(
        docs[0]["statusDoc"] == "pendencia",
        f"statusDoc={docs[0]['statusDoc']}",
        failures,
    )

    if failures:
        print("FALHAS:")
        for item in failures:
            print(" -", item)
        return 1
    print(
        f"OK: classe={classe} competencia={comp} lanc={len(rows)} consolidado={consolidado}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
