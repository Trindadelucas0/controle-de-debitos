import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs";
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
  excluidas: Set<string>;
  error?: string;
} | null = null;

/** Invalida o cache em memória do overlay (após gravação). */
export function invalidateCadastroOverlayCache(): void {
  overlayCached = null;
}

function readOverlayFile(jsonPath: string): CadastroConsultasData {
  if (!existsSync(jsonPath)) {
    return {
      origem: "Complemento opcional de UF/portais (a lista principal vem do sistema)",
      empresas: [],
      excluidas: [],
    };
  }
  const parsed = JSON.parse(readFileSync(jsonPath, "utf-8")) as CadastroConsultasData;
  return {
    gerado_em: parsed.gerado_em,
    origem:
      parsed.origem ??
      "Complemento opcional de UF/portais (a lista principal vem do sistema)",
    empresas: Array.isArray(parsed.empresas) ? parsed.empresas : [],
    excluidas: Array.isArray(parsed.excluidas)
      ? parsed.excluidas.filter((key) => typeof key === "string" && key.trim())
      : [],
  };
}

function writeOverlayFileAtomic(jsonPath: string, data: CadastroConsultasData): void {
  const dir = path.dirname(jsonPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${jsonPath}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  try {
    renameSync(tmp, jsonPath);
  } catch {
    // Windows: rename sobre arquivo existente pode falhar.
    if (existsSync(jsonPath)) unlinkSync(jsonPath);
    renameSync(tmp, jsonPath);
  }
}

export type CadastroMatchKey = {
  numero?: string;
  cnpj?: string | null;
  /** id estável em empresas.json (evita colisão de CNPJ/código duplicados). */
  id?: string;
};

function exclusionKeyFromParts(cnpj?: string | null, numero?: string): string | null {
  const dig = digitsCnpj(cnpj);
  if (dig) return `cnpj:${dig}`;
  const num = (numero || "").trim();
  if (num && num !== "—") return `num:${num}`;
  return null;
}

function exclusionKeysForMatch(match: CadastroMatchKey | undefined, item?: CadastroConsulta): string[] {
  const keys = new Set<string>();
  const fromMatch = exclusionKeyFromParts(match?.cnpj, match?.numero);
  if (fromMatch) keys.add(fromMatch);
  if (item) {
    const fromItem = exclusionKeyFromParts(item.cnpj, item.numero);
    if (fromItem) keys.add(fromItem);
  }
  return [...keys];
}

function findOverlayIndex(
  empresas: CadastroConsulta[],
  match: CadastroMatchKey | undefined,
  item: CadastroConsulta,
): number {
  const matchNumero = (match?.numero ?? "").trim();
  if (matchNumero && matchNumero !== "—") {
    const byNum = empresas.findIndex((e) => e.numero.trim() === matchNumero);
    if (byNum >= 0) return byNum;
  }
  const matchDig = digitsCnpj(match?.cnpj);
  if (matchDig) {
    const byCnpj = empresas.findIndex((e) => digitsCnpj(e.cnpj) === matchDig);
    if (byCnpj >= 0) return byCnpj;
  }
  const itemNumero = item.numero.trim();
  if (itemNumero && itemNumero !== "—") {
    const byNum = empresas.findIndex((e) => e.numero.trim() === itemNumero);
    if (byNum >= 0) return byNum;
  }
  const itemDig = digitsCnpj(item.cnpj);
  if (itemDig) {
    return empresas.findIndex((e) => digitsCnpj(e.cnpj) === itemDig);
  }
  return -1;
}

function isExcluded(excluidas: Set<string>, cnpj: string | null | undefined, numero: string): boolean {
  const dig = digitsCnpj(cnpj);
  if (dig && excluidas.has(`cnpj:${dig}`)) return true;
  const num = (numero || "").trim();
  if (num && num !== "—" && excluidas.has(`num:${num}`)) return true;
  return false;
}

/**
 * Upsert de uma linha no overlay `cadastro-consultas.json`.
 * `match` identifica a entrada anterior (antes de editar número/CNPJ).
 */
export function saveCadastroOverlayItem(
  raw: Partial<CadastroConsulta>,
  match?: CadastroMatchKey,
): CadastroConsulta {
  const item = normalizeCadastroItem(raw);
  if (!item) {
    throw new Error("Linha inválida: informe número ou empresa.");
  }

  const jsonPath = resolveCadastroPath();
  const data = readOverlayFile(jsonPath);
  const empresas = [...data.empresas];
  const idx = findOverlayIndex(empresas, match, item);

  if (idx >= 0) {
    empresas[idx] = item;
  } else {
    empresas.push(item);
  }

  empresas.sort(sortCadastro);

  // Reativar se estava na lista de excluídas.
  const revive = new Set(exclusionKeysForMatch(match, item));
  const excluidas = (data.excluidas ?? []).filter((key) => !revive.has(key));

  const today = new Date().toISOString().slice(0, 10);
  writeOverlayFileAtomic(jsonPath, {
    ...data,
    gerado_em: today,
    empresas,
    excluidas,
  });
  invalidateCadastroOverlayCache();
  return item;
}

/**
 * Remove a empresa do overlay e a oculta no cadastro de consultas
 * (mesmo que ainda exista em empresas.json / débitos).
 */
export function removeCadastroItem(match: CadastroMatchKey): {
  removed: boolean;
  key: string | null;
} {
  const jsonPath = resolveCadastroPath();
  const data = readOverlayFile(jsonPath);
  const empresas = [...data.empresas];

  const probe: CadastroConsulta = {
    numero: (match.numero || "").trim() || "—",
    empresa: "—",
    cnpj: match.cnpj ?? null,
    uf: "—",
    federal: "ECAC",
    estadual: "AGENCIA NET",
    municipal: "—",
  };
  const idx = findOverlayIndex(empresas, match, probe);
  let removedOverlay = false;
  let removedItem: CadastroConsulta | undefined;
  if (idx >= 0) {
    removedItem = empresas[idx];
    empresas.splice(idx, 1);
    removedOverlay = true;
  }

  const keys = exclusionKeysForMatch(match, removedItem);
  if (keys.length === 0) {
    throw new Error("Informe número ou CNPJ para excluir.");
  }

  const excluidas = new Set(data.excluidas ?? []);
  for (const key of keys) excluidas.add(key);

  const today = new Date().toISOString().slice(0, 10);
  writeOverlayFileAtomic(jsonPath, {
    ...data,
    gerado_em: today,
    empresas,
    excluidas: [...excluidas],
  });
  invalidateCadastroOverlayCache();
  return { removed: removedOverlay || keys.length > 0, key: keys[0] ?? null };
}

function loadOverlay(): {
  byCnpj: Map<string, CadastroConsulta>;
  byNumero: Map<string, CadastroConsulta>;
  excluidas: Set<string>;
  error?: string;
} {
  const empty = {
    byCnpj: new Map<string, CadastroConsulta>(),
    byNumero: new Map<string, CadastroConsulta>(),
    excluidas: new Set<string>(),
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
        excluidas: overlayCached.excluidas,
        error: overlayCached.error,
      };
    }

    const parsed = JSON.parse(readFileSync(jsonPath, "utf-8")) as CadastroConsultasData;
    const byCnpj = new Map<string, CadastroConsulta>();
    const byNumero = new Map<string, CadastroConsulta>();
    const excluidas = new Set(
      (parsed.excluidas ?? []).filter((key) => typeof key === "string" && key.trim()),
    );

    for (const raw of parsed.empresas ?? []) {
      const item = normalizeCadastroItem(raw);
      if (!item) continue;
      const dig = digitsCnpj(item.cnpj);
      if (dig) byCnpj.set(dig, item);
      if (item.numero && item.numero !== "—") byNumero.set(item.numero, item);
    }

    overlayCached = { mtimeMs: stat.mtimeMs, path: jsonPath, byCnpj, byNumero, excluidas };
    return { byCnpj, byNumero, excluidas };
  } catch (err) {
    const message = err instanceof Error ? err.message : "JSON inválido";
    overlayCached = {
      mtimeMs: 0,
      path: jsonPath,
      byCnpj: new Map(),
      byNumero: new Map(),
      excluidas: new Set(),
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
  const numeroSistema = codigoPrincipal(empresa) || "";
  // Com overlay, preferir todos os campos editados (senão a edição não “gruda”).
  if (overlay) {
    return normalizeCadastroItem({
      numero: overlay.numero && overlay.numero !== "—" ? overlay.numero : numeroSistema,
      empresa: overlay.empresa && overlay.empresa !== "—" ? overlay.empresa : empresa.nome,
      cnpj: overlay.cnpj ?? empresa.cnpj ?? null,
      uf: overlay.uf && overlay.uf !== "—" ? overlay.uf : "",
      federal: overlay.federal,
      estadual: overlay.estadual,
      municipal: overlay.municipal && overlay.municipal !== "—" ? overlay.municipal : "",
    });
  }
  return normalizeCadastroItem({
    numero: numeroSistema,
    empresa: empresa.nome,
    cnpj: empresa.cnpj ?? null,
    uf: "",
    federal: undefined,
    estadual: undefined,
    municipal: "",
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
  const excluidas = overlay.excluidas;

  for (const empresa of sistema) {
    const dig = digitsCnpj(empresa.cnpj);
    const codigo = codigoPrincipal(empresa);
    if (isExcluded(excluidas, empresa.cnpj, codigo)) continue;
    // Preferir match por número (chave estável das edições).
    const extra =
      (codigo ? overlay.byNumero.get(codigo) : undefined) ??
      (dig ? overlay.byCnpj.get(dig) : undefined);
    const row = fromSistema(empresa, extra);
    if (!row) continue;
    if (isExcluded(excluidas, row.cnpj, row.numero)) continue;
    const rowDig = digitsCnpj(row.cnpj);
    const key = rowDig ? `cnpj:${rowDig}` : `cod:${row.numero}|${row.empresa}`;
    const numKey = row.numero && row.numero !== "—" ? `num:${row.numero}` : "";
    if (seen.has(key) || (numKey && seen.has(numKey))) continue;
    seen.add(key);
    if (numKey) seen.add(numKey);
    rows.push(row);
  }

  // Entradas só do overlay (ex.: CNPJ que ainda não entrou no painel de débitos).
  const overlayOnly = new Map<string, CadastroConsulta>();
  for (const item of overlay.byNumero.values()) {
    if (isExcluded(excluidas, item.cnpj, item.numero)) continue;
    overlayOnly.set(`n:${item.numero}`, item);
  }
  for (const item of overlay.byCnpj.values()) {
    if (isExcluded(excluidas, item.cnpj, item.numero)) continue;
    const dig = digitsCnpj(item.cnpj);
    overlayOnly.set(dig ? `c:${dig}` : `n:${item.numero}`, item);
  }
  for (const item of overlayOnly.values()) {
    const dig = digitsCnpj(item.cnpj);
    const key = dig ? `cnpj:${dig}` : `cod:${item.numero}|${item.empresa}`;
    const numKey = item.numero && item.numero !== "—" ? `num:${item.numero}` : "";
    if (seen.has(key) || (numKey && seen.has(numKey))) continue;
    seen.add(key);
    if (numKey) seen.add(numKey);
    rows.push(item);
  }

  rows.sort(sortCadastro);

  return {
    origem: "Empresas do sistema (união de todas as competências)",
    empresas: rows,
    excluidas: [...excluidas],
    error: overlay.error,
  };
}

export function getCadastroConsultas(): CadastroConsulta[] {
  return loadCadastroConsultas().empresas;
}
