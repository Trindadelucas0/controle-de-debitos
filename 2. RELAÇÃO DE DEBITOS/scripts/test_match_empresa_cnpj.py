#!/usr/bin/env python3
"""Regressão: identidade da empresa no ingest = CNPJ (não token COMERCIO)."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from ingest_upload import (  # noqa: E402
    digits_cnpj,
    lookup_nome_historico,
    match_empresa,
)


def assert_true(cond: bool, msg: str, failures: list[str]) -> None:
    if not cond:
        failures.append(msg)


def _item(
    nome: str,
    *,
    cnpj: str | None = None,
    codigo: str | None = None,
    codigos: list[str] | None = None,
) -> dict:
    return {
        "nome": nome,
        "pasta": Path(f"/fake/{nome}"),
        "cnpj": digits_cnpj(cnpj) if cnpj else None,
        "id": None,
        "codigo": codigo,
        "codigos": list(codigos or ([codigo] if codigo else [])),
    }


def test_vt_nao_anexa_em_egaplast(failures: list[str]) -> None:
    """Caso do preview: CNPJ V&T + nome com COMERCIO não cai na pasta EGAPLAST."""
    egaplast = _item(
        "EGAPLAST - ARTEFATOS E COMERCIO DE PLASTICOS LTDA",
        cnpj="03.185.564/0001-34",
        codigo="37",
        codigos=["37", "61"],
    )
    index = [egaplast]
    matched = match_empresa(
        index,
        cnpj="36.113.768/0001-19",
        nome="V&T COMERCIO VAREJISTA DE TINTAS LTDA",
        codigo="45",
    )
    assert_true(matched is None, "V&T com CNPJ não deve anexar na EGAPLAST", failures)


def test_mesmo_cnpj_anexa(failures: list[str]) -> None:
    egaplast = _item(
        "EGAPLAST - ARTEFATOS E COMERCIO DE PLASTICOS LTDA",
        cnpj="03.185.564/0001-34",
        codigo="37",
        codigos=["37", "61"],
    )
    matched = match_empresa(
        [egaplast],
        cnpj="03.185.564/0001-34",
        nome="EGAPLAST - ARTEFATOS E COMERCIO DE PLASTICOS LTDA",
        codigo="61",
    )
    assert_true(matched is egaplast, "mesmo CNPJ deve anexar na pasta EGAPLAST", failures)


def test_cnpj_nao_usa_codigo_de_outra(failures: list[str]) -> None:
    """Com CNPJ no PDF, código 45 na pasta errada não conta."""
    pasta_errada = _item(
        "ALGUEM COMERCIO LTDA",
        cnpj="11.111.111/0001-11",
        codigo="45",
        codigos=["45"],
    )
    matched = match_empresa(
        [pasta_errada],
        cnpj="36.113.768/0001-19",
        nome="V&T COMERCIO VAREJISTA DE TINTAS LTDA",
        codigo="45",
    )
    assert_true(matched is None, "CNPJ diverge: código 45 não pode anexar", failures)


def test_dois_comercio_sem_cnpj_nao_cruzam(failures: list[str]) -> None:
    """Sem CNPJ: token COMERCIO compartilhado não cruza razões sociais distintas."""
    a = _item("EGAPLAST - ARTEFATOS E COMERCIO DE PLASTICOS LTDA")
    b_nome = "V&T COMERCIO VAREJISTA DE TINTAS LTDA"
    matched = match_empresa([a], cnpj=None, nome=b_nome, codigo="45")
    assert_true(
        matched is None,
        "dois nomes com COMERCIO sem CNPJ não devem cruzar por token",
        failures,
    )


def test_nome_exato_sem_cnpj_ainda_anexa(failures: list[str]) -> None:
    pasta = _item("V&T COMERCIO VAREJISTA DE TINTAS LTDA")
    matched = match_empresa(
        [pasta],
        cnpj=None,
        nome="V&T COMERCIO VAREJISTA DE TINTAS LTDA",
        codigo=None,
    )
    assert_true(matched is pasta, "nome exato sem CNPJ deve anexar", failures)


def test_historico_cnpj_nao_reusa_por_codigo(failures: list[str]) -> None:
    """Com CNPJ no PDF, histórico não devolve nome de outra empresa só pelo código."""
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        data_dir = root / "dashboard" / "data"
        data_dir.mkdir(parents=True)
        payload = {
            "snapshots": {
                "07-2026": {
                    "empresas": [
                        {
                            "nome": "EGAPLAST - ARTEFATOS E COMERCIO DE PLASTICOS LTDA",
                            "cnpj": "03.185.564/0001-34",
                            "codigo": "45",
                            "codigos": ["45", "37"],
                        }
                    ]
                }
            }
        }
        (data_dir / "empresas.json").write_text(
            json.dumps(payload), encoding="utf-8"
        )
        with patch("ingest_upload.resolve_workspace_root", return_value=root):
            nome = lookup_nome_historico(
                cnpj="36.113.768/0001-19",
                codigo="45",
                exclude_competencia="08-2026",
            )
        assert_true(
            nome is None,
            f"histórico com CNPJ V&T não deve pegar EGAPLAST via código 45 (got {nome!r})",
            failures,
        )


def test_historico_mesmo_cnpj_reusa(failures: list[str]) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        data_dir = root / "dashboard" / "data"
        data_dir.mkdir(parents=True)
        payload = {
            "snapshots": {
                "07-2026": {
                    "empresas": [
                        {
                            "nome": "V&T COMERCIO VAREJISTA DE TINTAS LTDA",
                            "cnpj": "36.113.768/0001-19",
                            "codigo": "45",
                            "codigos": ["45", "150"],
                        }
                    ]
                }
            }
        }
        (data_dir / "empresas.json").write_text(
            json.dumps(payload), encoding="utf-8"
        )
        with patch("ingest_upload.resolve_workspace_root", return_value=root):
            nome = lookup_nome_historico(
                cnpj="36.113.768/0001-19",
                codigo="999",
                exclude_competencia="08-2026",
            )
        assert_true(
            nome == "V&T COMERCIO VAREJISTA DE TINTAS LTDA",
            f"mesmo CNPJ deve reusar nome histórico (got {nome!r})",
            failures,
        )


def test_historico_sem_cnpj_usa_codigo(failures: list[str]) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        data_dir = root / "dashboard" / "data"
        data_dir.mkdir(parents=True)
        payload = {
            "snapshots": {
                "07-2026": {
                    "empresas": [
                        {
                            "nome": "V&T COMERCIO VAREJISTA DE TINTAS LTDA",
                            "cnpj": "36.113.768/0001-19",
                            "codigo": "45",
                            "codigos": ["45"],
                        }
                    ]
                }
            }
        }
        (data_dir / "empresas.json").write_text(
            json.dumps(payload), encoding="utf-8"
        )
        with patch("ingest_upload.resolve_workspace_root", return_value=root):
            nome = lookup_nome_historico(
                cnpj=None,
                codigo="45",
                exclude_competencia="08-2026",
            )
        assert_true(
            nome == "V&T COMERCIO VAREJISTA DE TINTAS LTDA",
            f"sem CNPJ, código 45 deve reusar nome (got {nome!r})",
            failures,
        )


def main() -> int:
    failures: list[str] = []
    test_vt_nao_anexa_em_egaplast(failures)
    test_mesmo_cnpj_anexa(failures)
    test_cnpj_nao_usa_codigo_de_outra(failures)
    test_dois_comercio_sem_cnpj_nao_cruzam(failures)
    test_nome_exato_sem_cnpj_ainda_anexa(failures)
    test_historico_cnpj_nao_reusa_por_codigo(failures)
    test_historico_mesmo_cnpj_reusa(failures)
    test_historico_sem_cnpj_usa_codigo(failures)
    if failures:
        print("FALHAS:")
        for item in failures:
            print(" -", item)
        return 1
    print("OK: match_empresa / lookup_nome_historico (CNPJ manda)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
