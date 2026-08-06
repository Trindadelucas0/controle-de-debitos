#!/usr/bin/env python3
"""Bateria de testes multi-modo e consenso para extracao de debitos."""

from __future__ import annotations

import json
import sys
import traceback
from collections import Counter
from pathlib import Path

# Garante import a partir da pasta scripts/
SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from extrair_debitos import (  # noqa: E402
    CONSENSUS_MIN,
    MODES,
    PAIR_COMBOS,
    SCORE_THRESHOLD,
    TRIPLE_COMBOS,
    analyze_file,
    classify_text,
    consensus_from_modes,
    find_pdf_by_name,
    list_target_pdfs,
    resolve_month_dir,
    resolve_output_dir,
    resolve_workspace_root,
    run_all_modes,
)


def assert_true(cond: bool, msg: str, failures: list[str]) -> None:
    if not cond:
        failures.append(msg)


def test_no_mode_crashes(pdfs: list[Path], failures: list[str]) -> dict:
    matrix = {}
    crash_count = 0
    for path in pdfs:
        modes = run_all_modes(path)
        matrix[path.name] = {
            mode: {
                "score": res.score,
                "classe": res.classe,
                "error": res.error,
                "text_len": len(res.text or ""),
            }
            for mode, res in modes.items()
        }
        for mode, res in modes.items():
            if res.error and "Traceback" in (res.error or ""):
                crash_count += 1
                failures.append(f"Modo {mode} deixou traceback em {path.name}: {res.error}")
            assert_true(res.mode == mode, f"modo inconsistente em {path.name}", failures)
    assert_true(crash_count == 0, "houve crashes nao capturados", failures)
    return matrix


def test_known_samples(month_dir: Path, failures: list[str]) -> None:
    samples = {
        "15-ECAC.pdf": ("SEM_PENDENCIA", None),
        "106-ECAC.pdf": ("SEM_PENDENCIA", None),
        "03-ECAC.pdf": ("COM_PENDENCIA", "DEBITO"),
    }
    for name, (expected, tipo) in samples.items():
        path = find_pdf_by_name(month_dir, name)
        assert_true(path is not None, f"amostra ausente: {name}", failures)
        if path is None:
            continue
        modes = run_all_modes(path)
        classe, tipos, supporters, combos, motivo, *_ = consensus_from_modes(modes)
        assert_true(
            classe == expected,
            f"{name}: esperado {expected}, obtido {classe} ({motivo})",
            failures,
        )
        assert_true(
            len(supporters) >= CONSENSUS_MIN
            or motivo.startswith("texto_fundido")
            or motivo.startswith("conflito_resolvido"),
            f"{name}: consenso fraco supporters={supporters} motivo={motivo}",
            failures,
        )
        if tipo:
            joined = " ".join(tipos).upper()
            assert_true(tipo in joined, f"{name}: tipo {tipo} nao encontrado em {tipos}", failures)

        eligible = {
            m: r
            for m, r in modes.items()
            if r.score >= SCORE_THRESHOLD and r.classe == expected
        }
        pair_ok = any(all(m in eligible for m in pair) for pair in PAIR_COMBOS)
        triple_ok = any(all(m in eligible for m in triple) for triple in TRIPLE_COMBOS)
        assert_true(pair_ok, f"{name}: nenhum par concordou em {expected}", failures)
        assert_true(triple_ok or len(eligible) >= 2, f"{name}: nenhuma tripla/eligible suficiente", failures)


def test_anti_false_positive_header(failures: list[str]) -> None:
    fake = """
    Diagnostico Fiscal na Receita Federal
    Receita PA/Exerc. Dt. Vcto Vl. Original Sdo. Devedor Multa Juros
    Nao foram detectadas pendencias/exigibilidades suspensas nos controles da Receita Federal
    CNPJ: 12.345.678/0001-99
    """
    classe, tipos = classify_text(fake)
    assert_true(classe == "SEM_PENDENCIA", f"header Sdo. Devedor gerou falso positivo: {classe} {tipos}", failures)


