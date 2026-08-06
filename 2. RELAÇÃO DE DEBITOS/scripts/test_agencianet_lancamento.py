#!/usr/bin/env python3
"""Testes do layout Agenci@Net Lançamento Administrativo / DAR."""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from build_dashboard_data import (  # noqa: E402
    detect_agencianet_layout,
    detect_content_tipo,
    parse_agencianet_debitos,
)
from extrair_debitos import classify_text, extract_company  # noqa: E402

FIXTURE = """
GOVERNO DO DISTRITO FEDERAL
SECRETARIA DE ESTADO DE FAZENDA
SUBSECRETARIA DA RECEITA
LANÇAMENTO ADMINISTRATIVO
NOME OU RAZÃO SOCIAL
JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS LTDA
CPF/CNPJ
21051983000165
CÓDIGO DA RECEITA
6176
NOME DA RECEITA
6176 - TAXA FISCALIZACAO DE ESTABELECIMENTO - TFE
№ LANÇAMENTO
0005504044
PERÍODO (MÊS/ANO)
01/2026 A 12/2026
QUANTIDADE DE COTAS
1
RELAÇÃO DE COTAS
COTA
DATA DE VENC.
VAL. PRINCIPAL
VAL. MULTA
VAL. JUROS
VAL. TOTAL
SIT.
VAL. P/ PAG. ATÉ
00
31/07/2026
66,65
3,33
0,70
70,68
00
31/08/2026
856900000006 706800093108 826000306041 651100639657
DOCUMENTO DE ARRECADAÇÃO -
DAR
www2.agencianet.fazenda.df.gov.br/extranet.publica/GerarBoletoInternet/
13 PRINCIPAL
66,65
14 MULTA
3,33
15 JURO DE MORA
0,70
17 VALOR TOTAL
70,68
"""

# Layout real com zero-width space (como no 136-AGENCIANET.pdf)
FIXTURE_ZWSP = (
    "LANÇAMENTO ADMINISTRATIVO\n"
    "NOME OU RAZÃO SOCIAL\n"
    "\u200bDIVEMARCA INDUSTRIA, COMERCIO E DISTRIBUICAO LTDA\n"
    "CPF/CNPJ\n"
    "\u200b42288133000155\n"
    "ENDEREÇO PARA CORRESPONDÊNCIA\n"
    "AREA ADE CONJUNTO 12\n"
)

def assert_true(cond: bool, msg: str, failures: list[str]) -> None:
    if not cond:
        failures.append(msg)


def test_layout_and_tipo(failures: list[str]) -> None:
    assert_true(
        detect_agencianet_layout(FIXTURE) == "lancamento_admin",
        "layout esperado lancamento_admin",
        failures,
    )
    tipo, forte = detect_content_tipo(FIXTURE)
    assert_true(tipo == "AGENCIANET", f"tipo esperado AGENCIANET, obtido {tipo}", failures)
    assert_true(forte, "detecção de tipo deveria ser forte", failures)
    # Mesmo se o arquivo chamar ECAC, conteúdo manda
    tipo2, _ = detect_content_tipo(FIXTURE)
    assert_true(tipo2 == "AGENCIANET", "conteúdo DAR não pode ser ECAC", failures)


def test_parse_dar(failures: list[str]) -> None:
    rows = parse_agencianet_debitos(FIXTURE, "AGENCIANET", "711-ECAC.pdf")
    assert_true(len(rows) == 1, f"esperado 1 linha, obtido {len(rows)}", failures)
    if not rows:
        return
    row = rows[0]
    assert_true("6176" in row["receita"], f"receita sem 6176: {row['receita']}", failures)
    assert_true("TFE" in row["receita"].upper(), f"receita sem TFE: {row['receita']}", failures)
    assert_true(abs(row["consolidado"] - 70.68) < 0.02, f"consolidado {row['consolidado']}", failures)
    assert_true(abs(row["original"] - 66.65) < 0.02, f"original {row['original']}", failures)
    assert_true(abs(row["multa"] - 3.33) < 0.02, f"multa {row['multa']}", failures)
    assert_true(abs(row["juros"] - 0.70) < 0.02, f"juros {row['juros']}", failures)
    assert_true(row.get("esfera") == "estadual", f"esfera {row.get('esfera')}", failures)
    assert_true(
        row.get("numero_lancamento") == "0005504044",
        f"lançamento {row.get('numero_lancamento')}",
        failures,
    )


def test_classify_pendencia(failures: list[str]) -> None:
    classe, tipos = classify_text(FIXTURE)
    assert_true(classe == "COM_PENDENCIA", f"classe {classe}", failures)
    assert_true(
        "LANCAMENTO_ADMIN_ESTADUAL" in tipos,
        f"tipos {tipos}",
        failures,
    )


def test_no_invent_empty(failures: list[str]) -> None:
    empty = "GOVERNO DO DISTRITO FEDERAL pagina inicial menu agencianet"
    rows = parse_agencianet_debitos(empty, "AGENCIANET", "99-AGENCIANET.pdf")
    assert_true(len(rows) == 0, f"não deve inventar linhas: {len(rows)}", failures)


def test_extract_company_dar(failures: list[str]) -> None:
    cnpj, nome = extract_company(FIXTURE)
    assert_true(cnpj == "21.051.983/0001-65", f"CNPJ JPG: {cnpj}", failures)
    assert_true(
        nome is not None and "JPG" in nome.upper() and "PRODUTOS" in nome.upper(),
        f"nome JPG: {nome!r}",
        failures,
    )

    cnpj2, nome2 = extract_company(FIXTURE_ZWSP)
    assert_true(cnpj2 == "42.288.133/0001-55", f"CNPJ DIVEMARCA: {cnpj2}", failures)
    assert_true(
        nome2 is not None and "DIVEMARCA" in nome2.upper(),
        f"nome DIVEMARCA (com ZWSP): {nome2!r}",
        failures,
    )


def main() -> int:
    failures: list[str] = []
    test_layout_and_tipo(failures)
    test_parse_dar(failures)
    test_classify_pendencia(failures)
    test_no_invent_empty(failures)
    test_extract_company_dar(failures)
    if failures:
        print("FALHAS:")
        for item in failures:
            print(" -", item)
        return 1
    print("OK: Agenci@Net Lançamento Administrativo / DAR")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
