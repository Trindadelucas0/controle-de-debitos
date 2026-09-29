#!/usr/bin/env python3
"""Testes de lançamentos ECAC (literais), sanidade e amostras conhecidas."""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from build_dashboard_data import (  # noqa: E402
    parse_ecac_apoio_sem_valor,
    parse_ecac_debitos,
    parse_ecac_debitos_regex,
    parse_ecac_from_literals,
    resolve_pdf_text,
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
    decode_pdf_literal_bytes,
    find_pdf_by_name,
    parse_ecac_apoio_certidao,
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


FIXTURE_OUTRAS_SECOES_LITERALS = [
    "Pendência - Omissão de DIRF*",
    "(Período de Apuração)",
    "2024 - JAN FEV",
    "Pendência - Inscrição (SIDA)",
    "1082-01 - CP-SEGUR.",
    "01/2024",
    "20/02/2024",
    "100,00",
    "100,00",
    "10,00",
    "5,00",
    "115,00",
    "DEVEDOR",
    "Pendência - Processo Fiscal (SIEF)",
    "1099-01 - CP-SEGUR.",
    "02/2024",
    "20/03/2024",
    "200,00",
    "200,00",
    "0,00",
    "0,00",
    "200,00",
    "DEVEDOR",
    "Pendência - Parcelamento (PARCSN/PARCMEI)",
    "1507-SIMPLES",
    "03/2024",
    "20/04/2024",
    "300,00",
    "300,00",
    "0,00",
    "0,00",
    "300,00",
    "PARCELADO",
]


def test_fixture_outras_secoes_ecac(failures: list[str]) -> None:
    rows = parse_ecac_from_literals(
        FIXTURE_OUTRAS_SECOES_LITERALS, "ECAC", "30-ECAC.pdf", "federal"
    )
    titulos = {r.get("titulo") for r in rows}
    assert_true("OMISSAO DE DIRF" in titulos, f"outras: falta DIRF {titulos}", failures)
    assert_true("INSCRICAO (SIDA)" in titulos, f"outras: falta SIDA {titulos}", failures)
    assert_true("PROCESSO FISCAL (SIEF)" in titulos, f"outras: falta processo {titulos}", failures)
    assert_true(
        "PARCELAMENTO (PARCSN/PARCMEI)" in titulos,
        f"outras: falta parcelamento {titulos}",
        failures,
    )
    dirf = [r for r in rows if r.get("titulo") == "OMISSAO DE DIRF"]
    assert_true(len(dirf) == 1, f"outras: esperado 1 DIRF anual, obtido {len(dirf)} {dirf}", failures)
    if dirf:
        assert_true(dirf[0].get("pa") == "2024", f"DIRF PA={dirf[0].get('pa')}", failures)
    sida = next((r for r in rows if r.get("titulo") == "INSCRICAO (SIDA)"), None)
    assert_true(sida is not None and "1082-01" in (sida.get("receita") or ""), "outras: linha SIDA", failures)
    proc = next((r for r in rows if r.get("titulo") == "PROCESSO FISCAL (SIEF)"), None)
    assert_true(proc is not None and "1099-01" in (proc.get("receita") or ""), "outras: linha processo", failures)
    parc = next((r for r in rows if r.get("titulo") == "PARCELAMENTO (PARCSN/PARCMEI)"), None)
    assert_true(parc is not None and "SIMPLES" in (parc.get("receita") or ""), "outras: linha parcelamento", failures)


FIXTURE_APOIO_21_TEXT = """
INFORMAÇÕES DE APOIO PARA EMISSÃO DE CERTIDÃO
CNPJ: 53.870.461 - THE MINAS GASTRO BAR LTDA
Dados Cadastrais da Matriz ______________________________________________________________________________________
CNPJ: 53.870.461/0001-81
Responsável: 117.851.596-66 - LARISSA IZABEL NUNES LEMOS
Situação: ATIVA
Natureza Jurídica: 206-2 - SOCIEDADE EMPRESARIA LIMITADA
Sócios e Administradores ________________________________________________________________________________________
CPF/CNPJ
Nome
Qualificação
Situação Cadastral
Cap. Social
Cap. Votante
123.837.876-55
WILKER ZUETE ROCHA
SÓCIO
REGULAR
50,00%
117.851.596-66
LARISSA IZABEL NUNES LEMOS
SÓCIO-ADMINISTRADOR
REGULAR
50,00%
_____________________________________ Diagnóstico Fiscal na Receita Federal _____________________________________
Parcelamento com Exigibilidade Suspensa (PARCSN/PARCMEI) ________________________________________________________
CNPJ: 53.870.461/0001-81
SIMPLES NACIONAL - EM PARCELAMENTO
Pendência - Processo Fiscal (SIEF) ______________________________________________________________________________
CNPJ: 53.870.461/0001-81
Processo
Situação
Localização
10641.078.734/2026-50
DEVEDOR
SETOR PROC ELETRONICO REFIS DRF BSB DF
__________________________ Diagnóstico Fiscal na Procuradoria-Geral da Fazenda Nacional _________________________
Página: 1 / 2
MINISTÉRIO DA FAZENDA
INFORMAÇÕES DE APOIO PARA EMISSÃO DE CERTIDÃO
CNPJ: 53.870.461 - THE MINAS GASTRO BAR LTDA
Inscrição com Exigibilidade Suspensa (SIDA) _____________________________________________________________________
CNPJ: 53.870.461/0001-81
Inscrição
Receita
Inscrito em
Ajuizado em
Processo
Tipo de Devedor
10.4.25.009172-06
1507-SIMPLES
NACIONAL
27/01/2025
12376.074.851/2025-76
DEVEDOR PRINCIPAL
Situação: ATIVA NAO AJUIZAVEL NEGOCIADA NO SISPAR
Parcelamento com Exigibilidade Suspensa (SISPAR) ________________________________________________________________
CNPJ: 53.870.461/0001-81
Conta
014959465
PARCELAMENTO CONVENCIONAL
Modalidade: PARCELAMENTO SEM GARANTIA  SIMPLES NACIONAL
_________________________________________________________________________________________________________________
Final do Relatório
O período de solicitação da opção pelo Simples Nacional para 2027 mudou para SETEMBRO 2026!
Página: 2 / 2
"""

FIXTURE_APOIO_80_TEXT = """
INFORMAÇÕES DE APOIO PARA EMISSÃO DE CERTIDÃO
CNPJ: 00.598.375 - COMERCIAL AVICOLA PROGRESSO LTDA
Dados Cadastrais da Matriz ______________________________________________________________________________________
CNPJ: 00.598.375/0001-03
Responsável: 011.179.911-21 - MICHEL MOMO DOS SANTOS
Situação: ATIVA
Sócios e Administradores ________________________________________________________________________________________
CPF/CNPJ
Nome
Qualificação
Situação Cadastral
Cap. Social
Cap. Votante
011.179.911-21
MICHEL MOMO DOS SANTOS
SÓCIO-ADMINISTRADOR
REGULAR
100,00%
Certidão Emitida ________________________________________________________________________________________________
CNPJ: 00.598.375/0001-03
Certidão Positiva com Efeitos de Negativa:  1E33.816E.A6A7.BD03
Emissão: 25/08/2026
Data de Validade: 21/02/2027
_____________________________________ Diagnóstico Fiscal na Receita Federal _____________________________________
Não foram detectadas pendências/exigibilidades suspensas para o contribuinte nos controles da Receita Federal.
__________________________ Diagnóstico Fiscal na Procuradoria-Geral da Fazenda Nacional _________________________
Pendência - Inscrição (SIDA) ____________________________________________________________________________________
CNPJ: 00.598.375/0001-03
Inscrição
Receita
Inscrito em
Ajuizado em
Processo
Tipo de Devedor
10.6.26.022639-00
5382-OUTRAS MULTAS
11/09/2026
21016.004.192/2020-86
DEVEDOR PRINCIPAL
Situação: ATIVA A SER COBRADA
Página: 1 / 2
MINISTÉRIO DA FAZENDA
INFORMAÇÕES DE APOIO PARA EMISSÃO DE CERTIDÃO
CNPJ: 00.598.375 - COMERCIAL AVICOLA PROGRESSO LTDA
Inscrição com Exigibilidade Suspensa (SIDA) _____________________________________________________________________
CNPJ: 00.598.375/0001-03
Inscrição
Receita
Inscrito em
Ajuizado em
Processo
Tipo de Devedor
10.2.24.011742-86
3551-IRPJ
11/11/2024
17227.720.254/2024-71
DEVEDOR PRINCIPAL
Situação: ATIVA NAO AJUIZAVEL NEGOCIADA NO SISPAR
10.6.24.004595-02
4834-- MULTA
ISOLADA
22/04/2024
19321.048.099/2024-10
DEVEDOR PRINCIPAL
Situação: ATIVA NAO AJUIZAVEL NEGOCIADA NO SISPAR
10.6.24.022055-83
1804-CONTRIBUICAO
SOCIAL
11/11/2024
17227.720.254/2024-71
DEVEDOR PRINCIPAL
Situação: ATIVA NAO AJUIZAVEL NEGOCIADA NO SISPAR
Parcelamento com Exigibilidade Suspensa (SISPAR) ________________________________________________________________
CNPJ: 00.598.375/0001-03
Conta
012825627
PARCELAMENTO CONVENCIONAL
Modalidade: PARCELAMENTO SEM GARANTIA  PESSOA JURIDICA  DIVIDA NAO PREVIDENCIARIA  ATE 15 MILHOES DE REAIS
_________________________________________________________________________________________________________________
Final do Relatório
Página: 2 / 2
"""

FIXTURE_APOIO_715_TEXT = """
INFORMAÇÕES DE APOIO PARA EMISSÃO DE CERTIDÃO
CNPJ: 55.061.632 - CENTRO MEDICO ESPECIALIZADO TJJ LTDA
Dados Cadastrais da Matriz ______________________________________________________________________________________
CNPJ: 55.061.632/0001-57
Responsável: 016.885.031-10 - JHEFFERSON BRANDAO BRETA
Situação: ATIVA
Sócios e Administradores ________________________________________________________________________________________
CPF/CNPJ
Nome
Qualificação
Situação Cadastral
Cap. Social
Cap. Votante
019.591.031-13
TUANNY DAMASCENO COELHO BRETA
SÓCIO
REGULAR
49,00%
016.885.031-10
JHEFFERSON BRANDAO BRETA
SÓCIO-ADMINISTRADOR
REGULAR
50,00%
Certidão Emitida ________________________________________________________________________________________________
CNPJ: 55.061.632/0001-57
Certidão Positiva com Efeitos de Negativa:  CAEE.4D71.2DBD.662A
Emissão: 10/12/2025
Data de Validade: 08/06/2026
_____________________________________ Diagnóstico Fiscal na Receita Federal _____________________________________
Não foram detectadas pendências/exigibilidades suspensas para o contribuinte nos controles da Receita Federal.
__________________________ Diagnóstico Fiscal na Procuradoria-Geral da Fazenda Nacional _________________________
Pendência - Inscrição (SIDA) ____________________________________________________________________________________
CNPJ: 55.061.632/0001-57
Inscrição
Receita
Inscrito em
Ajuizado em
Processo
Tipo de Devedor
10.4.26.093566-16
4133-CONTR.
SEGURADOS
24/08/2026
14966.799.357/2026-84
DEVEDOR PRINCIPAL
Situação: ATIVA A SER COBRADA
Página: 1 / 2
MINISTÉRIO DA FAZENDA
INFORMAÇÕES DE APOIO PARA EMISSÃO DE CERTIDÃO
CNPJ: 55.061.632 - CENTRO MEDICO ESPECIALIZADO TJJ LTDA
_________________________________________________________________________________________________________________
Final do Relatório
O período de solicitação da opção pelo Simples Nacional para 2027 mudou para SETEMBRO 2026!
Página: 2 / 2
"""

# Literais do PDF 715: "Situação:" e o valor chegam em tokens separados.
FIXTURE_APOIO_715_LITERALS = [
    "INFORMAÇÕES DE APOIO PARA EMISSÃO DE CERTIDÃO",
    "Pendência - Inscrição (SIDA) ____________________________________________________________________________________",
    "CNPJ: 55.061.632/0001-57",
    "Inscrição",
    "Receita",
    "Inscrito em",
    "Ajuizado em",
    "Processo",
    "Tipo de Devedor",
    "10.4.26.093566-16",
    "4133-CONTR.",
    "SEGURADOS",
    "24/08/2026",
    "14966.799.357/2026-84",
    "DEVEDOR PRINCIPAL",
    "Situação:",
    "ATIVA A SER COBRADA",
    "Final do Relatório",
]

APOIO_ESPERADO = {
    "21": (
        FIXTURE_APOIO_21_TEXT,
        [
            ("PARCELAMENTO SUSPENSO", "SIMPLES NACIONAL", "PARCELADO", None, None),
            ("PROCESSO FISCAL (SIEF)", "Processo fiscal", "DEVEDOR", "10641.078.734/2026-50", None),
            ("INSCRICAO SUSPENSA", "1507-SIMPLES NACIONAL", "PARCELADO", "12376.074.851/2025-76", "10.4.25.009172-06"),
            ("PARCELAMENTO SUSPENSO", "PARCELAMENTO SEM GARANTIA", "PARCELADO", "014959465", None),
        ],
    ),
    "80": (
        FIXTURE_APOIO_80_TEXT,
        [
            ("INSCRICAO (SIDA)", "5382-OUTRAS MULTAS", "DEVEDOR", "21016.004.192/2020-86", "10.6.26.022639-00"),
            ("INSCRICAO SUSPENSA", "3551-IRPJ", "PARCELADO", "17227.720.254/2024-71", "10.2.24.011742-86"),
            ("INSCRICAO SUSPENSA", "4834-- MULTA ISOLADA", "PARCELADO", "19321.048.099/2024-10", "10.6.24.004595-02"),
            ("INSCRICAO SUSPENSA", "1804-CONTRIBUICAO SOCIAL", "PARCELADO", "17227.720.254/2024-71", "10.6.24.022055-83"),
            ("PARCELAMENTO SUSPENSO", "PARCELAMENTO SEM GARANTIA", "PARCELADO", "012825627", None),
        ],
    ),
    "715": (
        FIXTURE_APOIO_715_TEXT,
        [
            ("INSCRICAO (SIDA)", "4133-CONTR. SEGURADOS", "DEVEDOR", "14966.799.357/2026-84", "10.4.26.093566-16"),
        ],
    ),
}


def _assert_apoio_rows(label: str, rows: list[dict], esperado: list[tuple], failures: list[str]) -> None:
    assert_true(len(rows) == len(esperado), f"apoio {label}: esperado {len(esperado)}, obtido {len(rows)} {rows}", failures)
    for row, (titulo, receita, situacao, lanc, insc) in zip(rows, esperado):
        got = (row.get("titulo"), row.get("situacao"), row.get("numero_lancamento"), row.get("inscricao"))
        assert_true(got == (titulo, situacao, lanc, insc), f"apoio {label}: linha {got}", failures)
        assert_true((row.get("receita") or "").startswith(receita), f"apoio {label}: receita={row.get('receita')}", failures)
        assert_true(row.get("consolidado") == 0 and row.get("saldo") == 0, f"apoio {label}: valor != 0", failures)


def test_fixture_apoio_sem_valor_ecac(failures: list[str]) -> None:
    """Informações de Apoio: inscrição/processo/parcelamento sem BRL viram lançamento valor 0."""
    for codigo, (text, esperado) in APOIO_ESPERADO.items():
        rows = parse_ecac_debitos(text, "ECAC", f"{codigo}-ECAC.pdf", "federal")
        _assert_apoio_rows(codigo, rows, esperado, failures)
        assert_true(
            not any("%" in (r.get("receita") or "") or "2027" in (r.get("receita") or "") for r in rows),
            f"apoio {codigo}: QSA ou aviso do Simples virou lançamento",
            failures,
        )
        cad = parse_ecac_apoio_certidao(text)
        assert_true(cad.get("situacaoEmpresa") == "ATIVA", f"apoio {codigo}: situacaoEmpresa={cad.get('situacaoEmpresa')}", failures)
        assert_true(bool(cad.get("qsa")), f"apoio {codigo}: qsa ausente", failures)

    literal_rows = parse_ecac_apoio_sem_valor(FIXTURE_APOIO_715_LITERALS, "ECAC", "715-ECAC.pdf", "federal")
    _assert_apoio_rows("715 literais", literal_rows, APOIO_ESPERADO["715"][1], failures)

    pagina_1, pagina_2 = FIXTURE_APOIO_80_TEXT.split("Página: 1 / 2")
    repetido = pagina_1 * 2 + pagina_2 * 2
    duplicado = parse_ecac_debitos(repetido, "ECAC", "80-ECAC.pdf", "federal")
    assert_true(len(duplicado) == 5, f"apoio 80 repetido: esperado 5, obtido {len(duplicado)}", failures)

    com_valor = parse_ecac_debitos("\n".join(FIXTURE_OUTRAS_SECOES_LITERALS), "ECAC", "30-ECAC.pdf", "federal")
    sida = next((r for r in com_valor if r.get("titulo") == "INSCRICAO (SIDA)"), None)
    assert_true(sida is not None and sida.get("original") == 100.0, f"outras: SIDA com valor mudou {sida}", failures)


def test_pdfs_apoio_sem_valor_reais(failures: list[str]) -> None:
    base = Path(
        r"C:\Users\trind\.cursor\projects\d-controle-de-debitos\attachments"
        r"\bc801986-3436-49f2-aeec-be29b832dbb3"
    )
    casos = {
        "21-ECAC-n_oimportou.pdf": 4,
        "80-ECAC_n_o_importou.pdf": 5,
        "715-ECAC_n_o_importou.pdf": 1,
    }
    for name, esperado in casos.items():
        path = base / name
        if not path.exists():
            print(f"skip {name} (anexo ausente)")
            continue
        text, _mode, _ = resolve_pdf_text(path, "ECAC")
        rows = parse_ecac_debitos(text, "ECAC", name, "federal", path=path)
        assert_true(len(rows) == esperado, f"pdf {name}: esperado {esperado}, obtido {len(rows)}", failures)
        assert_true(all(r.get("consolidado") == 0 for r in rows), f"pdf {name}: valor != 0", failures)
        cad = parse_ecac_apoio_certidao(text)
        assert_true(cad.get("situacaoEmpresa") == "ATIVA", f"pdf {name}: situacaoEmpresa", failures)
        assert_true(bool(cad.get("qsa")), f"pdf {name}: qsa ausente", failures)


def test_cid_literal_caesar(failures: list[str]) -> None:
    plain = "Pendencia - Omissao de DCTFWeb"
    shifted = "".join(chr(ord(ch) + 3) if 32 <= ord(ch) <= 123 else ch for ch in plain)
    raw = b"\x00".join(bytes([ord(ch)]) for ch in shifted)
    decoded = decode_pdf_literal_bytes(raw)
    assert_true(
        "pendencia" in decoded.lower() or "omissao" in decoded.lower() or "dctf" in decoded.lower(),
        f"cid caesar: decoded={decoded!r}",
        failures,
    )


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


FIXTURE_TJJ_SIEF_EXERCICIO_LITERALS = [
    "Pendência - Omissão de DCTFWeb*",
    "(Período de Apuração)",
    "2025 - DEZ",
    "Pendência - Débito (SIEF)",
    "1082-01 - CP-SEGUR.",
    "01/2026",
    "20/02/2026",
    "544,33",
    "544,33",
    "108,86",
    "36,52",
    "689,71",
    "DEVEDOR",
    "1082-21 - CP-SEGUR.",
    "2025",
    "19/12/2025",
    "471,12",
    "471,12",
    "94,22",
    "41,78",
    "607,12",
    "DEVEDOR",
]

FIXTURE_TJJ_SIEF_EXERCICIO_TEXT = """
Pendência - Omissão de DCTFWeb*
(Período de Apuração)
2025 - DEZ
Pendência - Débito (SIEF)
Receita PA/Exerc. Dt. Vcto Vl. Original Sdo. Devedor Multa Juros Sdo. Dev. Cons. Situação
1082-01 - CP-SEGUR. 01/2026 20/02/2026 544,33 544,33 108,86 36,52 689,71 DEVEDOR
1082-21 - CP-SEGUR. 2025 19/12/2025 471,12 471,12 94,22 41,78 607,12 DEVEDOR
"""

FIXTURE_JD76_CADASTRAL_LITERALS = [
    "Pendência - Irregularidade Cadastral ____________________________________________________________________________",
    "Inscrição inapta - Omissão de declarações",
    "Omissão de DCTF _________________________________________________________________________________________________",
    "(Período de Apuração)",
    "2023 - JAN FEV MAR ABR MAI JUN JUL AGO SET OUT NOV DEZ",
    "Omissão de EFD-CONTRIB __________________________________________________________________________________________",
    "(Período de Apuração)",
    "2023 - JAN FEV MAR ABR MAI JUN JUL AGO SET OUT NOV DEZ",
    "Pendência - Débito (SIEF) _______________________________________________________________________________________",
    "1345-01 - MAED - DCTF",
    "23/03/2022",
    "02/09/2022",
    "200,00",
    "200,00",
    "0,00",
    "96,38",
    "296,38",
    "DEVEDOR",
    "Notificação de lançamento: 16971011576964",
    "1345-01 - MAED - DCTF",
    "22/03/2021",
    "02/09/2022",
    "200,00",
    "200,00",
    "0,00",
    "96,38",
    "296,38",
    "DEVEDOR",
]


def test_fixture_sief_pa_exercicio_ano(failures: list[str]) -> None:
    rows = parse_ecac_from_literals(
        FIXTURE_TJJ_SIEF_EXERCICIO_LITERALS, "ECAC", "715-ECAC.pdf", "federal"
    )
    omissao = [r for r in rows if r.get("situacao") == "OMISSAO"]
    sief = [r for r in rows if r.get("titulo") == "DEBITO (SIEF)"]
    assert_true(len(omissao) == 1 and omissao[0]["pa"] == "DEZ/2025", f"TJJ: omissão={omissao}", failures)
    assert_true(len(sief) == 2, f"TJJ: esperado 2 SIEF, obtido {len(sief)}", failures)
    mensal = next((r for r in sief if r["pa"] == "01/2026"), None)
    exerc = next((r for r in sief if r["pa"] == "2025"), None)
    assert_true(mensal is not None and "1082-01" in mensal["receita"], "TJJ: falta 1082-01 01/2026", failures)
    assert_true(exerc is not None and "1082-21" in exerc["receita"], "TJJ: falta 1082-21 exercício 2025", failures)
    if exerc:
        assert_true(abs(exerc["original"] - 471.12) < 0.02, f"TJJ: original={exerc['original']}", failures)
        assert_true(abs(exerc["consolidado"] - 607.12) < 0.02, f"TJJ: consol={exerc['consolidado']}", failures)
    regex_rows = parse_ecac_debitos_regex(
        FIXTURE_TJJ_SIEF_EXERCICIO_TEXT, "ECAC", "715-ECAC.pdf", "federal"
    )
    regex_exerc = next(
        (r for r in regex_rows if r.get("titulo") == "DEBITO (SIEF)" and r.get("pa") == "2025"),
        None,
    )
    assert_true(regex_exerc is not None, "TJJ regex: falta SIEF PA 2025", failures)
    if regex_exerc:
        assert_true(abs(regex_exerc["original"] - 471.12) < 0.02, f"TJJ regex orig={regex_exerc['original']}", failures)


def test_fixture_jd76_efd_e_cadastral(failures: list[str]) -> None:
    rows = parse_ecac_from_literals(
        FIXTURE_JD76_CADASTRAL_LITERALS, "ECAC", "76-ECAC.pdf", "federal"
    )
    titulos = {r.get("titulo") for r in rows}
    assert_true("IRREGULARIDADE CADASTRAL" in titulos, f"76: falta cadastral {titulos}", failures)
    assert_true("OMISSAO DE DCTF" in titulos, f"76: falta DCTF {titulos}", failures)
    assert_true("OMISSAO DE EFD-CONTRIB" in titulos, f"76: falta EFD {titulos}", failures)
    assert_true(
        not any("_" in (r.get("titulo") or "") for r in rows),
        "76: título ainda com underscore do PDF",
        failures,
    )
    efd = [r for r in rows if r.get("titulo") == "OMISSAO DE EFD-CONTRIB"]
    dctf = [r for r in rows if r.get("titulo") == "OMISSAO DE DCTF"]
    cadastral = [r for r in rows if r.get("titulo") == "IRREGULARIDADE CADASTRAL"]
    sief = [r for r in rows if r.get("titulo") == "DEBITO (SIEF)"]
    assert_true(len(efd) == 12, f"76: EFD esperado 12, obtido {len(efd)}", failures)
    assert_true(len(dctf) == 12, f"76: DCTF esperado 12, obtido {len(dctf)}", failures)
    assert_true(len(sief) == 2, f"76: SIEF esperado 2, obtido {len(sief)}", failures)
    assert_true(len(cadastral) == 1, f"76: cadastral duplicada n={len(cadastral)} {cadastral}", failures)
    if cadastral:
        assert_true(
            "inapta" in (cadastral[0].get("receita") or "").lower(),
            f"76: receita cadastral={cadastral[0].get('receita')}",
            failures,
        )
        assert_true(cadastral[0].get("situacao") == "INAPTA", "76: situacao cadastral != INAPTA", failures)


FIXTURE_TJJ_138_SEM_VALOR_LITERALS = [
    "Diagnóstico Fiscal na Receita Federal",
    "CENTRO MEDICO ESPECIALIZADO TJJ LTDA",
    "CNPJ: 55.061.632/0001-57",
    "Pendência - Irregularidade Cadastral",
    "Pendência - Omissão de DCTF",
]

FIXTURE_OMISSAO_DCTF_MMYYYY_LITERALS = [
    "Pendência - Omissão de DCTF",
    "(Período de Apuração)",
    "08/2024",
]

FIXTURE_ECF_148_LITERALS = [
    "MINISTÉRIO DA FAZENDA",
    "18/08/2026 11:27:56",
    "CNPJ: 41.420.735 - LJ FERRAMENTAS LTDA",
    "CNPJ: 41.420.735/0001-51",
    "INAPTA Omissão de declarações em 11/06/2026",
    "Data de Abertura:",
    "31/03/2021",
    "31/12/2021",
    "01/01/2023",
    "Emissão:",
    "22/05/2026",
    "Data de Validade:",
    "18/11/2026",
    "Pendência - Irregularidade Cadastral",
    "Inscrição inapta - Omissão de declarações",
    "Omissão de ECF",
    "(Ano-Calendário)",
    "2022",
    "Diagnóstico Fiscal na Procuradoria-Geral da Fazenda Nacional",
    "Não foram detectadas pendências/exigibilidades suspensas para esse contribuinte nos controles da Procuradoria-Geral da Fazenda Nacional.",
    "Final do Relatório",
    "Página: 1 /",
    "MINISTÉRIO DA FAZENDA",
    "18/08/2026 11:27:56",
]


def test_fixture_tjj_138_pendencia_sem_valor(failures: list[str]) -> None:
    """PDF 2024 só com cadastral + omissão DCTF (sem R$) não pode zerar extração."""
    rows = parse_ecac_from_literals(
        FIXTURE_TJJ_138_SEM_VALOR_LITERALS, "ECAC", "138-ECAC.pdf", "federal"
    )
    titulos = {r.get("titulo") for r in rows}
    assert_true(len(rows) >= 2, f"138: esperado >=2 linhas, obtido {len(rows)} {rows}", failures)
    assert_true("IRREGULARIDADE CADASTRAL" in titulos, f"138: falta cadastral {titulos}", failures)
    assert_true("OMISSAO DE DCTF" in titulos, f"138: falta DCTF {titulos}", failures)
    regex_rows = parse_ecac_debitos_regex(
        "\n".join(FIXTURE_TJJ_138_SEM_VALOR_LITERALS),
        "ECAC",
        "138-ECAC.pdf",
        "federal",
    )
    regex_titulos = {r.get("titulo") for r in regex_rows}
    assert_true(
        "IRREGULARIDADE CADASTRAL" in regex_titulos,
        f"138 regex: falta cadastral {regex_titulos}",
        failures,
    )
    assert_true(
        "OMISSAO DE DCTF" in regex_titulos,
        f"138 regex: falta DCTF {regex_titulos}",
        failures,
    )


def test_fixture_omissao_dctf_mm_yyyy(failures: list[str]) -> None:
    rows = parse_ecac_from_literals(
        FIXTURE_OMISSAO_DCTF_MMYYYY_LITERALS, "ECAC", "138-ECAC.pdf", "federal"
    )
    dctf = [r for r in rows if r.get("titulo") == "OMISSAO DE DCTF"]
    assert_true(len(dctf) == 1, f"DCTF MM/YYYY n={len(dctf)} {dctf}", failures)
    if dctf:
        assert_true(dctf[0].get("pa") == "AGO/2024", f"DCTF PA={dctf[0].get('pa')}", failures)
        assert_true(dctf[0].get("situacao") == "OMISSAO", "DCTF situacao", failures)


def test_fixture_omissao_ecf_ano_calendario(failures: list[str]) -> None:
    """LJ Ferramentas 148: só ano 2022; datas de cabeçalho não viram PA mensal."""
    rows = parse_ecac_from_literals(
        FIXTURE_ECF_148_LITERALS, "ECAC", "148-ECAC.pdf", "federal"
    )
    ecf = [r for r in rows if r.get("titulo") == "OMISSAO DE ECF"]
    pas = [r.get("pa") for r in ecf]
    assert_true(pas == ["2022"], f"ECF literais PA={pas}", failures)
    assert_true(all(r.get("situacao") == "OMISSAO" for r in ecf), "ECF situacao", failures)
    merged = parse_ecac_debitos(
        "\n".join(FIXTURE_ECF_148_LITERALS), "ECAC", "148-ECAC.pdf", "federal"
    )
    merged_ecf = [r for r in merged if r.get("titulo") == "OMISSAO DE ECF"]
    merged_pas = [r.get("pa") for r in merged_ecf]
    assert_true(merged_pas == ["2022"], f"ECF merge PA={merged_pas}", failures)
    regex_rows = parse_ecac_debitos_regex(
        "\n".join(FIXTURE_ECF_148_LITERALS), "ECAC", "148-ECAC.pdf", "federal"
    )
    regex_ecf = [r for r in regex_rows if r.get("titulo") == "OMISSAO DE ECF"]
    regex_pas = [r.get("pa") for r in regex_ecf]
    assert_true("AGO/2026" not in regex_pas, f"ECF regex puxou cabeçalho {regex_pas}", failures)
    assert_true("2022" in regex_pas, f"ECF regex sem 2022 {regex_pas}", failures)


FIXTURE_SIEF_4_TRIM_LITERALS = [
    "Pendência - Débito (SIEF)",
    "0561-07 - IRRF-APLIC.FINANC",
    "08/2024",
    "20/09/2024",
    "100,00",
    "100,00",
    "0,00",
    "0,00",
    "100,00",
    "DEVEDOR",
    "2089-01 - IRPJ",
    "4º",
    "TRIM/2023",
    "31/10/2024",
    "16.181,96",
    "16.181,96",
    "0,00",
    "0,00",
    "16.181,96",
    "DEVEDOR",
]

FIXTURE_SIEF_4_TRIM_TEXT = """
Pendência - Débito (SIEF)
2089-01 - IRPJ 4º TRIM/2023 31/10/2024 16.181,96 16.181,96 0,00 0,00 16.181,96 DEVEDOR
2372-01 - CSLL 4º TRIM/2023 31/10/2024 5.000,00 5.000,00 0,00 0,00 5.000,00 DEVEDOR
"""


def test_fixture_sief_4_trim(failures: list[str]) -> None:
    """4º TRIM parte em dois tokens no PDF (4º + TRIM/AAAA); regex também aceita 4º."""
    rows = parse_ecac_from_literals(
        FIXTURE_SIEF_4_TRIM_LITERALS, "ECAC", "20-ECAC.pdf", "federal"
    )
    irpj = next(
        (r for r in rows if "2089-01" in (r.get("receita") or "") and "TRIM/2023" in (r.get("pa") or "")),
        None,
    )
    assert_true(irpj is not None, f"4º TRIM literais: falta 2089-01 {rows}", failures)
    if irpj:
        assert_true(irpj["pa"] == "4º TRIM/2023", f"PA={irpj['pa']}", failures)
        assert_true(abs(irpj["original"] - 16181.96) < 0.02, f"IRPJ orig={irpj['original']}", failures)
        assert_true(irpj.get("titulo") == "DEBITO (SIEF)", f"titulo={irpj.get('titulo')}", failures)
    one_token = parse_ecac_from_literals(
        [
            "Pendência - Débito (SIEF)",
            "2089-01 - IRPJ",
            "4º TRIM/2023",
            "31/10/2024",
            "16.181,96",
            "16.181,96",
            "0,00",
            "0,00",
            "16.181,96",
            "DEVEDOR",
        ],
        "ECAC",
        "20-ECAC.pdf",
        "federal",
    )
    hit = next((r for r in one_token if "2089-01" in (r.get("receita") or "")), None)
    assert_true(hit is not None, f"4º TRIM token único falhou {one_token}", failures)
    regex_rows = parse_ecac_debitos_regex(
        FIXTURE_SIEF_4_TRIM_TEXT, "ECAC", "20-ECAC.pdf", "federal"
    )
    regex_irpj = next((r for r in regex_rows if "2089-01" in (r.get("receita") or "")), None)
    regex_csll = next((r for r in regex_rows if "2372-01" in (r.get("receita") or "")), None)
    assert_true(regex_irpj is not None, f"4º TRIM regex: falta IRPJ {regex_rows}", failures)
    assert_true(regex_csll is not None, f"4º TRIM regex: falta CSLL {regex_rows}", failures)
    if regex_irpj:
        assert_true(abs(regex_irpj["original"] - 16181.96) < 0.02, f"regex orig={regex_irpj['original']}", failures)
        assert_true(regex_irpj["pa"] == "4º TRIM/2023", f"regex PA={regex_irpj['pa']}", failures)
    merged = parse_ecac_debitos(FIXTURE_SIEF_4_TRIM_TEXT, "ECAC", "20-ECAC.pdf", "federal")
    merged_irpj = [r for r in merged if "2089-01" in (r.get("receita") or "")]
    assert_true(len(merged_irpj) == 1, f"4º TRIM duplicado no merge n={len(merged_irpj)} {merged_irpj}", failures)


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
            if row.get("situacao") not in {"OMISSAO", "INAPTA"} and (
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
    test_fixture_sief_pa_exercicio_ano(failures)
    test_fixture_jd76_efd_e_cadastral(failures)
    test_fixture_tjj_138_pendencia_sem_valor(failures)
    test_fixture_omissao_dctf_mm_yyyy(failures)
    test_fixture_omissao_ecf_ano_calendario(failures)
    test_fixture_sief_4_trim(failures)
    test_fixture_outras_secoes_ecac(failures)
    test_fixture_apoio_sem_valor_ecac(failures)
    test_pdfs_apoio_sem_valor_reais(failures)
    test_cid_literal_caesar(failures)
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
