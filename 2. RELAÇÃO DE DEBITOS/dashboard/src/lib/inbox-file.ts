import path from "path";
import { existsSync, readdirSync } from "fs";

/** Nome seguro no inbox: sem @, acentos ou caracteres de path. */
export function sanitizeFileName(name: string): string {
  const base = path.basename(name).normalize("NFC");
  const ascii = base.normalize("NFD").replace(/\p{M}/gu, "");
  const cleaned = ascii
    .replace(/[<>:"/\\|?*@\x00-\x1f]/g, "_")
    .replace(/\.\.+/g, ".")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned.toLowerCase().endsWith(".pdf")) {
    return `${(cleaned || "arquivo").slice(0, 176)}.pdf`;
  }
  return cleaned.slice(0, 180);
}

function foldName(name: string): string {
  return name
    .normalize("NFC")
    .toLowerCase()
    .replace(/@/g, "_")
    .replace(/\s+/g, " ");
}

function indexPrefix(base: string): string | null {
  const match = /^(\d+)_/.exec(base);
  return match ? `${match[1]}_` : null;
}

/**
 * Caminho absoluto do PDF dentro de inbox_upload/{competencia}/.
 * Aceita absoluto, inbox_rel (lote/arquivo.pdf) e nomes com @ / acento.
 */
export function resolveInboxFile(
  workspace: string,
  filePath: string,
  competencia: string,
): string | null {
  const inboxRoot = path.resolve(workspace, "resultados", "inbox_upload", competencia);
  const rootWithSep = inboxRoot.endsWith(path.sep) ? inboxRoot : inboxRoot + path.sep;
  const normalizedRoot = rootWithSep.toLowerCase();

  const accept = (candidate: string): string | null => {
    const resolved = path.resolve(candidate);
    const lower = resolved.toLowerCase();
    if (!lower.endsWith(".pdf")) return null;
    if (!lower.startsWith(normalizedRoot) && lower !== inboxRoot.toLowerCase()) return null;
    if (!existsSync(resolved)) return null;
    return resolved;
  };

  const raw = String(filePath || "").trim();
  if (!raw) return null;

  const direct = accept(raw);
  if (direct) return direct;

  const trimmed = raw.replace(/^[/\\]+/, "");
  if (trimmed) {
    const relative = accept(path.join(inboxRoot, trimmed));
    if (relative) return relative;
  }

  const base = path.basename(trimmed || raw);
  if (!base.toLowerCase().endsWith(".pdf")) return null;
  if (!existsSync(inboxRoot)) return null;

  const loteHint = path.dirname(trimmed.replace(/\\/g, "/"));
  const prefix = indexPrefix(base);

  const matchInDir = (dir: string): string | null => {
    const exact = accept(path.join(dir, base));
    if (exact) return exact;

    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return null;
    }

    const wanted = foldName(base);
    const foldedHits: string[] = [];
    const prefixHits: string[] = [];
    for (const name of entries) {
      if (!name.toLowerCase().endsWith(".pdf")) continue;
      if (foldName(name) === wanted) {
        const hit = accept(path.join(dir, name));
        if (hit) foldedHits.push(hit);
      }
      if (prefix && name.startsWith(prefix)) {
        const hit = accept(path.join(dir, name));
        if (hit) prefixHits.push(hit);
      }
    }
    if (foldedHits.length === 1) return foldedHits[0];
    if (prefixHits.length === 1) return prefixHits[0];
    return null;
  };

  if (loteHint && loteHint !== ".") {
    const hinted = matchInDir(path.join(inboxRoot, loteHint));
    if (hinted) return hinted;
  }

  try {
    for (const ent of readdirSync(inboxRoot, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const hit = matchInDir(path.join(inboxRoot, ent.name));
      if (hit) return hit;
    }
  } catch {
    return null;
  }
  return null;
}
