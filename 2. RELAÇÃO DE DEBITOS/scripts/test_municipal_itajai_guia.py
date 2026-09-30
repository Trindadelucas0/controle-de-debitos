#!/usr/bin/env python3
"""Calibragem Itajaí — Guia de recolhimento (texto horizontal de exemplo).

O PDF real 134-MUNICIPAL.pdf é oracle obrigatório em test_municipal_calibracao.py.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))

from build_dashboard_data import (  # noqa: E402
    detect_content_tipo,
    detect_municipal_layout,
    parse_municipal_debitos,
    parse_municipal_itajai_consulta,
    parse_municipal_itajai_guia,
    resolve_pdf_text,
)
from extrair_debitos import classify_text, extract_company, extract_company_from_pdf  # noqa: E402
from ingest_upload import cleanup_municipal_nome  # noqa: E402

RESULTADOS = ROOT / "resultados"
DEBITOS_08 = ROOT / "2. RELAÇÃO DE DEBITOS" / "08-2026"
INBOX_BATCH = RESULTADOS / "inbox_upload" / "08-2026" / "1790782397512_rjhpu2"

# Texto real (resolve_pdf_text/pymupdf) das consultas TMI enviadas em 30/09/2026
CONSULTA_ORACLES = {
    "134": {
        "texto": RESULTADOS / "_itajai_consulta_134.txt",
        "pdfs": (
            INBOX_BATCH / "0_134-ITAJAI.pdf",
            DEBITOS_08 / "pendencias" / "ART FORT COMERCIO E IMPORTACAO LTDA" / "134-MUNICIPAL.pdf",
        ),
        "cnpj": "59.983.818/0002-03",
        "nome": "ART FORT COMERCIO E IMPORTACAO LTDA",
        "linhas": [("2026", "28/02/2026", 505.18, 591.06)],
    },
    "713": {
        "texto": RESULTADOS / "_itajai_consulta_713.txt",
        "pdfs": (
            INBOX_BATCH / "1_713-ITAJAI.pdf",
            DEBITOS_08 / "pendencias" / "JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS LTDA" / "713-MUNICIPAL.pdf",
        ),
        "cnpj": "21.051.983/0004-08",
        "nome": "JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS LTDA",
        "linhas": [
            ("2025", "29/05/2025", 289.56, 384.94),
            ("2026", "28/02/2026", 303.11, 354.64),
        ],
    },
    "167": {
        "texto": RESULTADOS / "_itajai_consulta_167.txt",
        "pdfs": (
            INBOX_BATCH / "2_167-ITAJAI.pdf",
            DEBITOS_08
            / "pendencias"
            / "BR IMPORTACAO EXPORTACAO CONSULTORIA E ASSESSORIA LTDA"
            / "167-MUNICIPAL.pdf",
        ),
        "cnpj": "46.388.683/0001-05",
        "nome": "BR IMPORTACAO EXPORTACAO CONSULTORIA E ASSESSORIA LTDA",
        "linhas": [("2026", "13/08/2026", 303.11, 339.48)],
    },
}

SAMPLE = """
MUNICIPIO DE ITAJAI
Guia de recolhimento
Ano
2026
Data emissão
06/08/2026
Data vencimento
06/08/2026
Demonstrativo de débitos
Nome do contribuinte: 7270309 - ART FORT COMERCIO E IMPORTACAO LTDA
CNPJ: 83.102.277/0001-52
Dívida: TAXA DE LICENCA E LOCALIZACAO(7)
Nº termo Exerc. Parc. Vencimento Vlr. original Honorários Vlr. correção Vlr. juros Vlr. multa Vlr. corrigido
2026 1 28/02/2026 505,18 0,00 0,00 30,31 50,52 586,01
TOTAL GERAL 505,18 0,00 0,00 30,31 50,52 586,01
Descontos: 0,00 0,00 0,00 0,00
(=) VALOR COBRADO
586,01
TAXA DE LICENCA E LOCALIZACAO(7): R$ 505,18
TLL 2026
"""


class TestItajaiGuia(unittest.TestCase):
    def test_detect_layout(self) -> None:
        self.assertEqual(detect_municipal_layout(SAMPLE), "itajai_guia")

    def test_parse_sample(self) -> None:
        rows = parse_municipal_itajai_guia(SAMPLE, "134-MUNICIPAL.pdf")
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertAlmostEqual(row["original"], 505.18)
        self.assertAlmostEqual(row["multa"], 50.52)
        self.assertAlmostEqual(row["juros"], 30.31)
        self.assertAlmostEqual(row["consolidado"], 586.01)
        self.assertEqual(row["vencimento"], "28/02/2026")
        self.assertEqual(row["pa"], "2026")
        self.assertIn("LICENCA", row["receita"].upper())

    def test_parse_municipal_debitos(self) -> None:
        rows, layout, avisos = parse_municipal_debitos(SAMPLE, "134-MUNICIPAL.pdf")
        self.assertEqual(layout, "itajai_guia")
        self.assertEqual(len(rows), 1)
        self.assertFalse(avisos)

    def test_classify_and_content_tipo(self) -> None:
        classe, tipos = classify_text(SAMPLE)
        self.assertEqual(classe, "COM_PENDENCIA")
        self.assertIn("TRIBUTO_MUNICIPAL", tipos)
        tipo, forte = detect_content_tipo(SAMPLE)
        self.assertEqual(tipo, "MUNICIPAL")
        self.assertTrue(forte)


class TestItajaiConsultaTmi(unittest.TestCase):
    """Consulta de débitos do portal TMI Itajaí (134/713/167 de 08/2026)."""

    def _texto(self, codigo: str) -> str:
        path = CONSULTA_ORACLES[codigo]["texto"]
        self.assertTrue(path.is_file(), msg=f"texto de calibração ausente: {path}")
        return path.read_text(encoding="utf-8")

    def _assert_oracle(self, codigo: str, text: str, cnpj: str | None, nome: str | None) -> None:
        oracle = CONSULTA_ORACLES[codigo]
        rows, layout, avisos = parse_municipal_debitos(text, f"{codigo}-MUNICIPAL.pdf")
        self.assertEqual(layout, "itajai_consulta")
        self.assertFalse(avisos)
        got = [(r["pa"], r["vencimento"], r["original"], r["consolidado"]) for r in rows]
        self.assertEqual(len(got), len(oracle["linhas"]))
        for (pa, venc, original, consolidado), row in zip(oracle["linhas"], got):
            self.assertEqual(row[0], pa)
            self.assertEqual(row[1], venc)
            self.assertAlmostEqual(row[2], original)
            self.assertAlmostEqual(row[3], consolidado)
        for row in rows:
            self.assertIn("LICENCA", row["receita"])
        self.assertEqual(cnpj, oracle["cnpj"])
        self.assertEqual(nome, oracle["nome"])

    def test_textos_reais(self) -> None:
        for codigo in CONSULTA_ORACLES:
            with self.subTest(codigo=codigo):
                text = self._texto(codigo)
                cnpj, nome = extract_company(text)
                self._assert_oracle(codigo, text, cnpj, nome)

    def test_pdfs_reais(self) -> None:
        for codigo, oracle in CONSULTA_ORACLES.items():
            with self.subTest(codigo=codigo):
                pdf = next((p for p in oracle["pdfs"] if p.is_file()), None)
                self.assertIsNotNone(pdf, msg=f"PDF {codigo} ausente em {oracle['pdfs']}")
                assert pdf is not None
                text, _mode, _avisos = resolve_pdf_text(pdf, "MUNICIPAL")
                cnpj, nome = extract_company_from_pdf(pdf, text)
                self._assert_oracle(codigo, text, cnpj, nome)

    def test_713_divida_ativa(self) -> None:
        rows = parse_municipal_itajai_consulta(self._texto("713"), "713-MUNICIPAL.pdf")
        self.assertEqual([r["situacao"] for r in rows], ["DIVIDA ATIVA", "DEVEDOR"])

    def test_corrigido_cortado_divergente_nao_extrai(self) -> None:
        # "59" impresso = 591,06 cortado; "60" não bate com a soma das colunas
        text = self._texto("134").replace("0,00\n59\n", "0,00\n60\n", 1)
        self.assertEqual(parse_municipal_itajai_consulta(text, "134-MUNICIPAL.pdf"), [])
        rows, layout, avisos = parse_municipal_debitos(text, "134-MUNICIPAL.pdf")
        self.assertEqual(rows, [])
        self.assertEqual(layout, "itajai_guia")
        self.assertIn("layout itajai_guia detectado mas sem linhas extraídas", avisos)

    def test_total_de_registros_divergente_nao_extrai(self) -> None:
        text = self._texto("713").replace("Total de registros: 2", "Total de registros: 3")
        self.assertEqual(parse_municipal_itajai_consulta(text, "713-MUNICIPAL.pdf"), [])

    def test_cleanup_nome_corta_inscricao_municipal(self) -> None:
        colado = "ART FORT COMERCIO E IMPORTACAO LTDA Inscrição Municipal: 367518 Dívida Ano Tipo"
        self.assertEqual(
            cleanup_municipal_nome(colado, ""),
            "ART FORT COMERCIO E IMPORTACAO LTDA",
        )


if __name__ == "__main__":
    unittest.main()
