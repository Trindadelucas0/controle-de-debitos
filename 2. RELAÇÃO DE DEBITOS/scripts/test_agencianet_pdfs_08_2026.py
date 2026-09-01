#!/usr/bin/env python3
"""Regressão nos Agenci@Net 149/159/184/190 (08-2026) + preview titulos."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))

from build_dashboard_data import best_text, parse_agencianet_debitos  # noqa: E402
from extrair_debitos import classify_text  # noqa: E402
from ingest_upload import ingest_one  # noqa: E402

PDF_BASE = (
    ROOT
    / "2. RELAÇÃO DE DEBITOS"
    / "08-2026"
    / "pendencias"
)

CASES = [
    (
        "LOJAO DAS FERRAMENTAS LTDA-ME",
        "149-AGENCIANET.pdf",
        1,
        "A VENCER",
        0.0,
    ),
    (
        "GABRIELA FARIAS SOCIEDADE INDIVIDUAL DE ADVOCACIA",
        "159-AGENCIANET.pdf",
        1,
        "DEVEDOR",
        53.98,
    ),
    (
        "MERCADO RPG MINIATURAS E ACESSORIOS LTDA-ME",
        "184-AGENCIANET.pdf",
        2,
        "DEVEDOR",
        53.98,
    ),
    (
        "J C DOS SANTOS RIBEIRO BARBEARIA",
        "190-AGENCIANET.pdf",
        1,
        "DEVEDOR",
        70.68,
    ),
]


def assert_true(cond: bool, msg: str, failures: list[str]) -> None:
    if not cond:
        failures.append(msg)


def test_pdf_extracao(failures: list[str]) -> None:
    for folder, pdf_name, min_rows, situacao, min_valor in CASES:
        path = PDF_BASE / folder / pdf_name
        if not path.exists():
            failures.append(f"PDF ausente: {path}")
            continue
        text, mode = best_text(path)
        classe, _tipos = classify_text(text)
        rows = parse_agencianet_debitos(text, "AGENCIANET", pdf_name)
        assert_true(
            len(rows) >= min_rows,
            f"{pdf_name} rows={len(rows)} esperado>={min_rows} mode={mode}",
            failures,
        )
        assert_true(
            classe == "COM_PENDENCIA",
            f"{pdf_name} classe={classe}",
            failures,
        )
        if min_rows == 1 and min_valor == 0:
            avencer = [r for r in rows if (r.get("situacao") or "").upper() == situacao]
            assert_true(len(avencer) >= 1, f"{pdf_name} sem A VENCER", failures)
        else:
            com_valor = [r for r in rows if float(r.get("consolidado") or 0) >= min_valor - 0.02]
            assert_true(
                len(com_valor) >= 1,
                f"{pdf_name} sem valor>={min_valor} rows={rows}",
                failures,
            )


def test_ingest_titulos_receita(failures: list[str]) -> None:
    """Preview deve listar receita na coluna titulos quando não há titulo ECAC."""
    path = PDF_BASE / "GABRIELA FARIAS SOCIEDADE INDIVIDUAL DE ADVOCACIA" / "159-AGENCIANET.pdf"
    if not path.exists():
        failures.append(f"PDF ausente para titulos: {path}")
        return
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        month = tmp_path / "08-2026"
        month.mkdir(parents=True)
        inbox = tmp_path / "159-AGENCIANET.pdf"
        inbox.write_bytes(path.read_bytes())
        with patch("ingest_upload.is_pdf_magic", return_value=True):
            item = ingest_one(
                inbox,
                tipo="AGENCIANET",
                month=month,
                indexes={"08-2026": []},
                selected_competencia="08-2026",
                dry_run=True,
            )
        assert_true(item.get("ok") is True, f"ok={item.get('ok')} erro={item.get('erro')}", failures)
        titulos = item.get("titulos") or []
        assert_true(
            any("TFE" in str(t).upper() for t in titulos),
            f"titulos sem TFE: {titulos}",
            failures,
        )
        assert_true((item.get("qtd_debitos") or 0) >= 1, f"qtd={item.get('qtd_debitos')}", failures)


def main() -> int:
    failures: list[str] = []
    test_pdf_extracao(failures)
    test_ingest_titulos_receita(failures)
    if failures:
        for msg in failures:
            print(f"FAIL: {msg}", file=sys.stderr)
        return 1
    print("OK test_agencianet_pdfs_08_2026")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
