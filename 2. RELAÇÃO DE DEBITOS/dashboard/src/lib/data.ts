import { readFileSync, existsSync, statSync } from "fs";
import path from "path";
import { sortCompetencias } from "@/lib/competencia";
import type { CompetenciaSnapshot, DashboardData, Empresa, TotaisGerais } from "./types";

const EMPTY_TOTAIS: TotaisGerais = {
  empresas: 0,
  com_pendencia: 0,
  regulares: 0,
  saldo: 0,
  consolidado: 0,
};

function resolveJsonPath(): string {
  const candidates = [
    path.join(process.cwd(), "data", "empresas.json"),
    path.join(process.cwd(), "dashboard", "data", "empresas.json"),
    path.join(process.cwd(), "..", "dashboard", "data", "empresas.json"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function emptyDashboard(error?: string): DashboardData & { dataError?: string } {
  return {
    gerado_em: new Date().toISOString(),
    competencias: [],
    atual: "",
    snapshots: {},
    competencia: "",
    pasta_mes: "",
    totais_gerais: { ...EMPTY_TOTAIS },
    empresas: [],
    dataError: error,
  };
}

let cached: { mtimeMs: number; path: string; data: DashboardData & { dataError?: string } } | null =
  null;

export function loadDashboardData(): DashboardData & { dataError?: string } {
  const jsonPath = resolveJsonPath();
  if (!existsSync(jsonPath)) {
    return emptyDashboard(`Arquivo não encontrado: ${jsonPath}`);
  }
  try {
    const stat = statSync(jsonPath);
    if (cached && cached.path === jsonPath && cached.mtimeMs === stat.mtimeMs) {
      return cached.data;
    }
    const raw = readFileSync(jsonPath, "utf-8");
    const parsed = JSON.parse(raw) as DashboardData;
    const data = { ...parsed, dataError: undefined as string | undefined };
    cached = { mtimeMs: stat.mtimeMs, path: jsonPath, data };
    return data;
  } catch (err) {
    const message = err instanceof Error ? err.message : "JSON inválido";
    return emptyDashboard(message);
  }
}

/** Compat: acesso preguiçoso (sem import estático do JSON). */
export const dashboardData: DashboardData = new Proxy({} as DashboardData, {
  get(_target, prop, receiver) {
    const data = loadDashboardData();
    return Reflect.get(data, prop, receiver);
  },
});

export function listCompetencias(): string[] {
  const data = loadDashboardData();
  if (data.competencias?.length) {
    return sortCompetencias(data.competencias);
  }
  if (data.atual) return [data.atual];
  if (data.competencia) return [data.competencia];
  return [];
}

export function getCompetenciaAtual(): string {
  const data = loadDashboardData();
  const list = listCompetencias();
  if (data.atual && list.includes(data.atual)) {
    return data.atual;
  }
  return list[list.length - 1] ?? "";
}

export function resolveCompetencia(requested?: string | null): string {
  const list = listCompetencias();
  if (requested && list.includes(requested)) return requested;
  return getCompetenciaAtual();
}

export function getSnapshot(competencia?: string | null): CompetenciaSnapshot {
  const data = loadDashboardData();
  const id = resolveCompetencia(competencia);
  const fromMap = data.snapshots?.[id];
  if (fromMap) return fromMap;

  return {
    competencia: id || "atual",
    gerado_em: data.gerado_em,
    pasta_mes: data.pasta_mes,
    totais_gerais: data.totais_gerais,
    empresas: data.empresas,
  };
}

export function getEmpresas(competencia?: string | null): Empresa[] {
  return getSnapshot(competencia).empresas;
}

export function getEmpresa(id: string, competencia?: string | null): Empresa | undefined {
  const empresas = getEmpresas(competencia);
  const exact = empresas.find((empresa) => empresa.id === id);
  if (exact) return exact;

  // Slug legado de pasta CNPJ: "134-83102277000152" ou "83102277000152"
  const cnpjMatch = id.match(/(?:^|\D)(\d{14})(?:$|\D)/);
  const cnpjDigits = cnpjMatch?.[1];
  if (cnpjDigits) {
    const byCnpj = empresas.find(
      (empresa) => (empresa.cnpj || "").replace(/\D/g, "") === cnpjDigits,
    );
    if (byCnpj) return byCnpj;
  }

  // Prefixo de código + nome: "134-art-fort-..." — exige overlap do slug.
  // Sem isso, "134-art-fort-..." caía em outra empresa só porque codigo === "134".
  const codeMatch = id.match(/^(\d+)-(.+)$/);
  if (codeMatch) {
    const [, code, rest] = codeMatch;
    const restNorm = rest.toLowerCase();
    const candidates = empresas.filter((empresa) => {
      const codes = [empresa.codigo, ...(empresa.codigos ?? [])].map(String);
      return codes.includes(code);
    });
    const bySlug = candidates.find((empresa) => {
      if (empresa.id === id) return true;
      const empRest = empresa.id.replace(new RegExp(`^${code}-`), "").toLowerCase();
      if (!empRest) return false;
      const a = restNorm.slice(0, 16);
      const b = empRest.slice(0, 16);
      return a === b || restNorm.startsWith(b) || empRest.startsWith(a);
    });
    if (bySlug) return bySlug;
  }

  return undefined;
}

/** Localiza a mesma empresa em outra competência (id → código → CNPJ). */
export function findEmpresaNaCompetencia(
  ref: Pick<Empresa, "id" | "codigo" | "cnpj" | "codigos">,
  competencia: string,
): Empresa | undefined {
  const empresas = getEmpresas(competencia);
  const byId = empresas.find((e) => e.id === ref.id);
  if (byId) return byId;

  const codigosRef = new Set(
    [ref.codigo, ...(ref.codigos ?? [])].filter(Boolean).map(String),
  );
  if (codigosRef.size > 0) {
    const byCodigo = empresas.find((e) => {
      const codigos = [e.codigo, ...(e.codigos ?? [])].filter(Boolean).map(String);
      return codigos.some((c) => codigosRef.has(c));
    });
    if (byCodigo) return byCodigo;
  }

  if (ref.cnpj) {
    return empresas.find((e) => e.cnpj === ref.cnpj);
  }
  return undefined;
}

export function allEmpresaIds(): string[] {
  const ids = new Set<string>();
  for (const competencia of listCompetencias()) {
    for (const empresa of getEmpresas(competencia)) {
      ids.add(empresa.id);
    }
  }
  if (ids.size === 0) {
    for (const empresa of loadDashboardData().empresas) ids.add(empresa.id);
  }
  return [...ids];
}

export function getDataError(): string | undefined {
  return loadDashboardData().dataError;
}
