#!/usr/bin/env python3
"""Parser do bloco Apoio (CND/QSA) — fixtures de texto, sem servidor."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from build_dashboard_data import (  # noqa: E402
    extract_documentos_from_pdf,
    parse_ecac_debitos,
)
from extrair_debitos import parse_ecac_apoio_certidao  # noqa: E402
from ingest_upload import ingest_one, titulos_from_cadastro  # noqa: E402

# CND limpa, 1 sócio (layout 72 / 153 / 11)
FIXTURE_CND_1_SOCIO = """
INFORMAÇÕES DE APOIO PARA EMISSÃO DE CERTIDÃO
CNPJ: 59.054.128 - LOJA VIRTUAL DE COSMETICOS LTDA
Dados Cadastrais da Matriz
CNPJ: 59.054.128/0001-80
UA de Domicílio: DRF BRASILIA-DF
Responsável: 571.693.225-87 - EDIVANIO RAMOS DE SOUZA
Situação: ATIVA
Natureza Jurídica: 206-2 - SOCIEDADE EMPRESARIA LIMITADA
Sócios e Administradores
CPF/CNPJ
Nome
Qualificação
Situação Cadastral
Cap. Social
Cap. Votante
571.693.225-87
EDIVANIO RAMOS DE SOUZA
SÓCIO-ADMINISTRADOR
REGULAR
100,00%
Certidão Emitida
CNPJ: 59.054.128/0001-80
Certidão Negativa:  57A7.16F3.2907.73DF
Emissão: 24/08/2026
Data de Validade: 20/02/2027
Diagnóstico Fiscal na Receita Federal e Procuradoria-Geral da Fazenda Nacional
Não foram detectadas pendências/exigibilidades suspensas nos controles da Receita Federal e da Procuradoria-Geral da Fazenda Nacional.
Final do Relatório
"""

FIXTURE_UNICA_46 = """
INFORMAÇÕES DE APOIO PARA EMISSÃO DE CERTIDÃO
CNPJ: 36.517.206 - UNICA ATACADISTA DE TINTAS E COMPLEMENTOS LTDA
Dados Cadastrais da Matriz
CNPJ: 36.517.206/0001-30
Responsável: 033.550.671-21 - VICTOR DAMASCENO COELHO
Situação: ATIVA
Sócios e Administradores
CPF/CNPJ
Nome
Qualificação
Situação Cadastral
Cap. Social
Cap. Votante
033.550.671-21
VICTOR DAMASCENO COELHO
SÓCIO-ADMINISTRADOR
REGULAR
1,00%
53.623.071/0001-07
DAMASCENO PARTICIPACOES LTDA
SÓCIO
ATIVA
99,00%
CPF Representante Legal: 033.550.671-21
Qualif. Resp.: ADMINISTRADOR
Certidão Emitida
CNPJ: 36.517.206/0001-30
Certidão Negativa:  156F.1F85.3106.52E4
Emissão: 25/08/2026
Data de Validade: 21/02/2027
Diagnóstico Fiscal na Receita Federal e Procuradoria-Geral da Fazenda Nacional
Não foram detectadas pendências/exigibilidades suspensas nos controles da Receita Federal e da Procuradoria-Geral da Fazenda Nacional.
Final do Relatório
"""

FIXTURE_ARTFORT_132 = """
INFORMAÇÕES DE APOIO PARA EMISSÃO DE CERTIDÃO
CNPJ: 59.983.818 - ART FORT COMERCIO E IMPORTACAO LTDA
Dados Cadastrais da Matriz
CNPJ: 59.983.818/0001-14
Responsável: 282.974.488-86 - GUILHERME LORGA FERREIRA DE MELLO
Situação: ATIVA
Sócios e Administradores
CPF/CNPJ
Nome
Qualificação
Situação Cadastral
Cap. Social
Cap. Votante
282.974.488-86
GUILHERME LORGA FERREIRA DE MELLO
SÓCIO-ADMINISTRADOR
REGULAR
100,00%
Certidão Emitida
CNPJ: 59.983.818/0001-14
Certidão Positiva com Efeitos de Negativa:  CBF8.F20C.D07E.9EE3
Emissão: 26/02/2026
Data de Validade: 25/08/2026
Diagnóstico Fiscal na Receita Federal
Pendência - Omissão de DCTFWeb*
(Período de Apuração)
2026 - ABR
*Ausência de entrega de DCTFWeb original ou de retificadora em andamento
Diagnóstico Fiscal na Procuradoria-Geral da Fazenda Nacional
Não foram detectadas pendências/exigibilidades suspensas para esse contribuinte nos controles da Procuradoria-Geral da Fazenda Nacional.
Final do Relatório
"""

FIXTURE_TJL_207 = """
INFORMAÇÕES DE APOIO PARA EMISSÃO DE CERTIDÃO
CNPJ: 49.140.409 - SERVICOS DE SAUDE TJL LTDA
Dados Cadastrais da Matriz
CNPJ: 49.140.409/0001-00
Responsável: 023.020.781-28 - LOUISE REGINA ALVES COELHO
Situação: INAPTA Omissão de declarações em 11/06/2026
Sócios e Administradores
CPF/CNPJ
Nome
Qualificação
Situação Cadastral
Cap. Social
Cap. Votante
023.020.781-28
LOUISE REGINA ALVES COELHO
SÓCIO-ADMINISTRADOR
REGULAR
33,34%
019.591.031-13
TUANNY DAMASCENO COELHO BRETA
SÓCIO
REGULAR
33,33%
005.494.491-08
JUCIELLY DIAS DAMACENO
SÓCIO
REGULAR
33,33%
Certidão Emitida
CNPJ: 49.140.409/0001-00
Certidão Negativa:  4D27.15AE.10A1.E70A
Emissão: 22/05/2026
Data de Validade: 18/11/2026
Diagnóstico Fiscal na Receita Federal
Pendência - Irregularidade Cadastral
Inscrição inapta - Omissão de declarações
Omissão de DCTF
(Período de Apuração)
2023 - AGO SET OUT NOV DEZ
Omissão de EFD-CONTRIB
(Período de Apuração)
2023 - JAN FEV MAR ABR MAI JUN JUL SET OUT NOV DEZ
Diagnóstico Fiscal na Procuradoria-Geral da Fazenda Nacional
Não foram detectadas pendências/exigibilidades suspensas para esse contribuinte nos controles da Procuradoria-Geral da Fazenda Nacional.
Final do Relatório
"""

FIXTURE_BR_167 = """
INFORMAÇÕES DE APOIO PARA EMISSÃO DE CERTIDÃO
CNPJ: 46.388.683 - BR IMPORTACAO EXPORTACAO CONSULTORIA E ASSESSORIA LTDA
Dados Cadastrais da Matriz
CNPJ: 46.388.683/0001-05
Responsável: 036.948.251-42 - GUSTAVO HENRIQUE BRAGA FELICIANO
Situação: INAPTA Omissão de declarações em 31/08/2026
Sócios e Administradores
CPF/CNPJ
Nome
Qualificação
Situação Cadastral
Cap. Social
Cap. Votante
036.948.251-42
GUSTAVO HENRIQUE BRAGA FELICIANO
SÓCIO-ADMINISTRADOR
REGULAR
100,00%
Certidão Emitida
CNPJ: 46.388.683/0001-05
Certidão Negativa:  D47A.5F1A.0FF9.CEA7
Emissão: 24/08/2026
Data de Validade: 20/02/2027
Diagnóstico Fiscal na Receita Federal
Pendência - Irregularidade Cadastral
Inscrição inapta - Omissão de declarações
Débito com Exigibilidade Suspensa (SIEF)
CNPJ: 46.388.683/0001-05
Receita
PA/Exerc.
Dt. Vcto
Vl.Original
Sdo.Devedor
Situação
1345-01 - MAED - DCTF
23/01/2023
29/09/2026
500,00
500,00
A VENCER
          Notificação de lançamento: 15111835840003
