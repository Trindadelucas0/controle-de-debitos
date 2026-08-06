import { existsSync, readFileSync, statSync } from "fs";
import path from "path";
import {
  digitsCnpj,
  normalizeCadastroItem,
  sortCadastro,
} from "@/lib/cadastro-utils";
import { getEmpresas, listCompetencias } from "@/lib/data";
import type { CadastroConsulta, CadastroConsultasData, Empresa } from "@/lib/types";

export {
  labelMunicipal,
  normalizeCadastroItem,
  resolveMunicipal,
} from "@/lib/cadastro-utils";

function resolveCadastroPath(): string {
  const candidates = [
    path.join(process.cwd(), "data", "cadastro-consultas.json"),
    path.join(process.cwd(), "dashboard", "data", "cadastro-consultas.json"),
    path.join(process.cwd(), "..", "dashboard", "data", "cadastro-consultas.json"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

let overlayCached: {
  mtimeMs: number;
  path: string;
  byCnpj: Map<string, CadastroConsulta>;
  byNumero: Map<string, CadastroConsulta>;
  error?: string;
} | null = null;

function loadOverlay(): {
  byCnpj: Map<string, CadastroConsulta>;
  byNumero: Map<string, CadastroConsulta>;
  error?: string;
} {
  const empty = {
    byCnpj: new Map<string, CadastroConsulta>(),
    byNumero: new Map<string, CadastroConsulta>(),
  };
  const jsonPath = resolveCadastroPath();
  if (!existsSync(jsonPath)) return empty;

  try {
    const stat = statSync(jsonPath);
    if (
      overlayCached &&
      overlayCached.path === jsonPath &&
      overlayCached.mtimeMs === stat.mtimeMs
    ) {
      return {
        byCnpj: overlayCached.byCnpj,
        byNumero: overlayCached.byNumero,
        error: overlayCached.error,
      };
    }

    const parsed = JSON.parse(readFileSync(jsonPath, "utf-8")) as CadastroConsultasData;
    const byCnpj = new Map<string, CadastroConsulta>();
    const byNumero = new Map<string, CadastroConsulta>();

    for (const raw of parsed.empresas ?? []) {
      const item = normalizeCadastroItem(raw);
      if (!item) continue;
      const dig = digitsCnpj(item.cnpj);
      if (dig) byCnpj.set(dig, item);
      if (item.numero && item.numero !== "—") byNumero.set(item.numero, item);
    }

    overlayCached = { mtimeMs: stat.mtimeMs, path: jsonPath, byCnpj, byNumero };
    return { byCnpj, byNumero };
  } catch (err) {
    const message = err instanceof Error ? err.message : "JSON inválido";
    overlayCached = {
      mtimeMs: 0,
      path: jsonPath,
      byCnpj: new Map(),
      byNumero: new Map(),
      error: message,
    };
    return { ...empty, error: message };
  }
}

function codigoPrincipal(empresa: Empresa): string {
  if (empresa.codigo) return String(empresa.codigo).trim();
  const first = empresa.codigos?.[0];
  return first ? String(first).trim() : "";
}

function empresaKey(empresa: Empresa): string {
  const dig = digitsCnpj(empresa.cnpj);
  if (dig) return `cnpj:${dig}`;
  const codigo = codigoPrincipal(empresa);
  if (codigo) return `cod:${codigo}`;
  return `id:${empresa.id}`;
}

/** União de empresas de todas as competências, sem duplicar CNPJ/código. */
export function listEmpresasSistema(): Empresa[] {
  const map = new Map<string, Empresa>();
  for (const competencia of listCompetencias()) {
    for (const empresa of getEmpresas(competencia)) {
      const key = empresaKey(empresa);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, empresa);
        continue;
      }
      // Preferir registro com mais dados (nome/CNPJ/códigos).
      const score = (e: Empresa) =>
        (e.cnpj ? 2 : 0) + (e.nome ? 1 : 0) + (e.codigos?.length ?? 0) + (e.codigo ? 1 : 0);
      if (score(empresa) > score(prev)) map.set(key, empresa);
    }
  }
  return [...map.values()];
}

function fromSistema(
  empresa: Empresa,
  overlay: CadastroConsulta | undefined,
): CadastroConsulta | null {
  const numero = overlay?.numero || codigoPrincipal(empresa) || "";
  return normalizeCadastroItem({
    numero,
    empresa: overlay?.empresa || empresa.nome,
    cnpj: empresa.cnpj ?? overlay?.cnpj ?? null,
    uf: overlay?.uf && overlay.uf !== "—" ? overlay.uf : "",
    federal: overlay?.federal,
    estadual: overlay?.estadual,
    municipal: overlay?.municipal && overlay.municipal !== "—" ? overlay.municipal : "",
  });
}

/**
 * Cadastro de consultas: todas as empresas do sistema (todas as competências),
 * enriquecidas com UF/portais do JSON quando houver match.
 */
export function loadCadastroConsultas(): CadastroConsultasData & { error?: string } {
  const overlay = loadOverlay();
  const sistema = listEmpresasSistema();
  const rows: CadastroConsulta[] = [];
  const seen = new Set<string>();

  for (const empresa of sistema) {
    const dig = digitsCnpj(empresa.cnpj);
    const codigo = codigoPrincipal(empresa);
    const extra =
      (dig ? overlay.byCnpj.get(dig) : undefined) ??
      (codigo ? overlay.byNumero.get(codigo) : undefined);
    const row = fromSistema(empresa, extra);
    if (!row) continue;
    const key = dig ? `cnpj:${dig}` : `cod:${row.numero}|${row.empresa}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }

  // Entradas só do overlay (ex.: CNPJ que ainda não entrou no painel de débitos).
  for (const item of overlay.byCnpj.values()) {
    const dig = digitsCnpj(item.cnpj);
    const key = dig ? `cnpj:${dig}` : `cod:${item.numero}|${item.empresa}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(item);
  }

  rows.sort(sortCadastro);

  return {
    origem: "Empresas do sistema (união de todas as competências)",
    empresas: rows,
    error: overlay.error,
  };
}

export function getCadastroConsultas(): CadastroConsulta[] {
  return loadCadastroConsultas().empresas;
}
