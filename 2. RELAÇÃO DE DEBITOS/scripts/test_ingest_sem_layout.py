#!/usr/bin/env python3
"""Trava: SEM_PENDENCIA sem linhas só quando é CND/consulta limpa de verdade."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from extrair_debitos import is_legitimate_sem_pendencia  # noqa: E402
from ingest_upload import ingest_one  # noqa: E402
from test_agencianet_cnd import CND_GDF, CONSULTA_LIMPA  # noqa: E402


def assert_true(cond: bool, msg: str, failures: list[str]) -> None:
    if not cond:
        failures.append(msg)


def test_legitimate_cnd_estadual(failures: list[str]) -> None:
    assert_true(is_legitimate_sem_pendencia(CND_GDF), "CND GDF deve ser legítima", failures)


def test_legitimate_consulta_limpa(failures: list[str]) -> None:
    assert_true(
        is_legitimate_sem_pendencia(CONSULTA_LIMPA),
        "consulta Agenci@Net sem bloco deve ser legítima",
        failures,
    )


def test_falso_sem_pendencia_ecac_ilegivel(failures: list[str]) -> None:
    texto = "Agenci@Net - Certidão Positiva - Exibir Débitos\nCNPJ 12.345.678/0001-90"
    assert_true(
        not is_legitimate_sem_pendencia(texto),
        "só cabeçalho não é CND legítima",
        failures,
    )


def test_ingest_bloqueia_sem_layout_falso_sem_pendencia(failures: list[str]) -> None:
    """ECAC ilegível classificado SEM_PENDENCIA não pode confirmar."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        month = tmp_path / "08-2026"
        month.mkdir(parents=True)
        inbox = tmp_path / "153-ECAC.pdf"
        inbox.write_bytes(b"%PDF-1.4 ecac-ilegivel\n%%EOF")
        texto = (
            "Agenci@Net - Certidão Positiva - Exibir Débitos\n"
            "CNPJ 12.345.678/0001-90\n"
            "texto curto sem certidao negativa nem diagnostico limpo"
        )
        with (
            patch("ingest_upload.resolve_pdf_text", return_value=(texto, "pymupdf", [])),
            patch("ingest_upload.detect_content_tipo", return_value=("ECAC", True)),
            patch("ingest_upload.detect_competencia_from_text", return_value=(None, None)),
            patch("ingest_upload.classify_text", return_value=("SEM_PENDENCIA", [])),
            patch("ingest_upload.extract_company_from_pdf", return_value=("12.345.678/0001-90", "EMPRESA TESTE")),
            patch("ingest_upload.extract_documentos_from_pdf", return_value=([{"debitos": []}], [])),
            patch("ingest_upload.is_pdf_magic", return_value=True),
            patch("ingest_upload.has_fiscal_markers", return_value=False),
        ):
            item = ingest_one(
                inbox,
                tipo="ECAC",
                month=month,
                indexes={"08-2026": []},
                selected_competencia="08-2026",
                dry_run=True,
            )
        assert_true(item.get("ok") is False, f"deveria bloquear ok={item.get('ok')}", failures)
        assert_true(item.get("classe") == "REVISAR", f"classe={item.get('classe')}", failures)
        assert_true(
            any("extração incompleta" in str(a) for a in (item.get("avisos") or [])),
            f"avisos={item.get('avisos')}",
            failures,
        )


def test_ingest_permite_cnd_verdadeira(failures: list[str]) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        month = tmp_path / "08-2026"
        month.mkdir(parents=True)
        inbox = tmp_path / "10-AGENCIANET.pdf"
        inbox.write_bytes(b"%PDF-1.4 cnd\n%%EOF")
        with (
            patch("ingest_upload.resolve_pdf_text", return_value=(CND_GDF, "pymupdf", [])),
            patch("ingest_upload.detect_content_tipo", return_value=("AGENCIANET", True)),
            patch("ingest_upload.detect_competencia_from_text", return_value=(None, None)),
            patch("ingest_upload.classify_text", return_value=("SEM_PENDENCIA", [])),
            patch(
                "ingest_upload.extract_company_from_pdf",
                return_value=("50.518.295/0001-60", "GWA LEGACY"),
            ),
            patch("ingest_upload.extract_documentos_from_pdf", return_value=([{"debitos": []}], [])),
            patch("ingest_upload.is_pdf_magic", return_value=True),
        ):
            item = ingest_one(
                inbox,
                tipo="AGENCIANET",
                month=month,
                indexes={"08-2026": []},
                selected_competencia="08-2026",
                dry_run=True,
            )
        assert_true(item.get("ok") is True, f"CND legítima ok={item.get('ok')} erro={item.get('erro')}", failures)
        assert_true(item.get("classe") == "SEM_PENDENCIA", f"classe={item.get('classe')}", failures)


def main() -> int:
    failures: list[str] = []
    test_legitimate_cnd_estadual(failures)
    test_legitimate_consulta_limpa(failures)
    test_falso_sem_pendencia_ecac_ilegivel(failures)
    test_ingest_bloqueia_sem_layout_falso_sem_pendencia(failures)
    test_ingest_permite_cnd_verdadeira(failures)
    if failures:
        for msg in failures:
            print(f"FAIL: {msg}", file=sys.stderr)
        return 1
    print("OK test_ingest_sem_layout")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
