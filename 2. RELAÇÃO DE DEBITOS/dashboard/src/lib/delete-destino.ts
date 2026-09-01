const STATUS_FOLDERS = new Set(["pendencias", "sem_pendencias", "revisar"]);

/** Destino relativo à competência: pendencias|sem_pendencias|revisar/EMPRESA/arquivo.pdf */
export function toRelativePdfDestino(destino: string): string | null {
  const raw = destino.replace(/\\/g, "/").trim();
  if (!raw || raw.includes("..")) return null;
  const parts = raw.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => STATUS_FOLDERS.has(p.toLowerCase()));
  if (idx < 0 || parts.length < idx + 3) return null;
  const fileParts = parts.slice(idx + 2);
  const file = fileParts.join("/");
  if (!file.toLowerCase().endsWith(".pdf")) return null;
  if (fileParts.some((p) => p === ".." || p.includes(".."))) return null;
  return `${parts[idx]}/${parts[idx + 1]}/${file}`;
}

export function toRelativeEmpresaDestino(pasta: string, arquivo: string): string | null {
  const file = arquivo.replace(/\\/g, "/").trim();
  if (!file || file.includes("..") || file.includes("/") || !file.toLowerCase().endsWith(".pdf")) {
    return null;
  }
  const parts = pasta.replace(/\\/g, "/").split("/").filter(Boolean);
  const idx = parts.findIndex((p) => STATUS_FOLDERS.has(p.toLowerCase()));
  if (idx < 0 || !parts[idx + 1]) return null;
  return `${parts[idx]}/${parts[idx + 1]}/${file}`;
}
