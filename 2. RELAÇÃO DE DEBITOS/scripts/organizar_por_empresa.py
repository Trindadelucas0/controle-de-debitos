#!/usr/bin/env python3
"""Organiza PDFs em pastas pelo nome da empresa."""

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
    extract_company,
    resolve_month_dir,
    resolve_output_dir,
    run_all_modes,
)

# pastas físicas + nomes antigos (compat)
SCAN_FOLDERS = {
    "pendencias": "COM_PENDENCIA",
    "sem_pendencias": "SEM_PENDENCIA",
    "revisar": "REVISAR",
    "COM_PENDENCIA": "COM_PENDENCIA",
    "SEM_PENDENCIA": "SEM_PENDENCIA",
    "REVISAR": "REVISAR",
}


def clean_name(name: str) -> str:
    name = re.sub(r"\s+", " ", (name or "").strip())
    name = re.sub(r'[<>:"/\\|?*]', " ", name)
    name = re.sub(r"\s+", " ", name).strip(" ._")
    return name[:120] or "SEM_NOME"


def cnpj_root(cnpj: str | None) -> str | None:
    if not cnpj:
        return None
    digits = re.sub(r"\D", "", cnpj)
    if len(digits) >= 8:
        return digits[:8]
    return digits or None


def main() -> int:
    month = resolve_month_dir()
    out = resolve_output_dir()

    entries = []
    for folder_name, classe_logic in SCAN_FOLDERS.items():
        root = month / folder_name
        if not root.exists():
            continue
        for folder in root.iterdir():
            if not folder.is_dir():
                continue
            pdfs = list(folder.glob("*.pdf"))
            if not pdfs:
                continue
            match = re.match(r"^(\d{8,14})-(.+)$", folder.name)
            cnpj_guess = match.group(1) if match else None
            nome_guess = match.group(2).replace("_", " ") if match else folder.name.replace("_", " ")
            entries.append(
                {
                    "cls": classe_logic,
                    "dir": folder,
                    "pdfs": pdfs,
                    "cnpj_guess": cnpj_guess,
                    "nome_guess": nome_guess,
                }
            )

    by_root: dict[str, dict] = {}
    csv_path = out / "relatorio_empresas_consolidadas_07-2026.csv"
    if csv_path.exists():
        for row in csv.DictReader(csv_path.open(encoding="utf-8")):
            root = cnpj_root(row.get("cnpj"))
            if root:
                by_root[root] = row

    companies: dict[str, dict] = defaultdict(
        lambda: {"pdfs": [], "classes": set(), "empresa": None, "cnpj": None}
    )

    for entry in entries:
        nome = entry["nome_guess"]
        cnpj = entry["cnpj_guess"]
        root = entry["cnpj_guess"]

        if root and root in by_root:
            row = by_root[root]
            if row.get("empresa"):
                nome = row["empresa"]
            if row.get("cnpj"):
                cnpj = row["cnpj"]

        if not nome or nome.upper().replace(" ", "_") in {"SEM_NOME", "SEMNOME"}:
            for pdf in entry["pdfs"]:
                modes = run_all_modes(pdf)
                ranked = sorted(modes.values(), key=lambda item: item.score, reverse=True)
                for res in ranked[:2]:
                    found_cnpj, found_name = extract_company(res.text)
                    if found_name:
                        nome = found_name
                    if found_cnpj and not cnpj:
                        cnpj = found_cnpj
                    if found_name:
                        break
                if nome and nome.upper().replace(" ", "_") not in {"SEM_NOME", "SEMNOME"}:
                    break

        empresa = clean_name(nome)
        root_key = cnpj_root(cnpj) or root or empresa.upper()
        group = companies[root_key]
        group["pdfs"].extend(entry["pdfs"])
        group["classes"].add(entry["cls"])
        if empresa and (not group["empresa"] or group["empresa"] == "SEM_NOME"):
            group["empresa"] = empresa
        if cnpj and not group["cnpj"]:
            group["cnpj"] = cnpj

    moves: list[dict] = []
    result_rows: list[dict] = []

    for key, group in sorted(companies.items(), key=lambda item: (item[1]["empresa"] or "").upper()):
        classe = (
            "COM_PENDENCIA"
            if "COM_PENDENCIA" in group["classes"]
            else "REVISAR"
            if "REVISAR" in group["classes"]
            else "SEM_PENDENCIA"
        )
        nome = clean_name(group["empresa"] or "SEM_NOME")
        dest_root = month / FOLDER_BY_CLASSE[classe]
        dest = dest_root / nome

        if dest.exists():
            existing = {pdf.name for pdf in dest.glob("*.pdf")}
            incoming = {pdf.name for pdf in group["pdfs"] if pdf.exists()}
            if existing and incoming and not incoming.issubset(existing) and existing != incoming:
                suffix = cnpj_root(group.get("cnpj")) or str(key)[:8]
                dest = dest_root / f"{nome} ({suffix})"

        dest.mkdir(parents=True, exist_ok=True)

        for pdf in group["pdfs"]:
            if not pdf.exists():
                continue
            target = dest / pdf.name
            if pdf.resolve() == target.resolve():
                continue
            if target.exists():
                pdf.unlink()
                continue
            shutil.move(str(pdf), str(target))
            moves.append({"from": str(pdf), "to": str(target)})

        arquivos = sorted(pdf.name for pdf in dest.glob("*.pdf"))
        result_rows.append(
            {
                "classe": classe,
                "pasta_raiz": FOLDER_BY_CLASSE[classe],
                "empresa": nome,
                "cnpj": group.get("cnpj") or "",
                "pasta": str(dest),
                "qtd_arquivos": len(arquivos),
                "arquivos": ", ".join(arquivos),
            }
        )
        print(f"{FOLDER_BY_CLASSE[classe]}: {nome} ({len(arquivos)} arquivos)")

    for cls in ("pendencias", "sem_pendencias", "revisar", "COM_PENDENCIA", "SEM_PENDENCIA", "REVISAR"):
        root = month / cls
        if not root.exists():
            continue
        for folder in list(root.iterdir()):
            if folder.is_dir() and not any(folder.iterdir()):
                folder.rmdir()
        if root.exists() and not any(root.iterdir()) and root.name in {"COM_PENDENCIA", "SEM_PENDENCIA", "REVISAR", "revisar"}:
            root.rmdir()

    csv_out = out / "relatorio_por_empresa_07-2026.csv"
    with csv_out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["classe", "pasta_raiz", "empresa", "cnpj", "pasta", "qtd_arquivos", "arquivos"],
        )
        writer.writeheader()
        writer.writerows(sorted(result_rows, key=lambda row: (row["pasta_raiz"], row["empresa"].upper())))

    json_out = out / "relatorio_por_empresa_07-2026.json"
    json_out.write_text(
        json.dumps(
            {
                "resumo": dict(Counter(row["classe"] for row in result_rows)),
                "pastas": dict(Counter(row["pasta_raiz"] for row in result_rows)),
                "total_empresas": len(result_rows),
                "moves": moves,
                "empresas": result_rows,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print("Resumo:", dict(Counter(row["classe"] for row in result_rows)))
    print("CSV:", csv_out)
    for cls in ("pendencias", "sem_pendencias"):
        root = month / cls
        if not root.exists():
            print(f"{cls}: pastas=0")
            continue
        dirs = sorted(folder.name for folder in root.iterdir() if folder.is_dir())
        print(f"{cls}: pastas={len(dirs)}")
        jpg = [name for name in dirs if "JPG" in name.upper()]
        if jpg:
            print("  JPG:", jpg[0])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
