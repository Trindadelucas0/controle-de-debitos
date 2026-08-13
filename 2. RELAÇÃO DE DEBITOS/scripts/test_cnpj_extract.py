#!/usr/bin/env python3
"""CNPJ: checksum, inscrição SIDA e cabeçalho ECAC (EXITO / certificado)."""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from build_dashboard_data import is_cnpj_filial, is_cnpj_matriz  # noqa: E402
from extrair_debitos import (  # noqa: E402
    cnpj_checksum_ok,
    extract_company,
    format_cnpj_digits,
)


def assert_true(cond: bool, msg: str, failures: list[str]) -> None:
    if not cond:
        failures.append(msg)


def test_checksum(failures: list[str]) -> None:
    assert_true(cnpj_checksum_ok("09.437.719/0001-69"), "AF DA SILVA deveria passar no DV", failures)
    assert_true(cnpj_checksum_ok("29859815000102"), "certificado PGFN é CNPJ válido", failures)
    assert_true(
        not cnpj_checksum_ok("76.850.567/2021-83"),
        "inscrição SIDA /2021 não é CNPJ",
        failures,
    )
    assert_true(
        not cnpj_checksum_ok("66.205.296/2023-54"),
        "inscrição SIDA /2023 não é CNPJ",
        failures,
    )
    assert_true(format_cnpj_digits("76850567202183") is None, "SIDA formatada deve ser None", failures)
    assert_true(
        format_cnpj_digits("29859815000102") is None,
        "certificado PGFN continua bloqueado no formato padrão",
        failures,
    )
    assert_true(
        format_cnpj_digits("29859815000102", allow_blocked=True) == "29.859.815/0001-02",
        "allow_blocked deve liberar o certificado quando é o sujeito do PDF",
        failures,
    )


def test_sida_nao_vira_filial(failures: list[str]) -> None:
    text = """
    Diagnóstico Fiscal na Receita Federal
    CNPJ: 29.859.815 - EXITO CONTABILIDADE LTDA
    CNPJ do certificado: 29.859.815/0001-02
    CNPJ: 29.859.815/0001-02
    Pendência - Inscrição (SIDA)
    10.4.21.028601-58 1507-SIMPLES NACIONAL 02/08/2021 12376.850.567/2021-83 DEVEDOR PRINCIPAL
    10.4.23.028772-67 4133-CONTR. SEGURADOS 15/05/2023 14966.205.296/2023-54 DEVEDOR PRINCIPAL
    SIMPLES NAC. 03/2026 20/04/2026 39,90 39,90 7,98 1,75 49,63 DEVEDOR
    """
    cnpj, nome = extract_company(text)
    assert_true(cnpj == "29.859.815/0001-02", f"EXITO CNPJ={cnpj}", failures)
    assert_true(nome is not None and "EXITO" in nome.upper(), f"EXITO nome={nome!r}", failures)
    assert_true(is_cnpj_matriz(cnpj), f"EXITO deveria ser matriz, estab={cnpj}", failures)
    assert_true(not is_cnpj_filial(cnpj), "EXITO não é filial", failures)


def test_empresa_normal_nao_pega_certificado(failures: list[str]) -> None:
    text = """
    CNPJ do certificado: 29.859.815/0001-02
    CNPJ: 09.437.719 - AF DA SILVA REPRESENTACAO
    CNPJ: 09.437.719/0001-69
    CNPJ: 29.859.815/0001-02
    """
    cnpj, nome = extract_company(text)
    assert_true(cnpj == "09.437.719/0001-69", f"AF CNPJ={cnpj}", failures)
    assert_true(nome is not None and "AF DA SILVA" in nome.upper(), f"AF nome={nome!r}", failures)


def test_lida_com_cnpj_e_nome_em_linhas(failures: list[str]) -> None:
    text = "CNPJ:\n29.859.815 - EXITO CONTABILIDADE LTDA\nCNPJ: 29.859.815/0001-02\n"
    cnpj, nome = extract_company(text)
    assert_true(cnpj == "29.859.815/0001-02", f"linhas CNPJ={cnpj}", failures)
    assert_true(nome is not None and "EXITO" in nome.upper(), f"linhas nome={nome!r}", failures)


def main() -> int:
    failures: list[str] = []
    test_checksum(failures)
    test_sida_nao_vira_filial(failures)
    test_empresa_normal_nao_pega_certificado(failures)
    test_lida_com_cnpj_e_nome_em_linhas(failures)
    if failures:
        print("FALHAS:")
        for item in failures:
            print(" -", item)
        return 1
    print("OK: testes de CNPJ/ECAC passaram")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
