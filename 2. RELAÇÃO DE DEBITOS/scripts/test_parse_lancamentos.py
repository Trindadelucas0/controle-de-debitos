#!/usr/bin/env python3
"""Testes de lançamentos ECAC (literais), sanidade e amostras conhecidas."""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from build_dashboard_data import (  # noqa: E402
    parse_ecac_debitos,
    parse_ecac_debitos_regex,
    parse_ecac_from_literals,
)

FIXTURE_DCTFWEB_SIEF_TEXT = """
Diagnóstico Fiscal na Receita Federal
Pendência - Omissão de DCTFWeb*
(Período de Apuração)
2025 - AGO SET OUT NOV DEZ
2026 - JAN FEV MAR ABR MAI
Pendência - Débito (SIEF)
Receita PA/Exerc. Dt. Vcto Vl. Original Sdo. Devedor Multa Juros Sdo. Dev. Cons. Situação
4406-01 - MAED - PGDAS-D 23/09/2025 16/06/2026 50,00 50,00 0,00 1,11 51,11 DEVEDOR
Notificação de lançamento: 50000433345672
"""

FIXTURE_DCTFWEB_SIEF_LITERALS = [
    "Diagnóstico Fiscal na Receita Federal",
    "Pendência - Omissão de DCTFWeb*",
    "(Período de Apuração)",
    "2025 - AGO SET OUT NOV DEZ",
    "2026 - JAN FEV MAR ABR MAI",
    "Pendência - Débito (SIEF)",
    "Receita",
    "PA/Exerc.",
    "Dt. Vcto",
    "Vl. Original",
    "Sdo. Devedor",
    "Multa",
    "Juros",
    "Sdo. Dev. Cons.",
    "Situação",
    "4406-01 - MAED - PGDAS-D",
    "23/09/2025",
    "16/06/2026",
    "50,00",
    "50,00",
    "0,00",
    "1,11",
    "51,11",
    "DEVEDOR",
    "Notificação de lançamento: 50000433345672",
]
from extrair_debitos import (  # noqa: E402
    find_pdf_by_name,
    pdf_string_literals,
    resolve_month_dir,
)


def assert_true(cond: bool, msg: str, failures: list[str]) -> None:
    if not cond:
        failures.append(msg)


def test_fixture_dctfweb_sief_literals(failures: list[str]) -> None:
    rows = parse_ecac_from_literals(FIXTURE_DCTFWEB_SIEF_LITERALS, "ECAC", "62-ECAC.pdf", "federal")
    omissao = [r for r in rows if r.get("situacao") == "OMISSAO"]
    sief = [r for r in rows if r.get("titulo") == "DEBITO (SIEF)"]
    expected_pa = {
        "AGO/2025",
        "SET/2025",
        "OUT/2025",
        "NOV/2025",
        "DEZ/2025",
        "JAN/2026",
        "FEV/2026",
        "MAR/2026",
        "ABR/2026",
        "MAI/2026",
    }
    assert_true(len(omissao) == 10, f"literais: esperado 10 omissões, obtido {len(omissao)}", failures)
    assert_true(
        {r["pa"] for r in omissao} == expected_pa,
        f"literais: PAs de omissão inesperados {[r['pa'] for r in omissao]}",
        failures,
    )
    assert_true(
        all(r.get("titulo") == "OMISSAO DE DCTFWEB" for r in omissao),
        "literais: omissão sem titulo OMISSAO DE DCTFWEB",
        failures,
    )
    assert_true(len(sief) == 1, f"literais: esperado 1 SIEF, obtido {len(sief)}", failures)
    if sief:
        row = sief[0]
        assert_true("4406-01" in row["receita"], f"literais: receita SIEF={row['receita']}", failures)
        assert_true(row["pa"] == "23/09/2025", f"literais: PA SIEF={row['pa']}", failures)
        assert_true(abs(row["consolidado"] - 51.11) < 0.02, f"literais: consol={row['consolidado']}", failures)
        assert_true(
            row.get("numero_lancamento") == "50000433345672",
            f"literais: notificação={row.get('numero_lancamento')}",
            failures,
        )


