#!/usr/bin/env python3
"""Prefixo de inbox da API não pode virar código 0_09 nem DUPLICADO falso."""

from __future__ import annotations

import sys
import shutil
import tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from extrair_debitos import (  # noqa: E402
    codigo_from_filename,
    collapse_equivalent_codigos,
    resolve_workspace_root,
    strip_inbox_upload_prefix,
)
from ingest_upload import (  # noqa: E402
    _inbox_rel_path,
    apply_same_hash_skip,
    esfera_ui_label,
    force_filename,
    unique_dest_path,
)


def assert_true(cond: bool, msg: str, failures: list[str]) -> None:
    if not cond:
        failures.append(msg)


def test_strip_prefixo_api(failures: list[str]) -> None:
    cases = {
        "09-ECAC.pdf": ("09-ECAC", "09", "09-ECAC.pdf"),
        "0_09-ECAC.pdf": ("09-ECAC", "09", "09-ECAC.pdf"),
        "0_45-ECAC.pdf": ("45-ECAC", "45", "45-ECAC.pdf"),
        "0_0_138-ECAC.pdf": ("138-ECAC", "138", "138-ECAC.pdf"),
        "1787583980649_0_09-ECAC.pdf": ("09-ECAC", "09", "09-ECAC.pdf"),
        "86-ECAC.pdf": ("86-ECAC", "86", "86-ECAC.pdf"),
        "12-AGENCIANET.pdf": ("12-AGENCIANET", "12", "12-AGENCIANET.pdf"),
        "0_12-AGENCIANET.pdf": ("12-AGENCIANET", "12", "12-AGENCIANET.pdf"),
        "1_159-Agenci@Net - Certidão Positiva - Exibir Débitos.pdf": (
            "159-Agenci@Net - Certidão Positiva - Exibir Débitos",
            "159",
            "159-AGENCIANET.pdf",
        ),
        "0_149-Agenci@Net - Certidão Positiva - Exibir Débitos (1).pdf": (
            "149-Agenci@Net - Certidão Positiva - Exibir Débitos (1)",
            "149",
            "149-AGENCIANET.pdf",
        ),
    }
    for name, (stripped, codigo, forced) in cases.items():
        got_strip = strip_inbox_upload_prefix(name)
        got_cod = codigo_from_filename(name)
        tipo = "AGENCIANET" if "AGENCI" in name.upper() else "ECAC"
        got_forced = force_filename(codigo_from_filename(name), tipo, name)
        assert_true(
            got_strip == stripped,
            f"{name}: strip {got_strip!r} != {stripped!r}",
            failures,
        )
        assert_true(
            got_cod == codigo,
            f"{name}: codigo {got_cod!r} != {codigo!r}",
            failures,
        )
        assert_true(
            got_forced == forced,
            f"{name}: forced {got_forced!r} != {forced!r}",
            failures,
        )


def test_unique_dest_nao_duplica_o_proprio_inbox(failures: list[str]) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        inbox = Path(tmp) / "resultados" / "inbox_upload" / "08-2026" / "lote"
        inbox.mkdir(parents=True)
        source = inbox / "0_09-ECAC.pdf"
        source.write_bytes(b"%PDF-1.4 inbox-source")
        dest, reason = unique_dest_path(inbox, "0_09-ECAC.pdf", source)
        assert_true(reason is None, f"inbox não pode ser duplicado (reason={reason!r})", failures)
        assert_true(dest == source, f"dest inbox inesperado: {dest}", failures)

        company = Path(tmp) / "pendencias" / "MEU CINE LTDA"
        company.mkdir(parents=True)
        dest2, reason2 = unique_dest_path(company, "09-ECAC.pdf", source)
        assert_true(reason2 is None, f"pasta nova não é duplicado (reason={reason2!r})", failures)
        assert_true(dest2 == company / "09-ECAC.pdf", f"dest final {dest2}", failures)


def test_unique_dest_mesmo_hash_na_pasta_da_empresa(failures: list[str]) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        company = Path(tmp) / "pendencias" / "MEU CINE LTDA"
        company.mkdir(parents=True)
        existing = company / "09-ECAC.pdf"
        payload = b"%PDF-1.4 mesmo-conteudo"
        existing.write_bytes(payload)
        source = Path(tmp) / "inbox" / "0_09-ECAC.pdf"
        source.parent.mkdir(parents=True)
        source.write_bytes(payload)
        dest, reason = unique_dest_path(company, "09-ECAC.pdf", source)
        assert_true(
            reason == "já importado (mesmo hash)",
            f"hash igual na pasta da empresa deve pular (reason={reason!r})",
            failures,
        )
        assert_true(dest == existing, f"dest {dest}", failures)


