#!/usr/bin/env python3
"""Extrai e classifica PDFs ECAC/AGENCIANET com consenso multi-modo."""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import sys
import unicodedata
import zlib
from collections import Counter
from dataclasses import asdict, dataclass, field
from itertools import combinations
from pathlib import Path
from typing import Any

MODES = ("pypdf", "pdfplumber", "pymupdf", "zlib_literals", "cid_utf16_interleaved")
PAIR_COMBOS = list(combinations(MODES, 2))
TRIPLE_COMBOS = [
    ("pypdf", "pdfplumber", "pymupdf"),
    ("pypdf", "pymupdf", "zlib_literals"),
    ("pymupdf", "zlib_literals", "cid_utf16_interleaved"),
    ("pdfplumber", "pymupdf", "cid_utf16_interleaved"),
]
SCORE_THRESHOLD = 6
CONSENSUS_MIN = 2


@dataclass
class ModeResult:
    mode: str
    text: str = ""
    score: int = 0
    classe: str = "REVISAR"
    tipos: list[str] = field(default_factory=list)
    cnpj: str | None = None
    empresa: str | None = None
    error: str | None = None


@dataclass
class FileVerdict:
    codigo: str
    arquivo: str
    tipo_doc: str
    path: str
    classe: str
    tipos: list[str]
    cnpj: str | None
    empresa: str | None
    modos_concordantes: list[str]
    combinacoes_validas: list[str]
    classes_por_modo: dict[str, str]
    scores_por_modo: dict[str, int]
    texto_fonte: str
    motivo: str


def resolve_month_dir(explicit: str | None = None) -> Path:
    if explicit:
        path = Path(explicit)
        if not path.exists():
            raise FileNotFoundError(path)
        return path

    downloads = Path.home() / "Downloads"
    roots = [
        p
        for p in downloads.iterdir()
        if p.is_dir() and "DEBIT" in p.name.upper()
    ]
    if not roots:
        raise FileNotFoundError("Pasta RELAÇÃO DE DEBITOS não encontrada em Downloads")
    root = roots[0]
    inners = [p for p in root.iterdir() if p.is_dir()]
    base = inners[0] if inners else root
    month = base / "07-2026"
    if not month.exists():
        raise FileNotFoundError(month)
    return month


def fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = "".join(ch if ord(ch) < 128 else " " for ch in text.lower())
    return re.sub(r"\s+", " ", text)


def extract_zlib_literals(path: Path) -> str:
    data = path.read_bytes()
    texts: list[bytes] = []
    for match in re.finditer(rb"stream\r?\n([\s\S]*?)\r?\nendstream", data):
        chunk = match.group(1)
        for candidate in (chunk, chunk.lstrip(b"\r\n")):
            try:
                texts.append(zlib.decompress(candidate))
                break
            except Exception:
                continue
    raw = b"\n".join(texts)
    literals = re.findall(rb"\((?:\\.|[^\\)]){2,}\)", raw)
    decoded: list[str] = []
    for lit in literals:
        s = lit[1:-1].replace(b"\\n", b" ").replace(b"\\r", b" ")
        s = re.sub(rb"\\([()\\])", rb"\1", s)
        decoded.append(s.decode("latin-1", errors="ignore"))
    return raw.decode("latin-1", errors="ignore") + "\n" + " ".join(decoded)


def extract_cid_utf16_interleaved(path: Path) -> str:
    """Recupera texto CID onde caracteres aparecem intercalados (A\\x00B\\x00...)."""
    base = extract_zlib_literals(path)
    # Também tenta no binário bruto decompressado
    data = path.read_bytes()
    chunks: list[bytes] = []
    for match in re.finditer(rb"stream\r?\n([\s\S]*?)\r?\nendstream", data):
        chunk = match.group(1)
        for candidate in (chunk, chunk.lstrip(b"\r\n")):
            try:
                chunks.append(zlib.decompress(candidate))
                break
            except Exception:
                continue
    raw = b"\n".join(chunks)

    recovered: list[str] = []
    # UTF-16BE-like pairs with nulls
    for enc in ("utf-16-be", "utf-16-le"):
        try:
            recovered.append(raw.decode(enc, errors="ignore"))
        except Exception:
            pass

    # Interleaved ASCII: take chars when pattern looks like X\0Y\0
    chars = []
    i = 0
    while i < len(raw) - 1:
        a, b = raw[i], raw[i + 1]
        if b == 0 and 32 <= a < 127:
            chars.append(chr(a))
            i += 2
            continue
        if a == 0 and 32 <= b < 127:
            chars.append(chr(b))
            i += 2
            continue
        i += 1
    recovered.append("".join(chars))
    recovered.append(base)
    return "\n".join(recovered)


