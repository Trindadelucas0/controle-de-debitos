#!/usr/bin/env python3
"""Calibração Agenci@Net: CND GDF, consulta A VENCER, placa IPVA, lixo CID."""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from build_dashboard_data import parse_agencianet_debitos  # noqa: E402
from extrair_debitos import (  # noqa: E402
    classify_text,
    extract_company,
    score_text,
    text_is_cid_garbage,
)

CND_GDF = """
GOVERNO DO DISTRITO FEDERAL
SECRETARIA DE ESTADO DE ECONOMIA
SUBSECRETARIA DA RECEITA
CERTIDÃO NEGATIVA DE DÉBITOS
CERTIDÃO Nº:
272157305712026
GWA LEGACY MATERIAIS PARA CONSTRUCAO LTDA
NOME:
_____________________________ CERTIFICAMOS QUE _____________________________
ENDEREÇO:
AVENIDA PAU BRASIL LT 12 SALA: 930; LETRA: A; S/N
JUNTO AO GDF
0821612300106
50.518.295/0001-60
AGUAS CLARAS
CIDADE:
CNPJ:
CF/DF
FINALIDADE:
Até esta data não constam débitos de tributos de competência do Distrito Federal, inclusive os relativos à Divida Ativa, para o contribuinte acima.
Fica ressalvado o direito de a Fazenda Pública do Distrito Federal cobrar, a qualquer tempo, débitos que venham a ser apurados.
Certidão expedida conforme Decreto Distrital nº 23.873 de 04/07/2003, gratuitamente.
Válida até 24 de novembro de 2026. *
Certidão emitida via internet em 26/08/2026 às 09:28:29 e deve ser validada no endereço https://www.receita.fazenda.df.gov.br.
"""

CONSULTA_AVENCER = """
Pagar / Parcelar débito(s)
Consulta de Débitos - Identificação do Contribuinte
Nome/Razão social:
LOJAO DAS FERRAMENTAS LTDA-ME
CPF/CNPJ:
28204374000148
Endereço:
ADE CONJUNTO 16 LOTE 35 LOJA 01 S/N
Emissão de Certidão Negativa
Não constam débitos para o objeto consultado. Clique aqui
para prosseguir com a emissão da certidão.
Consta(m) o(s) seguinte(s) débito(s) A VENCER (1)
Identificação
Ano
Descrição
Código de Receita
0005151249
2026
Lançamento - 28204374000148
6168
Clique no botão Voltar  para retornar tela anterior.
Agenci@Net - Certidão Positiva - Exibir Débitos
https://www2.agencianet.fazenda.df.gov.br/CP/ComunicadoCertidao/#/ExibirDebitosCP/28204374000148/CNPJ
"""

CONSULTA_PLACA = """
Consulta de Débitos - Identificação do Contribuinte
Nome/Razão social:
BEM MAIS SERVICOS DE TELECOMUNICACAO LTDA
CPF/CNPJ:
26752955000199
Consta(m) o(s) seguinte(s) débito(s) em LANÇAMENTO (2)
Inscrição
Ano
Receita
Tributo
QPA
Valor Débito
DAR
REV7J55
2026
1244
IPVA
2
1324,47
Listar
0005421698
2026
6176
TFE
61,08
Listar
Agenci@Net - Certidão Positiva - Exibir Débitos
https://www2.agencianet.fazenda.df.gov.br/CP/ComunicadoCertidao/#/ExibirDebitosCP/26752955000199/CNPJ
"""

CONSULTA_LIMPA = """
Consulta de Débitos - Identificação do Contribuinte
Nome/Razão social:
FERNANDES COMERCIO E SERVICO DE MATERIAIS DE CONSTRUCAO LTDA
CPF/CNPJ:
50518295000160
Emissão de Certidão Negativa
Não constam débitos para o objeto consultado. Clique aqui
para prosseguir com a emissão da certidão.
Agenci@Net - Certidão Positiva - Exibir Débitos
"""


def assert_true(cond: bool, msg: str, failures: list[str]) -> None:
    if not cond:
        failures.append(msg)


def test_cnd_gdf(failures: list[str]) -> None:
    classe, tipos = classify_text(CND_GDF)
    assert_true(classe == "SEM_PENDENCIA", f"CND classe={classe} tipos={tipos}", failures)
    cnpj, nome = extract_company(CND_GDF)
    assert_true(cnpj == "50.518.295/0001-60", f"CND CNPJ={cnpj}", failures)
    assert_true(
        nome is not None and "GWA LEGACY" in nome.upper(),
        f"CND nome={nome!r}",
        failures,
    )
    rows = parse_agencianet_debitos(CND_GDF, "AGENCIANET", "10-AGENCIANET.pdf")
    assert_true(len(rows) == 0, f"CND não deve inventar linhas: {len(rows)}", failures)


