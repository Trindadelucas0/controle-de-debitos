import type { CadastroConsulta } from "@/lib/types";

const DEFAULT_FEDERAL = "ECAC";
const DEFAULT_ESTADUAL = "AGENCIA NET";

/** DF não tem consulta municipal. */
export function resolveMunicipal(uf: string, municipal?: string | null): string {
  if (uf.trim().toUpperCase() === "DF") return "***";
  return (municipal ?? "").trim();
}

export function normalizeCadastroItem(raw: Partial<CadastroConsulta>): CadastroConsulta | null {
  const numero = String(raw.numero ?? "").trim();
  const empresa = String(raw.empresa ?? "").trim();
  if (!numero && !empresa) return null;

  const uf = String(raw.uf ?? "").trim().toUpperCase();
  const federal = String(raw.federal ?? "").trim() || DEFAULT_FEDERAL;
  const estadual = String(raw.estadual ?? "").trim() || DEFAULT_ESTADUAL;
  const cnpjRaw = raw.cnpj == null ? null : String(raw.cnpj).trim();
  const municipal = resolveMunicipal(uf, raw.municipal);

  return {
    numero: numero || "—",
    empresa: empresa || "—",
    cnpj: cnpjRaw || null,
    uf: uf || "—",
    federal,
    estadual,
    municipal: municipal || "—",
  };
}

/** Rótulo amigável para a coluna Municipal. */
export function labelMunicipal(value: string): { text: string; semMunicipal: boolean } {
  const v = value.trim();
  if (v === "***") {
    return { text: "Não tem", semMunicipal: true };
  }
  if (!v || v === "—") {
    return { text: "—", semMunicipal: false };
  }
  return { text: v, semMunicipal: false };
}

export function digitsCnpj(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

export function sortCadastro(a: CadastroConsulta, b: CadastroConsulta): number {
  const na = Number(a.numero);
  const nb = Number(b.numero);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.numero.localeCompare(b.numero, "pt-BR");
}