def test_fixture_dctfweb_sief_regex(failures: list[str]) -> None:
    rows = parse_ecac_debitos_regex(FIXTURE_DCTFWEB_SIEF_TEXT, "ECAC", "62-ECAC.pdf", "federal")
    omissao = [r for r in rows if r.get("situacao") == "OMISSAO"]
    sief = [r for r in rows if r.get("titulo") == "DEBITO (SIEF)"]
    assert_true(len(omissao) == 10, f"regex: esperado 10 omissões, obtido {len(omissao)}", failures)
    assert_true("AGO/2025" in {r["pa"] for r in omissao}, "regex: falta AGO/2025", failures)
    assert_true("MAI/2026" in {r["pa"] for r in omissao}, "regex: falta MAI/2026", failures)
    assert_true(len(sief) == 1, f"regex: esperado 1 SIEF, obtido {len(sief)}", failures)
    if sief:
        assert_true("4406-01" in sief[0]["receita"], f"regex: receita={sief[0]['receita']}", failures)
        assert_true(abs(sief[0]["consolidado"] - 51.11) < 0.02, f"regex: consol={sief[0]['consolidado']}", failures)


def test_fixture_titulo_quebrado_em_tokens(failures: list[str]) -> None:
    literals = [
        "Pendência -",
        "Omissão de DCTFWeb*",
        "2025 - AGO SET",
        "Pendência -",
        "Débito (SIEF)",
        "4406-01 - MAED - PGDAS-D",
        "23/09/2025",
        "16/06/2026",
        "50,00",
        "50,00",
        "0,00",
        "1,11",
        "51,11",
        "DEVEDOR",
    ]
    rows = parse_ecac_from_literals(literals, "ECAC", "62-ECAC.pdf", "federal")
    titulos = {r.get("titulo") for r in rows}
    assert_true("OMISSAO DE DCTFWEB" in titulos, f"titulo quebrado: falta omissão {titulos}", failures)
    assert_true("DEBITO (SIEF)" in titulos, f"titulo quebrado: falta SIEF {titulos}", failures)
    sief = next((r for r in rows if r.get("titulo") == "DEBITO (SIEF)"), None)
    assert_true(sief is not None and "4406-01" in sief["receita"], "titulo quebrado: linha SIEF ausente", failures)


FIXTURE_138_SUSPENSO_LITERALS = [
    "Pendência - Omissão de DCTFWeb*",
    "(Período de Apuração)",
    "2025 - AGO SET OUT NOV DEZ",
    "2026 - JAN FEV MAR ABR MAI",
    "Pendência - Débito (SIEF)",
    "4406-01 - MAED - PGDAS-D",
    "23/09/2025",
    "16/06/2026",
    "50,00",
    "50,00",
    "0,00",
    "1,11",
    "51,11",
    "DEVEDOR",
    "Notificação de lançamento: 62348547202508001",
    "SIMPLES NAC.",
    "03/2026",
    "20/04/2026",
    "5.627,41",
    "5.627,41",
    "1.125,48",
    "248,16",
    "7.001,05",
    "DEVEDOR",
    "Débito com Exigibilidade Suspensa (SIEF)",
    "4406-01 - MAED - PGDAS-D",
    "21/07/2026",
    "18/08/2026",
    "59,09",
    "59,09",
    "A VENCER",
    "Notificação de lançamento: 62348547202606001",
]


