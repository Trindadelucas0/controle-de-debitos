#!/usr/bin/env python3
"""Calibração Agenci@Net empresa 52: ocupação área pública (descrição longa) + anti-fantasma A VENCER."""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from build_dashboard_data import parse_agencianet_debitos  # noqa: E402

# Três linhas reais do PDF 52 (fold/pymupdf) com "imprimir" entre elas.
CONSULTA_OCUPACAO_52 = """
Consulta de Débitos - Identificação do Contribuinte
Nome/Razão social:
DAUTO TINTAS LTDA EPP
CPF/CNPJ:
00000000000191
Consta(m) o(s) seguinte(s) débito(s) em LANÇAMENTO (3)
Inscrição
Ano
Receita
Tributo
QPA
Valor Débito
DAR
50259171875 2024 978 insc dat-ocupacao area publica propaganda 00 790,21
imprimir
50261818910 2025 978 insc dat-ocupacao area publica propaganda 00 702,55
imprimir
0005148207 2026 6168 ocupacao area publica por meio de propaganda 331,70
imprimir
Agenci@Net - Certidão Positiva - Exibir Débitos
"""

# Título fala em A VENCER, mas a grade ainda é clássica (Valor Débito / Tributo).
# Não pode inventar fantasma A VENCER engolindo a inscrição seguinte.
CONSULTA_AVENCER_HEADER_GRADE_CLASSICA = """
Consta(m) o(s) seguinte(s) débito(s) A VENCER (2)
Inscrição
Ano
Receita
Tributo
QPA
Valor Débito
DAR
50259171875 2024 978 insc dat-ocupacao area publica propaganda 00 790,21
imprimir
50261818910 2025 978 insc dat-ocupacao area publica propaganda 00 702,55
Clique no botão Voltar  para retornar tela anterior.
Agenci@Net - Certidão Positiva - Exibir Débitos
"""


def assert_true(cond: bool, msg: str, failures: list[str]) -> None:
    if not cond:
        failures.append(msg)


def test_ocupacao_tres_linhas(failures: list[str]) -> None:
    rows = parse_agencianet_debitos(CONSULTA_OCUPACAO_52, "AGENCIANET", "52-AGENCIANET.pdf")
    assert_true(len(rows) == 3, f"ocupacao rows={len(rows)} {rows}", failures)

    by_insc = {str(r.get("inscricao") or ""): r for r in rows}
    for insc in ("50259171875", "50261818910", "0005148207"):
        assert_true(insc in by_insc, f"inscrição ausente: {insc} em {set(by_insc)}", failures)

    r1 = by_insc.get("50259171875")
    r2 = by_insc.get("50261818910")
    r3 = by_insc.get("0005148207")
    if r1:
        assert_true(abs(r1["consolidado"] - 790.21) < 0.02, f"790,21 got={r1['consolidado']}", failures)
        assert_true("978" in str(r1.get("receita")), f"receita 978 got={r1.get('receita')}", failures)
    if r2:
        assert_true(abs(r2["consolidado"] - 702.55) < 0.02, f"702,55 got={r2['consolidado']}", failures)
        assert_true("978" in str(r2.get("receita")), f"receita 978 got={r2.get('receita')}", failures)
    if r3:
        assert_true(abs(r3["consolidado"] - 331.70) < 0.02, f"331,70 got={r3['consolidado']}", failures)
        assert_true("6168" in str(r3.get("receita")), f"receita 6168 got={r3.get('receita')}", failures)

    avencer_fantasma = [r for r in rows if r.get("situacao") == "A VENCER"]
    assert_true(not avencer_fantasma, f"não deve haver A VENCER: {avencer_fantasma}", failures)


def test_avencer_header_com_grade_classica_nao_engole(failures: list[str]) -> None:
    rows = parse_agencianet_debitos(
        CONSULTA_AVENCER_HEADER_GRADE_CLASSICA,
        "AGENCIANET",
        "52-AGENCIANET.pdf",
    )
    inscs = {str(r.get("inscricao") or "") for r in rows}
    assert_true("50259171875" in inscs, f"insc 1 ausente: {inscs}", failures)
    assert_true("50261818910" in inscs, f"insc 2 engolida/ausente: {inscs} rows={rows}", failures)

    for r in rows:
        assert_true(
            r.get("situacao") != "A VENCER",
            f"fantasma A VENCER com grade clássica: {r}",
            failures,
        )
        assert_true(
            float(r.get("consolidado") or 0) > 0,
            f"linha sem valor BRL (possível fantasma): {r}",
            failures,
        )

    vals = sorted(float(r["consolidado"]) for r in rows)
    assert_true(
        len(vals) == 2 and abs(vals[0] - 702.55) < 0.02 and abs(vals[1] - 790.21) < 0.02,
        f"valores esperados 790,21/702,55 got={vals}",
        failures,
    )


def main() -> int:
    failures: list[str] = []
    test_ocupacao_tres_linhas(failures)
    test_avencer_header_com_grade_classica_nao_engole(failures)
    if failures:
        print("FALHAS:")
        for item in failures:
            print(" -", item)
        return 1
    print("OK: Agenci@Net ocupação 52 / anti-fantasma A VENCER")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