Diagnóstico Fiscal na Procuradoria-Geral da Fazenda Nacional
Não foram detectadas pendências/exigibilidades suspensas para esse contribuinte nos controles da Procuradoria-Geral da Fazenda Nacional.
Final do Relatório
"""

FIXTURE_SEM_APOIO = """
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


def assert_true(cond: bool, msg: str, failures: list[str]) -> None:
    if not cond:
        failures.append(msg)


def test_cnd_1_socio(failures: list[str]) -> None:
    cad = parse_ecac_apoio_certidao(FIXTURE_CND_1_SOCIO)
    assert_true(cad.get("situacaoEmpresa") == "ATIVA", f"situacao={cad.get('situacaoEmpresa')}", failures)
    assert_true("EDIVANIO" in (cad.get("responsavel") or ""), f"resp={cad.get('responsavel')}", failures)
    assert_true(cad.get("diagnosticoLimpo") is True, f"limpo={cad.get('diagnosticoLimpo')}", failures)
    qsa = cad.get("qsa") or []
    assert_true(len(qsa) == 1, f"qsa n={len(qsa)} {qsa}", failures)
    if qsa:
        assert_true(qsa[0]["cpfCnpj"] == "571.693.225-87", f"cpf={qsa[0]}", failures)
        assert_true(qsa[0].get("capSocial") == "100,00%", f"cap={qsa[0]}", failures)
    cert = cad.get("certidao") or {}
    assert_true(cert.get("tipo") == "Negativa", f"tipo={cert}", failures)
    assert_true(cert.get("numero") == "57A7.16F3.2907.73DF", f"n={cert}", failures)
    assert_true(cert.get("emissao") == "24/08/2026", f"em={cert}", failures)
    assert_true(cert.get("validade") == "20/02/2027", f"val={cert}", failures)
    rows = parse_ecac_debitos(FIXTURE_CND_1_SOCIO, "ECAC", "72-ECAC.pdf", "federal")
    assert_true(len(rows) == 0, f"CND não vira lançamento: {rows}", failures)
    docs, _ = extract_documentos_from_pdf(
        pdf_name="72-ECAC.pdf",
        text=FIXTURE_CND_1_SOCIO,
        pasta_status="regular",
    )
    assert_true("cadastro" in docs[0], "documento sem cadastro", failures)
    assert_true(docs[0]["debitos"] == [], f"debitos={docs[0]['debitos']}", failures)
    titulos = titulos_from_cadastro(cad)
    assert_true("Certidão negativa" in titulos, f"titulos={titulos}", failures)
    assert_true("QSA" in titulos, f"titulos={titulos}", failures)


