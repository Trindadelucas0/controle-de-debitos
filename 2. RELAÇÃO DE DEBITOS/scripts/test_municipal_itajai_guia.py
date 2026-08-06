#!/usr/bin/env python3
"""Calibragem Itajaí — Guia de recolhimento (importação municipal)."""

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
    parse_municipal_itajai_guia,
    resolve_pdf_text,
)
from extrair_debitos import classify_text, extract_company  # noqa: E402

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


def _find_pdf() -> Path | None:
    for path in (ROOT / "2. RELAÇÃO DE DEBITOS").rglob("134-MUNICIPAL.pdf"):
        if path.is_file():
            return path
    return None


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

    def test_real_pdf_import_path(self) -> None:
        pdf = _find_pdf()
        if pdf is None:
            self.skipTest("134-MUNICIPAL.pdf ausente")
        text, mode, _ = resolve_pdf_text(pdf, "MUNICIPAL")
        self.assertTrue(mode)
        rows, layout, avisos = parse_municipal_debitos(text, pdf.name)
        self.assertEqual(layout, "itajai_guia", msg=avisos)
        self.assertEqual(len(rows), 1)
        self.assertAlmostEqual(rows[0]["consolidado"], 586.01)
        cnpj, nome = extract_company(text)
        self.assertEqual(cnpj, "83.102.277/0001-52")
        self.assertIsNotNone(nome)
        assert nome is not None
        self.assertIn("ART FORT", nome.upper())


if __name__ == "__main__":
    unittest.main()