def test_fixture_titulo_suspenso_sief_antes_de_debito_sief(failures: list[str]) -> None:
    rows = parse_ecac_from_literals(FIXTURE_138_SUSPENSO_LITERALS, "ECAC", "138-ECAC.pdf", "federal")
    omissao = [r for r in rows if r.get("situacao") == "OMISSAO"]
    sief = [r for r in rows if r.get("titulo") == "DEBITO (SIEF)"]
    suspenso = [r for r in rows if r.get("titulo") == "DEBITO SUSPENSO"]
    assert_true(len(omissao) == 10, f"138: esperado 10 omissões, obtido {len(omissao)}", failures)
    assert_true(len(sief) == 2, f"138: esperado 2 SIEF (MAED+SIMPLES), obtido {len(sief)}", failures)
    assert_true(len(suspenso) == 1, f"138: esperado 1 suspenso, obtido {len(suspenso)}", failures)
    if suspenso:
        row = suspenso[0]
        assert_true(row["pa"] == "21/07/2026", f"138: PA suspenso={row['pa']}", failures)
        assert_true(row["situacao"] == "A VENCER", f"138: situacao={row['situacao']}", failures)
        assert_true(abs(row["saldo"] - 59.09) < 0.02, f"138: saldo suspenso={row['saldo']}", failures)
        assert_true(
            row.get("numero_lancamento") == "62348547202606001",
            f"138: notif suspenso={row.get('numero_lancamento')}",
            failures,
        )
    simples = next((r for r in sief if r["receita"].startswith("SIMPLES")), None)
    assert_true(simples is not None, "138: falta SIMPLES NAC. no Débito (SIEF)", failures)
    if simples:
        assert_true(abs(simples["consolidado"] - 7001.05) < 0.02, f"138: simples={simples['consolidado']}", failures)


def test_pdf_138_conect_calibracao(failures: list[str]) -> None:
    path = Path(r"C:\Users\trind\Downloads\0_138-ECAC.pdf")
    if not path.exists():
        print("skip 0_138-ECAC.pdf (não está em Downloads)")
        return
    rows = parse_ecac_debitos("", "ECAC", "138-ECAC.pdf", "federal", path=path)
    omissao = [r for r in rows if r.get("situacao") == "OMISSAO"]
    sief = [r for r in rows if r.get("titulo") == "DEBITO (SIEF)"]
    suspenso = [r for r in rows if r.get("titulo") == "DEBITO SUSPENSO"]
    assert_true(len(omissao) == 10, f"pdf 138: omissões={len(omissao)}", failures)
    assert_true(len(sief) == 9, f"pdf 138: SIEF esperado 9 (8 MAED + Simples), obtido {len(sief)}", failures)
    assert_true(len(suspenso) == 1, f"pdf 138: suspenso={len(suspenso)}", failures)
    assert_true(
        not any(r.get("titulo") == "DEBITO SUSPENSO" and r.get("situacao") == "DEVEDOR" for r in rows),
        "pdf 138: débito SIEF vazou para título suspenso",
        failures,
    )
    if suspenso:
        assert_true(suspenso[0]["situacao"] == "A VENCER", f"pdf 138: suspenso sit={suspenso[0]['situacao']}", failures)


def test_fixture_merge_nao_descarta_omissao(failures: list[str]) -> None:
    rows = parse_ecac_debitos(
        FIXTURE_DCTFWEB_SIEF_TEXT,
        "ECAC",
        "62-ECAC.pdf",
        "federal",
    )
    titulos = {r.get("titulo") for r in rows}
    assert_true("OMISSAO DE DCTFWEB" in titulos, f"merge: falta omissão em {titulos}", failures)
    assert_true("DEBITO (SIEF)" in titulos, f"merge: falta SIEF em {titulos}", failures)


def test_sample_86(month: Path, failures: list[str]) -> None:
    path = find_pdf_by_name(month, "86-ECAC.pdf")
    if path is None:
        print("skip 86-ECAC.pdf (ausente nesta competência)")
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
    if path is None:
        print("skip 03-ECAC.pdf (ausente nesta competência)")
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
            if row.get("situacao") != "OMISSAO" and (
                row["multa"] > 0 or row["juros"] > 0 or abs(row["consolidado"] - row["saldo"]) > 0.01
            ):
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
    test_fixture_dctfweb_sief_literals(failures)
    test_fixture_dctfweb_sief_regex(failures)
    test_fixture_titulo_quebrado_em_tokens(failures)
    test_fixture_titulo_suspenso_sief_antes_de_debito_sief(failures)
    test_fixture_merge_nao_descarta_omissao(failures)
    test_pdf_138_conect_calibracao(failures)
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
