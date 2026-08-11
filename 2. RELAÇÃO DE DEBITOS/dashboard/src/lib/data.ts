import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { sortCompetencias } from "@/lib/competencia";
import { formatCnpj } from "@/lib/format";
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

export function invalidateDashboardCache(): void {
  cached = null;
}

function digitsCnpj(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

function writeDashboardFileAtomic(jsonPath: string, data: DashboardData): void {
  const dir = path.dirname(jsonPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${jsonPath}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  try {
    renameSync(tmp, jsonPath);
  } catch {
    if (existsSync(jsonPath)) unlinkSync(jsonPath);
    renameSync(tmp, jsonPath);
  }
}

/**
 * Resolve quais `id` devem receber o patch.
 * Prioridade: id explícito → CNPJ → código.
 */
function resolveTargetIds(
  data: DashboardData,
  match: EmpresaIdentityMatch,
): Set<string> {
  const ids = new Set<string>();
  const matchId = (match.matchId || "").trim();
  if (matchId) {
    ids.add(matchId);
    return ids;
  }

  const matchDig = digitsCnpj(match.matchCnpj);
  const matchCodigo = (match.matchCodigo || "").trim();

  const visit = (empresas: Empresa[] | undefined, mode: "cnpj" | "codigo") => {
    if (!empresas) return;
    for (const empresa of empresas) {
      if (mode === "cnpj") {
        if (matchDig && digitsCnpj(empresa.cnpj) === matchDig) ids.add(empresa.id);
        continue;
      }
      if (matchCodigo && matchCodigo !== "—") {
        const codes = [empresa.codigo, ...(empresa.codigos ?? [])]
          .filter(Boolean)
          .map(String);
        if (codes.includes(matchCodigo)) ids.add(empresa.id);
      }
    }
  };

  if (matchDig) {
    visit(data.empresas, "cnpj");
    if (data.snapshots) {
      for (const snap of Object.values(data.snapshots)) visit(snap.empresas, "cnpj");
    }
    if (ids.size > 0) return ids;
  }

  visit(data.empresas, "codigo");
  if (data.snapshots) {
    for (const snap of Object.values(data.snapshots)) visit(snap.empresas, "codigo");
  }
  return ids;
}

function applyIdentityPatch(
  empresa: Empresa,
  patch: { nome?: string; cnpj?: string | null; codigo?: string },
): Empresa {
  const next: Empresa = { ...empresa };

  if (patch.nome !== undefined) {
    const nome = patch.nome.trim();
    if (nome && nome !== "—") next.nome = nome;
  }

  if (patch.cnpj !== undefined) {
    const dig = digitsCnpj(patch.cnpj);
    next.cnpj = dig ? formatCnpj(dig) : patch.cnpj?.trim() || null;
  }

  if (patch.codigo !== undefined) {
    const codigo = patch.codigo.trim();
    if (codigo && codigo !== "—") {
      next.codigo = codigo;
      const codigos = new Set(
        [empresa.codigo, ...(empresa.codigos ?? []), codigo]
          .filter(Boolean)
          .map(String),
      );
      next.codigos = [...codigos];
    }
  }

  return next;
}

function identityUnchanged(before: Empresa, after: Empresa): boolean {
  if (before.nome !== after.nome) return false;
  if (digitsCnpj(before.cnpj) !== digitsCnpj(after.cnpj)) return false;
  if (String(before.codigo ?? "") !== String(after.codigo ?? "")) return false;
  const a = [...(before.codigos ?? [])].map(String).sort().join("|");
  const b = [...(after.codigos ?? [])].map(String).sort().join("|");
  return a === b;
}

export type EmpresaIdentityMatch = {
  matchId?: string;
  matchCnpj?: string | null;
  matchCodigo?: string | null;
};

export type EmpresaIdentityPatch = {
  nome?: string;
  cnpj?: string | null;
  codigo?: string;
};

/**
 * Atualiza nome/CNPJ/código da mesma empresa em todas as competências.
 * Não altera `id` (URLs e PDFs). Retorna quantas ocorrências foram atualizadas.
 */
export function updateEmpresaIdentity(
  match: EmpresaIdentityMatch,
  patch: EmpresaIdentityPatch,
): { updated: number; ids: string[] } {
  const hasPatch =
    patch.nome !== undefined || patch.cnpj !== undefined || patch.codigo !== undefined;
  if (!hasPatch) return { updated: 0, ids: [] };

  const matchId = (match.matchId || "").trim();
  const matchDig = digitsCnpj(match.matchCnpj);
  const matchCodigo = (match.matchCodigo || "").trim();
  if (!matchId && !matchDig && (!matchCodigo || matchCodigo === "—")) {
    return { updated: 0, ids: [] };
  }

  const jsonPath = resolveJsonPath();
  if (!existsSync(jsonPath)) {
    return { updated: 0, ids: [] };
  }

  const raw = JSON.parse(readFileSync(jsonPath, "utf-8")) as DashboardData;
  const targetIds = resolveTargetIds(raw, match);
  if (targetIds.size === 0) {
    return { updated: 0, ids: [] };
  }

  const ids = new Set<string>();
  let updated = 0;

  const patchList = (empresas: Empresa[] | undefined): Empresa[] | undefined => {
    if (!empresas) return empresas;
    return empresas.map((empresa) => {
      if (!targetIds.has(empresa.id)) return empresa;
      const next = applyIdentityPatch(empresa, patch);
      if (identityUnchanged(empresa, next)) return empresa;
      updated += 1;
      ids.add(empresa.id);
      return next;
    });
  };

  raw.empresas = patchList(raw.empresas) ?? [];

  if (raw.snapshots) {
    const nextSnapshots: Record<string, CompetenciaSnapshot> = {};
    for (const [key, snap] of Object.entries(raw.snapshots)) {
      nextSnapshots[key] = {
        ...snap,
        empresas: patchList(snap.empresas) ?? snap.empresas,
      };
    }
    raw.snapshots = nextSnapshots;
  }

  if (updated === 0) {
    return { updated: 0, ids: [] };
  }

  writeDashboardFileAtomic(jsonPath, raw);
  invalidateDashboardCache();
  return { updated, ids: [...ids] };
}

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