def test_unica_46_qsa_pj_sem_rep_legal(failures: list[str]) -> None:
    cad = parse_ecac_apoio_certidao(FIXTURE_UNICA_46)
    qsa = cad.get("qsa") or []
    assert_true(len(qsa) == 2, f"esperados 2 sócios, n={len(qsa)} {qsa}", failures)
    cpfs = [item["cpfCnpj"] for item in qsa]
    nomes = [item["nome"] for item in qsa]
    assert_true("033.550.671-21" in cpfs, f"falta PF {cpfs}", failures)
    assert_true("53.623.071/0001-07" in cpfs, f"falta PJ {cpfs}", failures)
    assert_true(any("DAMASCENO PARTICIPACOES" in n for n in nomes), f"nomes={nomes}", failures)
    assert_true(
        not any("ADMINISTRADOR" == (item.get("qualificacao") or "") and "Qualif" in (item.get("nome") or "") for item in qsa),
        f"Representante Legal virou sócio: {qsa}",
        failures,
    )
    assert_true(
        all("Representante" not in item.get("nome", "") for item in qsa),
        f"rep legal no nome {qsa}",
        failures,
    )
    caps = {item["cpfCnpj"]: item.get("capSocial") for item in qsa}
    assert_true(caps.get("033.550.671-21") == "1,00%", f"cap PF={caps}", failures)
    assert_true(caps.get("53.623.071/0001-07") == "99,00%", f"cap PJ={caps}", failures)


def test_artfort_132_cpen_omissao(failures: list[str]) -> None:
    cad = parse_ecac_apoio_certidao(FIXTURE_ARTFORT_132)
    cert = cad.get("certidao") or {}
    assert_true(
        cert.get("tipo") == "Positiva com Efeitos de Negativa",
        f"tipo={cert}",
        failures,
    )
    assert_true(cert.get("numero") == "CBF8.F20C.D07E.9EE3", f"n={cert}", failures)
    assert_true(cad.get("diagnosticoLimpo") is False, f"limpo deveria ser false: {cad}", failures)
    rows = parse_ecac_debitos(FIXTURE_ARTFORT_132, "ECAC", "132-ECAC.pdf", "federal")
    omissao = [r for r in rows if "DCTFWEB" in (r.get("titulo") or "").upper()]
    assert_true(len(omissao) >= 1, f"omissão DCTFWeb ausente: {rows}", failures)
    assert_true(
        "CPEN" in titulos_from_cadastro(cad),
        f"titulos={titulos_from_cadastro(cad)}",
        failures,
    )


def test_tjl_207_tres_socios_inapta(failures: list[str]) -> None:
    cad = parse_ecac_apoio_certidao(FIXTURE_TJL_207)
    assert_true(cad.get("situacaoEmpresa") == "INAPTA", f"sit={cad.get('situacaoEmpresa')}", failures)
    qsa = cad.get("qsa") or []
    assert_true(len(qsa) == 3, f"esperados 3 sócios, n={len(qsa)} {qsa}", failures)
    cert = cad.get("certidao") or {}
    assert_true(cert.get("tipo") == "Negativa", f"CND ausente {cert}", failures)
    assert_true(cad.get("diagnosticoLimpo") is False, "limpo deveria ser false", failures)
    rows = parse_ecac_debitos(FIXTURE_TJL_207, "ECAC", "207-ECAC.pdf", "federal")
    titulos = {r.get("titulo") for r in rows}
    assert_true("IRREGULARIDADE CADASTRAL" in titulos, f"cadastral ausente {titulos}", failures)
    assert_true("OMISSAO DE DCTF" in titulos, f"DCTF ausente {titulos}", failures)
    cadastral = [r for r in rows if r.get("titulo") == "IRREGULARIDADE CADASTRAL"]
    if cadastral:
        assert_true(cadastral[0].get("situacao") == "INAPTA", f"sit row={cadastral[0]}", failures)


