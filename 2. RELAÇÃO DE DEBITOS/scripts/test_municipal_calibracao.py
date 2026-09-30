#!/usr/bin/env python3
"""Calibragem municipal nos quatro PDFs reais da pasta (oracle obrigatório).

Mesmo caminho da tela de Importação: resolve_pdf_text + parse_municipal_debitos
+ extract_company. Se um PDF sumir, o teste falha (não pula).
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))

from build_dashboard_data import (  # noqa: E402
    parse_municipal_debitos,
    resolve_pdf_text,
)
from extrair_debitos import (  # noqa: E402
    extract_company,
    is_legitimate_sem_pendencia,
)

DEBITOS = ROOT / "2. RELAÇÃO DE DEBITOS"

PDF_ITAJAI_134 = (
    DEBITOS
    / "08-2026"
    / "pendencias"
    / "DIVEMARCA INDUSTRIA, COMERCIO E DISTRIBUICAO LTDA"
    / "134-MUNICIPAL.pdf"
)
PDF_BC_61 = (
    DEBITOS
    / "07-2026"
    / "pendencias"
    / "EGAPLAST - ARTEFATOS E COMERCIO DE PLASTICOS LTDA"
    / "61-MUNICIPAL.pdf"
)
PDF_UNAI_DIVIDA_20 = (
    DEBITOS
    / "07-2026"
    / "pendencias"
    / "SO TEMPERO AGROINDUSTRIA LTDA"
    / "20-MUNICIPAL.pdf"
)
PDF_UNAI_PARCELAMENTO_20 = (
    DEBITOS
    / "08-2026"
    / "pendencias"
    / "RENATO HENRIQUE DIAS -ME"
    / "20-MUNICIPAL.pdf"
)


class TestMunicipalCalibracao(unittest.TestCase):
    def _load(self, pdf: Path) -> tuple[str, list[dict], str | None]:
        self.assertTrue(pdf.is_file(), msg=f"PDF de calibração ausente: {pdf}")
        text, mode, _avisos = resolve_pdf_text(pdf, "MUNICIPAL")
        self.assertTrue(mode)
        rows, layout, avisos = parse_municipal_debitos(text, pdf.name)
        self.assertTrue(rows, msg=f"layout={layout} avisos={avisos} mode={mode}")
        return text, rows, layout

    def test_itajai_guia_134(self) -> None:
        text, rows, layout = self._load(PDF_ITAJAI_134)
        self.assertEqual(layout, "itajai_guia")
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertIn("LICENCA", row["receita"].upper())
        self.assertAlmostEqual(row["consolidado"], 586.01)
        self.assertEqual(row["vencimento"], "06/08/2026")
        cnpj, nome = extract_company(text)
        self.assertEqual(cnpj, "83.102.277/0001-52")
        self.assertIsNotNone(nome)
        assert nome is not None
        self.assertIn("ART FORT", nome.upper())

    def test_bc_portal_61(self) -> None:
        text, rows, layout = self._load(PDF_BC_61)
        self.assertEqual(layout, "bc_portal")
        self.assertEqual(len(rows), 4)
        by_receita = {row["receita"].upper(): row for row in rows}
        self.assertAlmostEqual(by_receita["TVS-REN"]["consolidado"], 1650.29)
        self.assertAlmostEqual(by_receita["TLF"]["consolidado"], 952.65)
        self.assertAlmostEqual(by_receita["TLL"]["consolidado"], 2433.84)
        alvara = [row for key, row in by_receita.items() if "ALVARA" in key]
        self.assertEqual(len(alvara), 1)
        self.assertAlmostEqual(alvara[0]["consolidado"], 293.56)
        for row in rows:
            self.assertEqual(row["vencimento"], "15/06/2026")
        cnpj, nome = extract_company(text)
        self.assertEqual(cnpj, "03.185.564/0002-15")
        # PDF do portal BC não traz razão social: não inventar nem copiar rótulo
        self.assertIsNone(nome)

    def test_unai_divida_20(self) -> None:
        text, rows, layout = self._load(PDF_UNAI_DIVIDA_20)
        self.assertEqual(layout, "unai_divida")
        self.assertEqual(len(rows), 3)
        valores = {row["receita"].split("-")[0].upper(): row["consolidado"] for row in rows}
        self.assertAlmostEqual(valores["EXPEDIENTE"], 6.32)
        self.assertAlmostEqual(valores["TAS"], 124.56)
        self.assertAlmostEqual(valores["TLFL"], 138.66)
        cnpj, nome = extract_company(text)
        self.assertEqual(cnpj, "09.452.078/0001-11")
        self.assertIsNotNone(nome)
        assert nome is not None
        self.assertIn("RENATO HENRIQUE DIAS", nome.upper())
        self.assertNotIn("ENDERE", nome.upper())

    def test_unai_parcelamento_20(self) -> None:
        text, rows, layout = self._load(PDF_UNAI_PARCELAMENTO_20)
        self.assertEqual(layout, "unai_parcelamento")
        self.assertEqual(len(rows), 1)
        self.assertAlmostEqual(rows[0]["consolidado"], 275.49)
        cnpj, nome = extract_company(text)
        self.assertEqual(cnpj, "09.452.078/0001-11")
        self.assertIsNotNone(nome)
        assert nome is not None
        self.assertIn("RENATO", nome.upper())

    def test_municipal_sem_valor_nao_extrai(self) -> None:
        """Texto municipal sem lançamento e sem certidão limpa: zero linhas."""
        text = (
            "Prefeitura Municipal\n"
            "Portal do Cidadão\n"
            "Consulta de débitos\n"
            "Inscrição Municipal: 12345\n"
        )
        rows, _layout, _avisos = parse_municipal_debitos(text, "999-MUNICIPAL.pdf")
        self.assertEqual(rows, [])
        self.assertFalse(is_legitimate_sem_pendencia(text))


class TestNomeLinhaSeguinte(unittest.TestCase):
    def test_nome_na_linha_de_baixo(self) -> None:
        text = (
            "Documento:\n09.452.078/0001-11\n"
            "Nome:\nRENATO HENRIQUE DIAS -ME\nEndereço:\nAV. X\n"
        )
        _cnpj, nome = extract_company(text)
        self.assertEqual(nome, "RENATO HENRIQUE DIAS -ME")

    def test_rejeita_rotulo_de_portal(self) -> None:
        text = "Documento:\n09.452.078/0001-11\nNome:\nPortal do Cidadão\n"
        _cnpj, nome = extract_company(text)
        self.assertIsNone(nome)

    def test_rejeita_campo_vazio(self) -> None:
        text = "Documento:\n09.452.078/0001-11\nNome:\nEndereço:\nAV. X\n"
        _cnpj, nome = extract_company(text)
        self.assertIsNone(nome)


if __name__ == "__main__":
    unittest.main()