def extract_pypdf(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    parts: list[str] = []
    for page in reader.pages:
        parts.append(page.extract_text() or "")
    return "\n".join(parts)


def extract_pdfplumber(path: Path) -> str:
    import pdfplumber

    parts: list[str] = []
    with pdfplumber.open(str(path)) as pdf:
        for page in pdf.pages:
            parts.append(page.extract_text() or "")
    return "\n".join(parts)


def extract_pymupdf(path: Path) -> str:
    import fitz

    doc = fitz.open(str(path))
    parts: list[str] = []
    for page in doc:
        parts.append(page.get_text("text") or "")
        parts.append(page.get_text("blocks") and "" or "")
        # rawdict helps some CID docs
        try:
            parts.append(page.get_text("rawdict") and page.get_text("text") or "")
        except Exception:
            pass
    doc.close()
    return "\n".join(parts)


EXTRACTORS = {
    "pypdf": extract_pypdf,
    "pdfplumber": extract_pdfplumber,
    "pymupdf": extract_pymupdf,
    "zlib_literals": extract_zlib_literals,
    "cid_utf16_interleaved": extract_cid_utf16_interleaved,
}


def score_text(text: str) -> int:
    if not text or not text.strip():
        return 0
    f = fold(text)
    score = 0
    if "cnpj" in f:
        score += 3
    if "diagnostico fiscal" in f or "diagnostico fiscal na receita" in f:
        score += 3
    if "nao foram detectadas pend" in f or "pendencia -" in f:
        score += 4
    useful = len(re.findall(r"[A-Za-z0-9]{3,}", f))
    score += min(useful // 40, 4)
    return score


def extract_company(text: str) -> tuple[str | None, str | None]:
    m = re.search(r"CNPJ:\s*([\d\.\s/-]+)\s*-\s*([^\n\r_]{5,140})", text, re.I)
    if not m:
        m = re.search(r"CNPJ:\s*([\d\.\s/-]{14,22})", text, re.I)
        if m:
            return re.sub(r"\s+", "", m.group(1)), None
        return None, None
    cnpj = re.sub(r"\s+", "", m.group(1))
    name = re.sub(r"\s+", " ", m.group(2)).strip()
    name = re.split(r"Dados Cadastrais|Certid|UA de|Endere", name, flags=re.I)[0]
    name = name.strip(" -")
    return cnpj, name or None


def classify_text(text: str) -> tuple[str, list[str]]:
    f = fold(text)
    if "nao foram detectadas pend" in f:
        return "SEM_PENDENCIA", []

    tipos: list[str] = []
    for match in re.finditer(r"pendencia(?:\s|-)+([a-z0-9 /*()]{3,70})", f):
        label = re.sub(r"\s+", " ", match.group(1)).strip().upper()
        label = label.replace("(SIEF)", "").replace("(SIDA)", "").strip()
        # ignore table-only false positives: bare "SDO DEVEDOR" without Pendência section already filtered
        if not label:
            continue
        if label not in tipos:
            tipos.append(label)

    # Active debt markers beyond section title
    if "pendencia - debito" in f or "pendencia debito" in f:
        if "DEBITO" not in tipos and "DEBITO (SIEF)" not in "".join(tipos):
            tipos.insert(0, "DEBITO")

    if tipos:
        return "COM_PENDENCIA", tipos

    # exigibilidade suspensa alone -> REVISAR
    if "exigibilidade suspensa" in f:
        return "REVISAR", ["EXIGIBILIDADE_SUSPENSA"]

    return "REVISAR", []


def run_mode(path: Path, mode: str) -> ModeResult:
    result = ModeResult(mode=mode)
    try:
        text = EXTRACTORS[mode](path)
        result.text = text or ""
        result.score = score_text(result.text)
        result.classe, result.tipos = classify_text(result.text)
        result.cnpj, result.empresa = extract_company(result.text)
        # Low score cannot claim SEM/COM confidently at mode level for consensus input
        if result.score < SCORE_THRESHOLD and result.classe != "REVISAR":
            # keep classe for diagnostics but mark weak by zeroing agreement later via threshold
            pass
    except Exception as exc:  # noqa: BLE001 - must never crash batch
        result.error = f"{type(exc).__name__}: {exc}"
        result.classe = "REVISAR"
        result.score = 0
    return result


def run_all_modes(path: Path) -> dict[str, ModeResult]:
    return {mode: run_mode(path, mode) for mode in MODES}


def majority_value(values: list[str | None]) -> str | None:
    clean = [v for v in values if v]
    if not clean:
        return None
    return Counter(clean).most_common(1)[0][0]


def consensus_from_modes(modes: dict[str, ModeResult]) -> tuple[str, list[str], list[str], list[str], str, str | None, str | None]:
    """Retorna classe, tipos, modos_concordantes, combinacoes_validas, motivo, cnpj, empresa."""
    eligible = {
        name: res
        for name, res in modes.items()
        if res.error is None and res.score >= SCORE_THRESHOLD and res.classe in {"SEM_PENDENCIA", "COM_PENDENCIA"}
    }

    classes_por_modo = {n: m.classe for n, m in modes.items()}

    # Evaluate pairs/triples that agree
    valid_combos: list[str] = []
    for combo in PAIR_COMBOS + TRIPLE_COMBOS:
        subset = [eligible[m] for m in combo if m in eligible]
        if len(subset) < 2:
            continue
        classes = {s.classe for s in subset}
        if len(classes) == 1 and classes.pop() in {"SEM_PENDENCIA", "COM_PENDENCIA"}:
            valid_combos.append("+".join(combo))

    # Count class votes among eligible modes
    votes = Counter(res.classe for res in eligible.values())
    if not votes:
        # try merge top texts
        ranked = sorted(modes.values(), key=lambda r: r.score, reverse=True)
        merged = "\n".join(r.text for r in ranked[:3] if r.text)
        classe, tipos = classify_text(merged)
        if classe in {"SEM_PENDENCIA", "COM_PENDENCIA"} and score_text(merged) >= SCORE_THRESHOLD:
            cnpj = majority_value([r.cnpj for r in ranked[:3]])
            empresa = majority_value([r.empresa for r in ranked[:3]])
            return classe, tipos, [r.mode for r in ranked[:3] if r.score > 0], [], "texto_fundido", cnpj, empresa
        return "REVISAR", [], [], [], "sem_modos_uteis", None, None

    top_class, top_count = votes.most_common(1)[0]
    if top_count < CONSENSUS_MIN:
        ranked = sorted(eligible.values(), key=lambda r: r.score, reverse=True)
        # conflict or single voice
        if len(votes) > 1:
            merged = "\n".join(r.text for r in ranked)
            classe, tipos = classify_text(merged)
            if classe in {"SEM_PENDENCIA", "COM_PENDENCIA"}:
                cnpj = majority_value([r.cnpj for r in ranked])
                empresa = majority_value([r.empresa for r in ranked])
                return (
                    classe,
                    tipos,
                    [r.mode for r in ranked],
                    valid_combos,
                    "conflito_resolvido_por_fusao",
                    cnpj,
                    empresa,
                )
            return "REVISAR", [], [r.mode for r in ranked], valid_combos, "conflito_sem_consenso", None, None
        return "REVISAR", [], [r.mode for r in ranked], valid_combos, "apenas_1_modo_util", None, None

    supporters = [name for name, res in eligible.items() if res.classe == top_class]
    tipos: list[str] = []
    for name in supporters:
        for tipo in eligible[name].tipos:
            if tipo not in tipos:
                tipos.append(tipo)
    cnpj = majority_value([eligible[n].cnpj for n in supporters])
    empresa = majority_value([eligible[n].empresa for n in supporters])
    motivo = "consenso_multi_modo"
    if not valid_combos and top_count >= CONSENSUS_MIN:
        motivo = "consenso_votos_sem_combo_nomeada"
    return top_class, tipos, supporters, valid_combos, motivo, cnpj, empresa


def sanitize_folder_name(name: str) -> str:
    name = re.sub(r'[<>:"/\\|?*]', "_", name)
    name = re.sub(r"\s+", "_", name.strip())
    name = re.sub(r"_+", "_", name)
    return name[:80].strip("_") or "SEM_NOME"


def list_target_pdfs(month_dir: Path) -> list[Path]:
    files = sorted(month_dir.glob("*-ECAC.pdf"), key=lambda p: int(p.stem.split("-")[0]))
    estaduais = month_dir / "ESTADUAIS"
    if estaduais.exists():
        files.extend(sorted(estaduais.glob("*-AGENCIANET.pdf"), key=lambda p: int(p.stem.split("-")[0])))
    return files


def analyze_file(path: Path) -> FileVerdict:
    stem = path.stem
    codigo = stem.split("-")[0]
    tipo_doc = "ECAC" if stem.upper().endswith("ECAC") else "AGENCIANET"
    modes = run_all_modes(path)
    classe, tipos, supporters, combos, motivo, cnpj, empresa = consensus_from_modes(modes)

    # For estaduais, if extraction weak, keep REVISAR at file level; grouping uses ECAC later
    best_text = ""
    if supporters:
        best_text = max((modes[m].text for m in supporters), key=len, default="")
    else:
        best_text = max((m.text for m in modes.values()), key=len, default="")

    return FileVerdict(
        codigo=codigo,
        arquivo=path.name,
        tipo_doc=tipo_doc,
        path=str(path),
        classe=classe,
        tipos=tipos,
        cnpj=cnpj,
        empresa=empresa,
        modos_concordantes=supporters,
        combinacoes_validas=combos,
        classes_por_modo={k: v.classe for k, v in modes.items()},
        scores_por_modo={k: v.score for k, v in modes.items()},
        texto_fonte=best_text[:2000],
        motivo=motivo,
    )


def group_by_codigo(verdicts: list[FileVerdict]) -> dict[str, dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {}
    for v in verdicts:
        g = groups.setdefault(
            v.codigo,
            {
                "codigo": v.codigo,
                "classe": "REVISAR",
                "tipos": [],
                "cnpj": None,
                "empresa": None,
                "arquivos": [],
                "ecac": None,
                "estadual": None,
                "motivo": "",
            },
        )
        g["arquivos"].append(v)
        if v.tipo_doc == "ECAC":
            g["ecac"] = v
        else:
            g["estadual"] = v

    for codigo, g in groups.items():
        ecac: FileVerdict | None = g["ecac"]
        if ecac:
            g["classe"] = ecac.classe
            g["tipos"] = ecac.tipos
            g["cnpj"] = ecac.cnpj
            g["empresa"] = ecac.empresa
            g["motivo"] = ecac.motivo
        else:
            est: FileVerdict | None = g["estadual"]
            if est:
                g["classe"] = "REVISAR"
                g["cnpj"] = est.cnpj
                g["empresa"] = est.empresa
                g["motivo"] = "somente_estadual_sem_ecac"
    return groups


def destination_for_group(month_dir: Path, group: dict[str, Any]) -> Path:
    classe = group["classe"]
    root_name = {
        "COM_PENDENCIA": "COM_PENDENCIA",
        "SEM_PENDENCIA": "SEM_PENDENCIA",
        "REVISAR": "REVISAR",
    }.get(classe, "REVISAR")
    codigo = group["codigo"]
    if root_name == "REVISAR":
        return month_dir / root_name / codigo
    empresa = sanitize_folder_name(group.get("empresa") or "SEM_NOME")
    return month_dir / root_name / f"{codigo}-{empresa}"


def move_group(month_dir: Path, group: dict[str, Any], dry_run: bool) -> list[dict[str, str]]:
    dest = destination_for_group(month_dir, group)
    moves: list[dict[str, str]] = []
    if not dry_run:
        dest.mkdir(parents=True, exist_ok=True)
    for verdict in group["arquivos"]:
        src = Path(verdict.path)
        if not src.exists():
            continue
        target = dest / src.name
        moves.append({"from": str(src), "to": str(target)})
        if not dry_run:
            if target.exists():
                continue
            shutil.move(str(src), str(target))
    return moves


def write_reports(month_dir: Path, groups: dict[str, dict[str, Any]], moves: list[dict[str, str]], dry_run: bool) -> None:
    rows = []
    for codigo in sorted(groups, key=lambda x: int(x)):
        g = groups[codigo]
        rows.append(
            {
                "codigo": codigo,
                "classe": g["classe"],
                "tipos": "; ".join(g.get("tipos") or []),
                "cnpj": g.get("cnpj") or "",
                "empresa": g.get("empresa") or "",
                "motivo": g.get("motivo") or "",
                "arquivos": ", ".join(v.arquivo for v in g["arquivos"]),
                "modos_concordantes": ", ".join((g["ecac"].modos_concordantes if g.get("ecac") else [])),
                "combinacoes_validas": ", ".join((g["ecac"].combinacoes_validas if g.get("ecac") else [])[:8]),
                "scores": json.dumps(g["ecac"].scores_por_modo if g.get("ecac") else {}, ensure_ascii=False),
                "destino": str(destination_for_group(month_dir, g)),
            }
        )

    csv_path = month_dir / "relatorio_debitos_07-2026.csv"
    json_path = month_dir / "relatorio_debitos_07-2026.json"
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()) if rows else ["codigo"])
        writer.writeheader()
        writer.writerows(rows)

    empresas_json = []
    for codigo in sorted(groups, key=lambda x: int(x)):
        g = groups[codigo]
        empresas_json.append(
            {
                "codigo": g["codigo"],
                "classe": g["classe"],
                "tipos": g.get("tipos") or [],
                "cnpj": g.get("cnpj"),
                "empresa": g.get("empresa"),
                "motivo": g.get("motivo") or "",
                "ecac": asdict(g["ecac"]) if g.get("ecac") else None,
                "estadual": asdict(g["estadual"]) if g.get("estadual") else None,
                "arquivos": [asdict(a) for a in g["arquivos"]],
                "destino": str(destination_for_group(month_dir, g)),
            }
        )
    payload = {
        "dry_run": dry_run,
        "total_empresas": len(groups),
        "resumo": dict(Counter(g["classe"] for g in groups.values())),
        "moves": moves,
        "empresas": empresas_json,
    }
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Relatorio CSV: {csv_path}")
    print(f"Relatorio JSON: {json_path}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Extrai e separa débitos ECAC por consenso multi-modo")
    parser.add_argument("--dir", default=None, help="Pasta 07-2026")
    parser.add_argument("--dry-run", action="store_true", help="Não move arquivos")
    args = parser.parse_args(argv)

    month_dir = resolve_month_dir(args.dir)
    print(f"Pasta: {month_dir}")
    pdfs = list_target_pdfs(month_dir)
    print(f"PDFs encontrados: {len(pdfs)}")

    verdicts = []
    for i, path in enumerate(pdfs, 1):
        print(f"[{i}/{len(pdfs)}] {path.name}")
        verdicts.append(analyze_file(path))

    groups = group_by_codigo(verdicts)
    moves: list[dict[str, str]] = []
    for codigo in sorted(groups, key=lambda x: int(x)):
        moves.extend(move_group(month_dir, groups[codigo], dry_run=args.dry_run))

    write_reports(month_dir, groups, moves, dry_run=args.dry_run)
    resumo = Counter(g["classe"] for g in groups.values())
    print("Resumo:", dict(resumo))
    print("Dry-run:" if args.dry_run else "Movimentacao:", "sim" if args.dry_run else "concluida")
    return 0


if __name__ == "__main__":
    sys.exit(main())