def test_avencer_nao_vira_sem_pendencia(failures: list[str]) -> None:
    classe, tipos = classify_text(CONSULTA_AVENCER)
    assert_true(classe == "COM_PENDENCIA", f"A VENCER classe={classe}", failures)
    assert_true("DEBITO_A_VENCER" in tipos, f"A VENCER tipos={tipos}", failures)
    rows = parse_agencianet_debitos(CONSULTA_AVENCER, "AGENCIANET", "149-AGENCIANET.pdf")
    assert_true(len(rows) == 1, f"A VENCER linhas={len(rows)} {rows}", failures)
    if rows:
        assert_true(rows[0].get("situacao") == "A VENCER", f"sit={rows[0].get('situacao')}", failures)
        assert_true(abs(rows[0].get("consolidado") or 0) < 0.01, "A VENCER sem inventar BRL", failures)
        assert_true("6168" in str(rows[0].get("receita")), f"receita={rows[0].get('receita')}", failures)


def test_placa_ipva(failures: list[str]) -> None:
    rows = parse_agencianet_debitos(CONSULTA_PLACA, "AGENCIANET", "8-AGENCIANET.pdf")
    inscs = {str(r.get("inscricao") or r.get("numero_lancamento") or "") for r in rows}
    assert_true("REV7J55" in inscs, f"placa ausente: {inscs} n={len(rows)}", failures)
    ipva = [r for r in rows if "IPVA" in str(r.get("receita") or "").upper()]
    assert_true(len(ipva) == 1, f"IPVA rows={ipva}", failures)
    if ipva:
        assert_true(abs(ipva[0]["consolidado"] - 1324.47) < 0.02, f"IPVA valor={ipva[0]['consolidado']}", failures)
    tfe = [r for r in rows if "TFE" in str(r.get("receita") or "").upper()]
    assert_true(len(tfe) == 1, f"TFE rows={tfe}", failures)


def test_cid_hex_tokens_newline(failures: list[str]) -> None:
    """Servidor Linux sem pymupdf: CID hex vira um Tj por linha."""
    text = """
Pagar / Parcelar débito(s)
Consulta de Débitos - Identificação do Contribuinte
Nome/Razão social:
BEM MAIS SERVICOS DE TELECOMUNICACAO LTDA
CPF/CNPJ:
26752955000199
Consta(m) o(s) seguinte(s) débito(s) em LANÇAMENTO (2)
Inscrição
Ano
Receita
Tributo
QPA
Valor Débito
DAR
REV7J55
2026
1244
IPVA
2
1324,47
Listar
0005421698
2026
6176
TFE
61,08
Listar
Agenci@Net - Certidão Positiva - Exibir Débitos
"""
    classe, _tipos = classify_text(text)
    assert_true(classe == "COM_PENDENCIA", f"CID newline classe={classe}", failures)
    cnpj, nome = extract_company(text)
    assert_true(cnpj == "26.752.955/0001-99", f"CID newline CNPJ={cnpj}", failures)
    assert_true(nome is not None and "BEM MAIS" in nome.upper(), f"CID newline nome={nome!r}", failures)
    rows = parse_agencianet_debitos(text, "AGENCIANET", "8-AGENCIANET.pdf")
    inscs = {str(r.get("inscricao") or "") for r in rows}
    assert_true("REV7J55" in inscs, f"CID newline placa {inscs} n={len(rows)}", failures)
    assert_true(len(rows) >= 2, f"CID newline rows={len(rows)}", failures)


def test_classify_debito_com_espaco(failures: list[str]) -> None:
    """CID quebra o é de débito → fold vira 'd bito'."""
    text = "Consta(m) o(s) seguinte(s) d bito(s) em LANCAMENTO (1)\n0005421698 2026 6176 TFE 61,08"
    classe, _tipos = classify_text(text)
    assert_true(classe == "COM_PENDENCIA", f"d bito classe={classe}", failures)


def test_consulta_sem_bloco(failures: list[str]) -> None:
    classe, _tipos = classify_text(CONSULTA_LIMPA)
    assert_true(classe == "SEM_PENDENCIA", f"consulta limpa classe={classe}", failures)


def test_cid_garbage_score(failures: list[str]) -> None:
    garbage = ("\u4e00\u4e01\u4e02" * 800) + " nao constam debitos cnpj "
    assert_true(text_is_cid_garbage(garbage), "CID lixo deveria ser garbage", failures)
    assert_true(score_text(garbage) <= 1, f"score CID lixo={score_text(garbage)}", failures)
    assert_true(not text_is_cid_garbage(CND_GDF), "CND pymupdf não é garbage", failures)
    assert_true(score_text(CND_GDF) > 1, f"score CND={score_text(CND_GDF)}", failures)


def main() -> int:
    failures: list[str] = []
    test_cnd_gdf(failures)
    test_avencer_nao_vira_sem_pendencia(failures)
    test_placa_ipva(failures)
    test_consulta_sem_bloco(failures)
    test_cid_hex_tokens_newline(failures)
    test_classify_debito_com_espaco(failures)
    test_cid_garbage_score(failures)
    if failures:
        print("FALHAS:")
        for item in failures:
            print(" -", item)
        return 1
    print("OK: Agenci@Net CND / A VENCER / placa IPVA")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