def test_pgfn_phrase_does_not_hide_receita_pendencia(failures: list[str]) -> None:
    fake = """
    Diagnostico Fiscal na Receita Federal
    Pendencia - Debito (SIEF)
    1099-01 - CP-SEGUR. 01/2026 20/02/2026 178,31 178,31 35,66 9,78 223,75 DEVEDOR
    Nao foram detectadas pendencias/exigibilidades suspensas para esse contribuinte
    nos controles da Procuradoria-Geral da Fazenda Nacional.
    """
    from extrair_debitos import detect_competencia_from_text

    classe, tipos = classify_text(fake)
    assert_true(classe == "COM_PENDENCIA", f"PGFN anulou pendência RF: {classe} {tipos}", failures)
    assert_true(
        any("DEBITO" in t for t in tipos),
        f"esperado tipo DEBITO, obtido {tipos}",
        failures,
    )

    comp, emissao = detect_competencia_from_text(
        "INFORMACOES DE APOIO\n17/07/2026 09:57:32\nCNPJ: 09.437.719/0001-69\n"
    )
    assert_true(comp == "07-2026", f"competência esperada 07-2026, obtido {comp}", failures)
    assert_true(emissao == "17/07/2026", f"emissão esperada 17/07/2026, obtido {emissao}", failures)


def test_consensus_rule_on_ecac(pdfs: list[Path], failures: list[str]) -> list[dict]:
    results = []
    for path in pdfs:
        if not path.name.upper().endswith("ECAC.PDF"):
            continue
        verdict = analyze_file(path)
        results.append(
            {
                "arquivo": path.name,
                "classe": verdict.classe,
                "modos": verdict.modos_concordantes,
                "combos": verdict.combinacoes_validas,
                "motivo": verdict.motivo,
                "scores": verdict.scores_por_modo,
            }
        )
        if verdict.classe in {"SEM_PENDENCIA", "COM_PENDENCIA"}:
            assert_true(
                len(verdict.modos_concordantes) >= CONSENSUS_MIN
                or verdict.motivo
                in {
                    "texto_fundido",
                    "conflito_resolvido_por_fusao",
                    "consenso_votos_sem_combo_nomeada",
                    "consenso_multi_modo",
                },
                f"{path.name}: classe {verdict.classe} sem consenso adequado ({verdict.motivo})",
                failures,
            )
            useful = sum(1 for s in verdict.scores_por_modo.values() if s >= SCORE_THRESHOLD)
            assert_true(useful >= 1, f"{path.name}: nenhum modo com score util", failures)
    return results


def test_coverage(matrix: dict, failures: list[str]) -> dict:
    buckets = Counter()
    mode_wins = Counter()
    for name, modes in matrix.items():
        useful = [m for m, info in modes.items() if info["score"] >= SCORE_THRESHOLD and not info["error"]]
        buckets[len(useful)] += 1
        if useful:
            best = max(useful, key=lambda m: modes[m]["score"])
            mode_wins[best] += 1
    coverage = {
        "pdfs_por_qtd_modos_uteis": dict(sorted(buckets.items())),
        "vitorias_por_modo": dict(mode_wins),
        "total_pdfs": len(matrix),
    }
    assert_true(len(matrix) > 0, "matriz vazia", failures)
    return coverage


def main() -> int:
    workspace = resolve_workspace_root()
    month_dir = resolve_month_dir()
    out_dir = resolve_output_dir()
    pdfs = list_target_pdfs(month_dir)
    failures: list[str] = []

    print(f"Workspace: {workspace}")
    print(f"Pasta mes: {month_dir}")
    print(f"Resultados: {out_dir}")
    print(f"Testando {len(pdfs)} PDFs")
    print("1) Matriz completa modos x PDFs...")
    matrix = test_no_mode_crashes(pdfs, failures)

    print("2) Anti falso-positivo header Sdo. Devedor...")
    test_anti_false_positive_header(failures)

    print("2b) PGFN não anula Pendência da Receita + detect competência...")
    test_pgfn_phrase_does_not_hide_receita_pendencia(failures)

    print("3) Amostras conhecidas + pares/triplas...")
    test_known_samples(month_dir, failures)

    print("4) Regra de consenso nos ECAC...")
    consensus_rows = test_consensus_rule_on_ecac(pdfs, failures)

    print("5) Cobertura...")
    coverage = test_coverage(matrix, failures)

    payload = {
        "ok": not failures,
        "failures": failures,
        "workspace": str(workspace),
        "pasta_mes": str(month_dir),
        "coverage": coverage,
        "matrix": matrix,
        "consensus_ecac": consensus_rows,
        "pair_combos": ["+".join(c) for c in PAIR_COMBOS],
        "triple_combos": ["+".join(c) for c in TRIPLE_COMBOS],
        "modes": list(MODES),
    }
    out = out_dir / "teste_extracao_resultado.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Resultado: {out}")
    print("Cobertura:", coverage)
    if failures:
        print(f"\nFALHAS ({len(failures)}):")
        for item in failures:
            print(" -", item)
        return 1
    print("\nTODOS OS TESTES PASSARAM")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        raise SystemExit(2)