def test_collapse_oito_e_zero_oito(failures: list[str]) -> None:
    from build_dashboard_data import sort_codigos
    from ingest_upload import _align_forced_name_to_empresa

    assert_true(
        collapse_equivalent_codigos(["8", "08", "8"]) == ["08"],
        f"collapse={collapse_equivalent_codigos(['8', '08', '8'])}",
        failures,
    )
    assert_true(sort_codigos({"8", "08"}) == ["08"], f"sort={sort_codigos({'8', '08'})}", failures)
    aligned = _align_forced_name_to_empresa(
        "8-AGENCIANET.pdf",
        "AGENCIANET",
        {"codigo": "08", "codigos": ["08"]},
    )
    assert_true(aligned == "08-AGENCIANET.pdf", f"align={aligned}", failures)


def test_esfera_ui_label(failures: list[str]) -> None:
    assert_true(
        esfera_ui_label("AGENCIANET") == "Estadual",
        f"AGENCIANET={esfera_ui_label('AGENCIANET')!r}",
        failures,
    )
    assert_true(esfera_ui_label("ECAC") == "Federal", f"ECAC={esfera_ui_label('ECAC')!r}", failures)
    assert_true(
        esfera_ui_label("MUNICIPAL") == "Municipal",
        f"MUNICIPAL={esfera_ui_label('MUNICIPAL')!r}",
        failures,
    )
    assert_true(
        esfera_ui_label("", "estadual") == "Estadual",
        f"esfera estadual={esfera_ui_label('', 'estadual')!r}",
        failures,
    )


def test_apply_same_hash_skip_preview_e_commit(failures: list[str]) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        inbox = Path(tmp) / "0_149-AGENCIANET.pdf"
        inbox.write_bytes(b"%PDF-1.4 mesmo-hash")
        skip = "já importado (mesmo hash)"

        preview = apply_same_hash_skip(
            {"ok": False, "avisos": [], "esfera": "estadual", "duplicado": False},
            path=inbox,
            skip_reason=skip,
            ja_no_painel=True,
            dry_run=True,
            tipos=["ICMS"],
            tipo="AGENCIANET",
        )
        assert_true(preview["ok"] is True, "preview deve ser ok", failures)
        assert_true(preview["duplicado"] is True, "preview marca duplicado visual", failures)
        assert_true(
            inbox.exists(),
            "preview não apaga o inbox",
            failures,
        )
        assert_true(
            any("confirmar reindexa o painel" in a for a in preview["avisos"]),
            f"aviso preview={preview['avisos']}",
            failures,
        )
        joined = " ".join(preview["avisos"])
        assert_true("Federal" not in joined, f"preview não deve falar Federal: {joined}", failures)

        commit = apply_same_hash_skip(
            {"ok": False, "avisos": [], "esfera": "estadual", "duplicado": True},
            path=inbox,
            skip_reason=skip,
            ja_no_painel=True,
            dry_run=False,
            tipos=["ICMS"],
            tipo="AGENCIANET",
        )
        assert_true(commit["ok"] is True, "commit duplicado deve ser ok", failures)
        assert_true(commit["duplicado"] is False, "commit não bloqueia como duplicado", failures)
        assert_true(not inbox.exists(), "commit apaga a cópia do inbox", failures)
        assert_true(
            any("painel reindexado" in a for a in commit["avisos"]),
            f"aviso commit={commit['avisos']}",
            failures,
        )
        joined_c = " ".join(commit["avisos"])
        assert_true("Federal" not in joined_c, f"commit não deve falar Federal: {joined_c}", failures)


def test_apply_same_hash_skip_fora_do_painel_usa_estadual(failures: list[str]) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        inbox = Path(tmp) / "0_149-AGENCIANET.pdf"
        inbox.write_bytes(b"%PDF-1.4")
        result = apply_same_hash_skip(
            {"ok": False, "avisos": [], "esfera": "estadual", "duplicado": False},
            path=inbox,
            skip_reason="já importado (mesmo hash)",
            ja_no_painel=False,
            dry_run=True,
            tipos=[],
            tipo="AGENCIANET",
        )
        joined = " ".join(result["avisos"])
        assert_true("Estadual" in joined, f"esperado Estadual: {joined}", failures)
        assert_true("Federal" not in joined, f"não deve ser Federal: {joined}", failures)


