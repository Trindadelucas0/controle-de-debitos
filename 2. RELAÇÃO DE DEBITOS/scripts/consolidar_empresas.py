#!/usr/bin/env python3
"""Consolida pastas de códigos da mesma empresa (mesmo CNPJ raiz) em uma pasta só."""

from __future__ import annotations

import csv
import json
import re
import shutil
import sys
from collections import Counter, defaultdict
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from extrair_debitos import (  # noqa: E402
    FOLDER_BY_CLASSE,
    resolve_month_dir,
    resolve_output_dir,
    resolve_workspace_root,
    sanitize_folder_name,
)

SCAN_FOLDERS = (
    "pendencias",
    "sem_pendencias",
    "revisar",
    "COM_PENDENCIA",
    "SEM_PENDENCIA",
    "REVISAR",
)


def cnpj_root(cnpj: str | None) -> str | None:
    if not cnpj:
        return None
    digits = re.sub(r"\D", "", cnpj)
    if len(digits) >= 8:
        return digits[:8]
    return digits or None


def company_key(empresa: str | None, cnpj: str | None, codigo: str) -> str:
    root = cnpj_root(cnpj)
    if root:
        return f"CNPJ:{root}"
    emp = (empresa or "").strip().upper()
    emp = re.sub(r"\s+", " ", emp)
    if emp and emp not in {"-", "SEM_NOME"}:
        return f"EMP:{emp}"
    return f"COD:{codigo}"


def folder_name_for_group(empresa: str | None, cnpj: str | None, codigos: list[str]) -> str:
    """Pasta legível só com o nome da empresa."""
    name = (empresa or "SEM_NOME").strip()
    name = re.sub(r"\s+", " ", name)
    name = re.sub(r'[<>:"/\\|?*]', " ", name)
    name = re.sub(r"\s+", " ", name).strip(" ._")
    return (name[:120] or "SEM_NOME")


def main() -> int:
    month = resolve_month_dir()
    out_dir = resolve_output_dir()
    csv_path = out_dir / "relatorio_debitos_07-2026.csv"
    if not csv_path.exists():
        raise FileNotFoundError(csv_path)

    rows = list(csv.DictReader(csv_path.open(encoding="utf-8")))
    groups: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        key = company_key(row.get("empresa"), row.get("cnpj"), row["codigo"])
        groups[key].append(row)

    moves: list[dict] = []
    consolidacoes: list[dict] = []

    for key, items in sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        classes = {i["classe"] for i in items}
        # Se qualquer código tem pendência, a pasta da empresa fica em pendencias/
        classe_final = "COM_PENDENCIA" if "COM_PENDENCIA" in classes else (
            "REVISAR" if "REVISAR" in classes else "SEM_PENDENCIA"
        )
        # prefer empresa/cnpj from richest row
        best = max(items, key=lambda r: (len(r.get("empresa") or ""), len(r.get("cnpj") or "")))
        empresa = best.get("empresa") or None
        cnpj = best.get("cnpj") or None
        codigos = sorted({i["codigo"] for i in items}, key=lambda x: int(x))
        dest_root = month / FOLDER_BY_CLASSE[classe_final]
        dest = dest_root / folder_name_for_group(empresa, cnpj, codigos)
        dest.mkdir(parents=True, exist_ok=True)

        pdfs_moved = []
        for item in items:
            # localizar pasta atual do código em qualquer classe
            codigo = item["codigo"]
            found_dirs: list[Path] = []
            for cls in SCAN_FOLDERS:
                root = month / cls
                if not root.exists():
                    continue
                for d in root.iterdir():
                    if not d.is_dir():
                        continue
                    if d.name == codigo or d.name.startswith(f"{codigo}-"):
                        found_dirs.append(d)
            for src_dir in found_dirs:
                for pdf in list(src_dir.glob("*.pdf")):
                    target = dest / pdf.name
                    if pdf.resolve() == target.resolve():
                        pdfs_moved.append(pdf.name)
                        continue
                    if target.exists():
                        pdf.unlink()
                        pdfs_moved.append(pdf.name)
                        continue
                    shutil.move(str(pdf), str(target))
                    moves.append({"from": str(pdf), "to": str(target)})
                    pdfs_moved.append(pdf.name)
                # remove empty source dir
                if src_dir.exists() and not any(src_dir.iterdir()):
                    src_dir.rmdir()

        consolidacoes.append(
            {
                "chave": key,
                "classe": classe_final,
                "pasta_raiz": FOLDER_BY_CLASSE[classe_final],
                "codigos": codigos,
                "cnpj": cnpj,
                "empresa": empresa,
                "pasta": str(dest),
                "arquivos": sorted(set(pdfs_moved)),
                "multiplo": len(codigos) > 1,
            }
        )
        if len(codigos) > 1:
            print(f"{FOLDER_BY_CLASSE[classe_final]}: {codigos} -> {dest.name}")

    # limpar pastas vazias
    for cls in SCAN_FOLDERS:
        root = month / cls
        if not root.exists():
            continue
        for d in list(root.iterdir()):
            if d.is_dir() and not any(d.iterdir()):
                d.rmdir()

    # atualizar CSV consolidado
    cons_csv = out_dir / "relatorio_empresas_consolidadas_07-2026.csv"
    fieldnames = ["classe", "pasta_raiz", "codigos", "cnpj", "empresa", "pasta", "qtd_codigos", "qtd_arquivos"]
    with cons_csv.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for c in consolidacoes:
            writer.writerow(
                {
                    "classe": c["classe"],
                    "pasta_raiz": c["pasta_raiz"],
                    "codigos": ";".join(c["codigos"]),
                    "cnpj": c.get("cnpj") or "",
                    "empresa": c.get("empresa") or "",
                    "pasta": c["pasta"],
                    "qtd_codigos": len(c["codigos"]),
                    "qtd_arquivos": len(c["arquivos"]),
                }
            )

    payload = {
        "resumo_classes": dict(Counter(c["classe"] for c in consolidacoes)),
        "resumo_pastas": dict(Counter(c["pasta_raiz"] for c in consolidacoes)),
        "empresas_multi_codigo": [c for c in consolidacoes if c["multiplo"]],
        "total_empresas": len(consolidacoes),
        "moves": moves,
        "consolidacoes": consolidacoes,
    }
    cons_json = out_dir / "relatorio_empresas_consolidadas_07-2026.json"
    cons_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print("Total empresas:", len(consolidacoes))
    print("Com multiplos codigos:", sum(1 for c in consolidacoes if c["multiplo"]))
    print("Resumo:", dict(Counter(c["classe"] for c in consolidacoes)))
    print("CSV:", cons_csv)
    for cls in ("pendencias", "sem_pendencias", "revisar"):
        root = month / cls
        n = len([x for x in root.iterdir() if x.is_dir()]) if root.exists() else 0
        pdfs = sum(1 for _ in root.rglob("*.pdf")) if root.exists() else 0
        print(f"{cls}: pastas={n} pdfs={pdfs}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
