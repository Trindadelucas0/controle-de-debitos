#!/usr/bin/env python3
"""Testa decoder CID + parser Unaí (Guias de Parcelamento)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))

from build_dashboard_data import (  # noqa: E402
    best_text,
    detect_content_tipo,
    detect_municipal_layout,
    parse_municipal_debitos,
    parse_municipal_unai_parcelamento,
    resolve_pdf_text,
)
from extrair_debitos import (  # noqa: E402
    classify_text,
    extract_cid_hex_shifted,
    extract_company,
    score_text,
)
from ingest_upload import (  # noqa: E402
    cleanup_municipal_nome,
    promote_revisar_to_pendencias,
)

PDF_20 = (
    ROOT
    / "2. RELAÇÃO DE DEBITOS"
    / "08-2026"
    / "pendencias"
    / "RENATO HENRIQUE DIAS -ME"
    / "20-MUNICIPAL.pdf"
)

SAMPLE_DECODED = (
    "Extrato de Parcelamento de Dívida Ativa "
    "Nome:RENATO HENRIQUE DIAS -ME "
    "CPF/CNPJ:09.452.078/0001-11 "
    "Guias de Parcelamento da Dívida Ativa "
    "Guia 5181/2026 DIV.ATIV. [Referência: 2026]"
    "Termo de Confissão de dívidaExtrato de Parcelamento"
    "ParcelaVencimentoPagávelPagamentoValor ParcelaValor TotalValor Pago2º Via"
    "ïnica-04-09-2026-275,49275,49-Emitir 2º Via "
    "https://sistemas.prefeituraunai.mg.gov.br/portalcidadao/"
)


SAMPLE_DIVIDA = (
    "Extrato de Dívida Ativa\n"
    "Tipo:\nPARCELAMENTO WEB\n"
    "Referência Título Origem Parcela Data título Situação Valor inscrito Valor Calculado\n"
    "2025 68322/2026 EXPEDIENTE-0000001996 Única 28-02-2025 INC 4,65 6,32\n"
    "https://sistemas.prefeituraunai.mg.gov.br/portalcidadao/\n"
)


class TestUnaiParcelamento(unittest.TestCase):
    def test_detect_layout_from_sample(self) -> None:
        self.assertEqual(detect_municipal_layout(SAMPLE_DECODED), "unai_parcelamento")

    def test_detect_divida_not_parcelamento_web(self) -> None:
        """PARCELAMENTO WEB no extrato de dívida não deve virar layout de guias."""
        self.assertEqual(detect_municipal_layout(SAMPLE_DIVIDA), "unai_divida")

    def test_parse_sample_row(self) -> None:
        rows = parse_municipal_unai_parcelamento(SAMPLE_DECODED, "20-MUNICIPAL.pdf")
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertAlmostEqual(row["consolidado"], 275.49)
        self.assertEqual(row["vencimento"], "04/09/2026")
        self.assertEqual(row["pa"], "2026")
        self.assertIn("5181/2026", row["receita"])
        self.assertEqual(row["situacao"], "PARCELADO")

    def test_parse_municipal_debitos_sample(self) -> None:
        rows, layout, avisos = parse_municipal_debitos(SAMPLE_DECODED, "20-MUNICIPAL.pdf")
        self.assertEqual(layout, "unai_parcelamento")
        self.assertEqual(len(rows), 1)
        self.assertFalse(avisos)

    @unittest.skipUnless(PDF_20.is_file(), "PDF 20-MUNICIPAL ausente")
    def test_real_pdf_decode_and_parse(self) -> None:
        shifted = extract_cid_hex_shifted(PDF_20)
        self.assertGreater(score_text(shifted), 6)
        self.assertIn("5181/2026", shifted.replace(" ", ""))
        self.assertIn("275,49", shifted)

        text, mode = best_text(PDF_20)
        self.assertEqual(mode, "cid_hex_shifted")
        rows, layout, avisos = parse_municipal_debitos(text, PDF_20.name)
        self.assertEqual(layout, "unai_parcelamento")
        self.assertEqual(len(rows), 1, msg=f"avisos={avisos} mode={mode}")
        self.assertAlmostEqual(rows[0]["consolidado"], 275.49)

    @unittest.skipUnless(PDF_20.is_file(), "PDF 20-MUNICIPAL ausente")
    def test_import_path_resolve_classify_and_nome(self) -> None:
        """Mesmo caminho da tela de Importação (resolve_pdf_text + classify)."""
        text, mode, _avisos = resolve_pdf_text(PDF_20, "MUNICIPAL")
        self.assertEqual(mode, "cid_hex_shifted")
        classe, tipos = classify_text(text)
        self.assertEqual(classe, "COM_PENDENCIA")
        self.assertTrue(
            "PARCELAMENTO_MUNICIPAL" in tipos or "TRIBUTO_MUNICIPAL" in tipos,
            msg=tipos,
        )
        tipo, forte = detect_content_tipo(text)
        self.assertEqual(tipo, "MUNICIPAL")
        self.assertTrue(forte)
        cnpj, nome = extract_company(text)
        nome = cleanup_municipal_nome(nome, text)
        self.assertEqual(cnpj, "09.452.078/0001-11")
        self.assertIsNotNone(nome)
        assert nome is not None
        self.assertIn("RENATO HENRIQUE DIAS", nome.upper())
        self.assertNotIn("CPF", nome.upper())
        rows, layout, avisos = parse_municipal_debitos(text, "20-MUNICIPAL.pdf")
        self.assertEqual(layout, "unai_parcelamento")
        self.assertEqual(len(rows), 1)
        self.assertAlmostEqual(rows[0]["consolidado"], 275.49)

    def test_promote_revisar_to_pendencias(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            month = Path(tmp) / "08-2026"
            revisar = month / "revisar" / "EMPRESA X"
            revisar.mkdir(parents=True)
            (revisar / "20-MUNICIPAL.pdf").write_bytes(b"%PDF-1.4")
            dest, msg = promote_revisar_to_pendencias(
                revisar, month, should_promote=True
            )
            self.assertEqual(dest.parent.name, "pendencias")
            self.assertTrue(dest.exists())
            self.assertFalse(revisar.exists())
            self.assertIsNotNone(msg)


if __name__ == "__main__":
    unittest.main()
