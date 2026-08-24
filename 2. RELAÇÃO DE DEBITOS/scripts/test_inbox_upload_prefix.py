#!/usr/bin/env python3
"""Prefixo de inbox da API não pode virar código 0_09 nem DUPLICADO falso."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from extrair_debitos import codigo_from_filename, strip_inbox_upload_prefix  # noqa: E402
from ingest_upload import force_filename, unique_dest_path  # noqa: E402


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
    }
    for name, (stripped, codigo, forced) in cases.items():
        got_strip = strip_inbox_upload_prefix(name)
        got_cod = codigo_from_filename(name)
        got_forced = force_filename(codigo_from_filename(name), "ECAC", name)
        if "AGENCIANET" in name.upper():
            got_forced = force_filename(codigo_from_filename(name), "AGENCIANET", name)
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


def main() -> int:
    failures: list[str] = []
    test_strip_prefixo_api(failures)
    test_unique_dest_nao_duplica_o_proprio_inbox(failures)
    test_unique_dest_mesmo_hash_na_pasta_da_empresa(failures)
    if failures:
        print("FALHAS:")
        for item in failures:
            print(" -", item)
        return 1
    print("OK: prefixo inbox / unique_dest_path")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