def test_ingest_one_commit_mesmo_hash_reindexa(failures: list[str]) -> None:
    """PDF já em pendencias/ com mesmo hash: commit ok, inbox some, rebuild segue no batch."""
    from unittest.mock import patch

    from ingest_upload import ingest_one

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        month = tmp_path / "08-2026"
        dest_folder = month / "pendencias" / "LOJAO DAS FERRAMENTAS LTDA"
        dest_folder.mkdir(parents=True)
        payload = b"%PDF-1.4 test-duplicate-agencianet\n%%EOF"
        existing = dest_folder / "149-AGENCIANET.pdf"
        existing.write_bytes(payload)
        inbox = tmp_path / "lote" / "0_149-AGENCIANET.pdf"
        inbox.parent.mkdir(parents=True)
        inbox.write_bytes(payload)
        fake_index = [
            {
                "nome": dest_folder.name,
                "pasta": dest_folder,
                "cnpj": "28204374000148",
                "id": "emp-149",
                "codigo": "149",
                "codigos": ["149"],
            }
        ]
        debit_row = {
            "titulo": "ICMS",
            "saldo": 10,
            "original": 10,
            "multa": 0,
            "juros": 0,
            "consolidado": 10,
        }
        with (
            patch(
                "ingest_upload.resolve_pdf_text",
                return_value=("texto fiscal agencianet suficiente", "pymupdf", []),
            ),
            patch("ingest_upload.detect_content_tipo", return_value=(None, False)),
            patch("ingest_upload.detect_competencia_from_text", return_value=(None, None)),
            patch("ingest_upload.classify_text", return_value=("COM_PENDENCIA", ["ICMS"])),
            patch(
                "ingest_upload.extract_company_from_pdf",
                return_value=("28.204.374/0001-48", "LOJAO DAS FERRAMENTAS LTDA"),
            ),
            patch(
                "ingest_upload.extract_documentos_from_pdf",
                return_value=([{"debitos": [debit_row]}], ["ICMS"]),
            ),
            patch("ingest_upload.painel_tem_empresa", return_value=True),
            patch("ingest_upload.is_pdf_magic", return_value=True),
        ):
            item = ingest_one(
                inbox,
                tipo="AGENCIANET",
                month=month,
                indexes={"08-2026": fake_index},
                selected_competencia="08-2026",
                dry_run=False,
            )
        assert_true(item.get("ok") is True, f"ok={item.get('ok')} erro={item.get('erro')}", failures)
        assert_true(
            item.get("duplicado") is False,
            f"duplicado commit={item.get('duplicado')}",
            failures,
        )
        assert_true(not inbox.exists(), "inbox deveria ser removido no commit duplicado", failures)
        assert_true(existing.exists(), "PDF da pasta da empresa permanece", failures)
        avisos = item.get("avisos") or []
        assert_true(
            any("painel reindexado" in str(a) for a in avisos),
            f"avisos={avisos}",
            failures,
        )
        assert_true(
            all("Federal" not in str(a) for a in avisos),
            f"avisos com Federal={avisos}",
            failures,
        )


def test_inbox_rel_path(failures: list[str]) -> None:
    ws = resolve_workspace_root()
    batch = ws / "resultados" / "inbox_upload" / "99-2099" / "_pytest_inbox"
    batch.mkdir(parents=True, exist_ok=True)
    source = batch / "0_149-AGENCIANET.pdf"
    try:
        source.write_bytes(b"%PDF-1.4 test")
        rel = _inbox_rel_path(source, "99-2099")
        assert_true(rel == "_pytest_inbox/0_149-AGENCIANET.pdf", f"inbox_rel={rel!r}", failures)
    finally:
        shutil.rmtree(ws / "resultados" / "inbox_upload" / "99-2099", ignore_errors=True)


def main() -> int:
    failures: list[str] = []
    test_strip_prefixo_api(failures)
    test_unique_dest_nao_duplica_o_proprio_inbox(failures)
    test_unique_dest_mesmo_hash_na_pasta_da_empresa(failures)
    test_collapse_oito_e_zero_oito(failures)
    test_esfera_ui_label(failures)
    test_apply_same_hash_skip_preview_e_commit(failures)
    test_apply_same_hash_skip_fora_do_painel_usa_estadual(failures)
    test_ingest_one_commit_mesmo_hash_reindexa(failures)
    test_inbox_rel_path(failures)
    if failures:
        print("FALHAS:")
        for item in failures:
            print(" -", item)
        return 1
    print("OK: prefixo inbox / unique_dest_path")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