def test_br_167_cnd_inapta_sief(failures: list[str]) -> None:
    cad = parse_ecac_apoio_certidao(FIXTURE_BR_167)
    assert_true(cad.get("situacaoEmpresa") == "INAPTA", f"sit={cad.get('situacaoEmpresa')}", failures)
    cert = cad.get("certidao") or {}
    assert_true(cert.get("tipo") == "Negativa", f"CND ausente {cert}", failures)
    assert_true(cad.get("diagnosticoLimpo") is False, "limpo deveria ser false", failures)
    rows = parse_ecac_debitos(FIXTURE_BR_167, "ECAC", "167-ECAC.pdf", "federal")
    titulos = {r.get("titulo") for r in rows}
    assert_true("IRREGULARIDADE CADASTRAL" in titulos, f"cadastral {titulos}", failures)
    suspenso = [
        r
        for r in rows
        if "SUSPENS" in (r.get("titulo") or "").upper() or "SUSPENS" in (r.get("situacao") or "").upper()
    ]
    assert_true(len(suspenso) >= 1, f"SIEF suspenso ausente {rows}", failures)


def test_sem_bloco_apoio(failures: list[str]) -> None:
    cad = parse_ecac_apoio_certidao(FIXTURE_SEM_APOIO)
    assert_true(cad == {}, f"cadastro deveria ser vazio: {cad}", failures)
    rows = parse_ecac_debitos(FIXTURE_SEM_APOIO, "ECAC", "62-ECAC.pdf", "federal")
    assert_true(len(rows) >= 1, f"débitos deveriam permanecer {rows}", failures)
    docs, _ = extract_documentos_from_pdf(
        pdf_name="62-ECAC.pdf",
        text=FIXTURE_SEM_APOIO,
        pasta_status="pendencia",
    )
    assert_true("cadastro" not in docs[0], f"cadastro inesperado {docs[0].keys()}", failures)
    assert_true(len(docs[0]["debitos"]) >= 1, "débitos sumiram no documento", failures)


def test_ingest_cnd_titulos_sem_lancamento(failures: list[str]) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        month = tmp_path / "08-2026"
        month.mkdir(parents=True)
        inbox = tmp_path / "72-ECAC.pdf"
        inbox.write_bytes(b"%PDF-1.4 cnd-apoio\n%%EOF")
        with (
            patch("ingest_upload.resolve_pdf_text", return_value=(FIXTURE_CND_1_SOCIO, "pymupdf", [])),
            patch(
                "ingest_upload.extract_company_from_pdf",
                return_value=("59.054.128/0001-80", "LOJA VIRTUAL DE COSMETICOS LTDA"),
            ),
            patch("ingest_upload.is_pdf_magic", return_value=True),
        ):
            item = ingest_one(
                inbox,
                tipo="ECAC",
                month=month,
                indexes={"08-2026": []},
                selected_competencia="08-2026",
                dry_run=True,
            )
        titulos = item.get("titulos") or []
        assert_true(item.get("ok") is True, f"ok={item.get('ok')} erro={item.get('erro')}", failures)
        assert_true(item.get("qtd_debitos") == 0, f"qtd={item.get('qtd_debitos')}", failures)
        assert_true("Certidão negativa" in titulos, f"titulos={titulos}", failures)
        assert_true("QSA" in titulos, f"titulos={titulos}", failures)
        assert_true(
            not any("extração incompleta" in str(a) for a in (item.get("avisos") or [])),
            f"avisos={item.get('avisos')}",
            failures,
        )


def main() -> int:
    failures: list[str] = []
    test_cnd_1_socio(failures)
    test_unica_46_qsa_pj_sem_rep_legal(failures)
    test_artfort_132_cpen_omissao(failures)
    test_tjl_207_tres_socios_inapta(failures)
    test_br_167_cnd_inapta_sief(failures)
    test_sem_bloco_apoio(failures)
    test_ingest_cnd_titulos_sem_lancamento(failures)
    if failures:
        for msg in failures:
            print(f"FAIL: {msg}", file=sys.stderr)
        return 1
    print("OK test_parse_ecac_certidao")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
