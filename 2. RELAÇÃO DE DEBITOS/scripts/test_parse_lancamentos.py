#!/usr/bin/env python3
"""Testes de lançamentos ECAC (literais), sanidade e amostras conhecidas."""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from build_dashboard_data import (  # noqa: E402
    parse_ecac_debitos,
    parse_ecac_from_literals,
)
from extrair_debitos import (  # noqa: E402
    find_pdf_by_name,
    pdf_string_literals,
    resolve_month_dir,
)


def assert_true(cond: bool, msg: str, failures: list[str]) -> None:
    if not cond:
        failures.append(msg)


def test_sample_86(month: Path, failures: list[str]) -> None:
    path = find_pdf_by_name(month, "86-ECAC.pdf")
    assert_true(path is not None, "86-ECAC.pdf ausente", failures)
    if path is None:
        return
    rows = parse_ecac_debitos("", "ECAC", path.name, "federal", path=path)
    assert_true(len(rows) >= 1, f"86-ECAC: esperado >=1 linha, obtido {len(rows)}", failures)
    hit = next(
        (
            r
            for r in rows
            if r.get("numero_lancamento") == "50000433345672"
            and "5440-01" in r["receita"]
        ),
        None,
    )
    assert_true(hit is not None, "86-ECAC: falta notificação 50000433345672 / 5440-01", failures)
    if hit:
        assert_true(
            abs(hit["consolidado"] - 210.98) < 0.02,
            f"86-ECAC: consolidado esperado 210.98, obtido {hit['consolidado']}",
            failures,
        )
        assert_true(hit.get("codigo") == "86", "86-ECAC: codigo != 86", failures)
        assert_true(hit.get("esfera") == "federal", "86-ECAC: esfera != federal", failures)


def test_sample_03_no_regression(month: Path, failures: list[str]) -> None:
    path = find_pdf_by_name(month, "03-ECAC.pdf")
    assert_true(path is not None, "03-ECAC.pdf ausente", failures)
    if path is None:
        return
    rows = parse_ecac_debitos("", "ECAC", path.name, "federal", path=path)
    assert_true(
        len(rows) >= 15,
        f"03-ECAC: regressão — esperado >=15 linhas, obtido {len(rows)}",
        failures,
    )


def test_row_sanity(month: Path, failures: list[str]) -> None:
    samples = ["86-ECAC.pdf", "03-ECAC.pdf", "13-ECAC.pdf", "30-ECAC.pdf"]
    for name in samples:
        path = find_pdf_by_name(month, name)
        if path is None:
            continue
        rows = parse_ecac_from_literals(pdf_string_literals(path), "ECAC", name, "federal")
        for row in rows:
            for key in ("original", "saldo", "multa", "juros", "consolidado"):
                assert_true(row[key] >= 0, f"{name}: {key}<0 em {row.get('receita')}", failures)
            expected = round(row["saldo"] + row["multa"] + row["juros"], 2)
            # só valida quando tem os 3 componentes preenchidos (padrão 5 valores)
            if row["multa"] > 0 or row["juros"] > 0 or abs(row["consolidado"] - row["saldo"]) > 0.01:
                assert_true(
                    abs(row["consolidado"] - expected) <= 0.05,
                    f"{name}: consolidado {row['consolidado']} != saldo+multa+juros {expected} ({row.get('receita')})",
                    failures,
                )
            assert_true(bool(row.get("codigo")), f"{name}: linha sem codigo", failures)
            assert_true(row.get("esfera") == "federal", f"{name}: esfera inválida", failures)


def main() -> int:
    month = resolve_month_dir()
    failures: list[str] = []
    print("Pasta:", month)
    test_sample_86(month, failures)
    test_sample_03_no_regression(month, failures)
    test_row_sanity(month, failures)
    if failures:
        print("FALHAS:")
        for item in failures:
            print(" -", item)
        return 1
    print("OK: testes de lançamentos passaram")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
