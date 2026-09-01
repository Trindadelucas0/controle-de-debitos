#!/usr/bin/env python3
"""Rebuild incremental (touch_relpaths) e destino relativo — não relê o mês inteiro."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from build_dashboard_data import (  # noqa: E402
    apply_touch_relpaths_to_snapshot,
    empresa_relpath_from_destino,
    normalize_empresa_relpath,
)
from delete_imported import delete_one, resolve_target  # noqa: E402


def assert_true(cond: bool, msg: str, failures: list[str]) -> None:
    if not cond:
        failures.append(msg)


def _empresa(pasta: str, nome: str, empresa_id: str) -> dict:
    return {
        "id": empresa_id,
        "nome": nome,
        "pasta": pasta,
        "status": "pendencia",
        "totais": {"saldo": 1.0, "consolidado": 1.0},
        "esferas": {
            "federal": {"qtdDocs": 0},
            "estadual": {"qtdDocs": 1},
            "municipal": {"qtdDocs": 0},
        },
    }


def test_normalize_relpath_from_abs_and_rel(failures: list[str]) -> None:
    cases = {
        "pendencias/FOO/159-AGENCIANET.pdf": "pendencias/FOO",
        r"C:\Users\x\08-2026\pendencias\FOO\159-AGENCIANET.pdf": "pendencias/FOO",
        "/home/exito/projetos/08-2026/pendencias/FOO/159-AGENCIANET.pdf": "pendencias/FOO",
        "sem_pendencias/BAR": "sem_pendencias/BAR",
        "C:/tmp/revisar/BAZ/1-ECAC.pdf": "revisar/BAZ",
    }
    for raw, expected in cases.items():
        got = normalize_empresa_relpath(raw)
        assert_true(got == expected, f"normalize {raw!r} -> {got!r} != {expected!r}", failures)
        got2 = empresa_relpath_from_destino(raw)
        assert_true(got2 == expected, f"from_destino {raw!r} -> {got2!r}", failures)


def test_touch_empty_folder_removes_only_that_empresa(failures: list[str]) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        month = Path(tmp) / "08-2026"
        foo = month / "pendencias" / "FOO LTDA"
        foo.mkdir(parents=True)
        bar_pasta = str(month / "pendencias" / "BAR LTDA")
        snap = {
            "competencia": "08-2026",
            "empresas": [
                _empresa(str(foo), "FOO LTDA", "foo"),
                _empresa(bar_pasta, "BAR LTDA", "bar"),
            ],
        }
        events: list[dict] = []
        out = apply_touch_relpaths_to_snapshot(
            month,
            snap,
            ["pendencias/FOO LTDA"],
            emit_event=events.append,
        )
        ids = [e["id"] for e in out["empresas"]]
        assert_true(ids == ["bar"], f"ids={ids!r} (FOO deveria sair, BAR ficar)", failures)
        assert_true(
            any(ev.get("event") == "rebuild" for ev in events),
            "faltou event rebuild",
            failures,
        )
        assert_true(out["totais_gerais"]["empresas"] == 1, "totais_gerais não recalculou", failures)


def test_touch_does_not_match_same_name_other_status(failures: list[str]) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        month = Path(tmp) / "08-2026"
        pend = month / "pendencias" / "MESMA"
        sem = month / "sem_pendencias" / "MESMA"
        pend.mkdir(parents=True)
        sem.mkdir(parents=True)
        snap = {
            "competencia": "08-2026",
            "empresas": [
                _empresa(str(pend), "MESMA", "pend-id"),
                _empresa(str(sem), "MESMA", "sem-id"),
            ],
        }
        out = apply_touch_relpaths_to_snapshot(month, snap, ["pendencias/MESMA"])
        ids = [e["id"] for e in out["empresas"]]
        assert_true("sem-id" in ids, f"sem_pendencias/MESMA não deveria sair: {ids}", failures)
        assert_true("pend-id" not in ids, f"pendencias/MESMA deveria sair: {ids}", failures)


def test_touch_does_not_match_prefix_name(failures: list[str]) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        month = Path(tmp) / "08-2026"
        foo = month / "pendencias" / "FOO"
        foo_bar = month / "pendencias" / "FOO BAR"
        foo.mkdir(parents=True)
        foo_bar.mkdir(parents=True)
        snap = {
            "competencia": "08-2026",
            "empresas": [
                _empresa(str(foo), "FOO", "foo"),
                _empresa(str(foo_bar), "FOO BAR", "foo-bar"),
            ],
        }
        out = apply_touch_relpaths_to_snapshot(month, snap, ["pendencias/FOO"])
        ids = [e["id"] for e in out["empresas"]]
        assert_true("foo-bar" in ids, f"FOO BAR não deveria sair: {ids}", failures)
        assert_true("foo" not in ids, f"FOO deveria sair: {ids}", failures)


def test_delete_relative_and_missing_ok(failures: list[str]) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        month = Path(tmp) / "08-2026"
        folder = month / "pendencias" / "FOO"
        folder.mkdir(parents=True)
        pdf = folder / "159-AGENCIANET.pdf"
        pdf.write_bytes(b"%PDF-1.4 test")
        rel = "pendencias/FOO/159-AGENCIANET.pdf"
        target = resolve_target(month, rel)
        assert_true(target == pdf.resolve(), f"resolve_target {target}", failures)

        item = delete_one(month, rel)
        assert_true(item.get("ok") is True, f"delete ok={item}", failures)
        assert_true(item.get("destino") == rel, f"destino relativo {item.get('destino')}", failures)
        assert_true(not pdf.exists(), "PDF deveria ter sido removido", failures)

        missing = delete_one(month, rel)
        assert_true(missing.get("ok") is True, f"ausente deveria ser ok: {missing}", failures)
        assert_true(missing.get("aviso") == "arquivo já não existia", f"aviso={missing}", failures)

        windows = resolve_target(
            month,
            r"C:\Users\trind\Desktop\controle\08-2026\pendencias\FOO\x-ECAC.pdf",
        )
        assert_true(windows is None or not windows.exists(), "path de outra máquina não deve resolver aqui", failures)


def main() -> int:
    failures: list[str] = []
    test_normalize_relpath_from_abs_and_rel(failures)
    test_touch_empty_folder_removes_only_that_empresa(failures)
    test_touch_does_not_match_same_name_other_status(failures)
    test_touch_does_not_match_prefix_name(failures)
    test_delete_relative_and_missing_ok(failures)
    if failures:
        print("FALHAS:")
        for item in failures:
            print(" -", item)
        return 1
    print("OK: rebuild incremental / destino relativo")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
