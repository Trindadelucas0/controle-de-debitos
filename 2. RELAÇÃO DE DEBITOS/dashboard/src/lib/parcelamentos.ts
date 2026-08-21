import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import path from "path";
import { sortCompetencias } from "@/lib/competencia";
import {
  MAX_TOTAL_PARCELAS,
  addMesesCompetencia,
  calcInicioCompetencia,
  calcParcelaAtual,
  calcUltimaCompetencia,
  competenciaToIndex,
  indexToCompetencia,
  PARCELAMENTO_STATUS_DEFAULT,
  isTipoVencimentoAutomatico,
  isValidCompetencia,
  normalizeEmpresa,
  normalizeRegistro,
  padCnpj14,
  parseParcelaPositiva,
  parseParcelamentoStatus,
  sortEmpresasParcelamento,
  vencimentoAutomaticoPorTipo,
  type EmpresaInput,
  type RegistroInput,
} from "@/lib/parcelamentos-utils";
import type {
  CompetenciaRegistro,
  EmpresaParcelamento,
  ParcelamentosData,
} from "@/lib/types";

function resolveParcelamentosPath(): string {
  const candidates = [
    path.join(process.cwd(), "data", "parcelamentos.json"),
    path.join(process.cwd(), "dashboard", "data", "parcelamentos.json"),
    path.join(process.cwd(), "..", "dashboard", "data", "parcelamentos.json"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

let cached: {
  mtimeMs: number;
  path: string;
  data: ParcelamentosData;
  error?: string;
} | null = null;

export function invalidateParcelamentosCache(): void {
  cached = null;
}

function emptyData(): ParcelamentosData {
  return {
    origem: "Controle operacional de parcelamentos",
    empresas: [],
    competencias: [],
    atual: "",
    porCompetencia: {},
  };
}

function coerceData(raw: unknown): ParcelamentosData {
  const parsed = (raw ?? {}) as Partial<ParcelamentosData> & {
    parcelamentos?: unknown;
  };

  // Ignora modelo antigo (lista plana) se ainda existir em memória.
  let empresas = Array.isArray(parsed.empresas)
    ? ([...parsed.empresas] as EmpresaParcelamento[])
    : [];
  const competencias = Array.isArray(parsed.competencias)
    ? parsed.competencias.filter((c): c is string => typeof c === "string")
    : [];
  const porCompetenciaRaw =
    parsed.porCompetencia && typeof parsed.porCompetencia === "object"
      ? parsed.porCompetencia
      : {};

  // Migração: Nº parcelamento do mês → empresa; remove do registro.
  const porCompetencia: ParcelamentosData["porCompetencia"] = {};
  const numeroByEmpresa = new Map<string, string>();
  for (const [comp, map] of Object.entries(porCompetenciaRaw)) {
    const nextMonth: Record<string, CompetenciaRegistro> = {};
    for (const [empId, reg] of Object.entries(map ?? {})) {
      const legacy = reg as CompetenciaRegistro & { numeroParcelamento?: string };
      const num = String(legacy.numeroParcelamento ?? "").trim();
      if (num && !numeroByEmpresa.has(empId)) {
        numeroByEmpresa.set(empId, num);
      }
      const { numeroParcelamento: _drop, ...rest } = legacy;
      nextMonth[empId] = {
        ...rest,
        status: parseParcelamentoStatus(rest.status) ?? PARCELAMENTO_STATUS_DEFAULT,
      };
    }
    porCompetencia[comp] = nextMonth;
  }

  empresas = empresas.map((e) => {
    const fromMonth = numeroByEmpresa.get(e.id);
    const numero =
      String(e.numeroParcelamento ?? "").trim() || fromMonth || undefined;
    // Corrige CNPJ Ética (seed antigo com zero à esquerda errado).
    let cnpj = e.cnpj;
    if (e.id === "emp-092" || e.cod === "92") {
      if (cnpj === "04744446000262" || cnpj === "4744446000262") {
        cnpj = "47444446000262";
      }
    }
    return {
      ...e,
      cnpj,
      ...(numero ? { numeroParcelamento: numero } : {}),
    };
  });

  const atual =
    typeof parsed.atual === "string" && parsed.atual
      ? parsed.atual
      : competencias[competencias.length - 1] || "";

  return {
    gerado_em: parsed.gerado_em,
    origem: parsed.origem ?? "Controle operacional de parcelamentos",
    empresas,
    competencias: sortCompetencias(competencias),
    atual,
    porCompetencia,
  };
}

function readFile(jsonPath: string): ParcelamentosData {
  if (!existsSync(jsonPath)) return emptyData();
  const parsed = JSON.parse(readFileSync(jsonPath, "utf-8")) as unknown;
  return coerceData(parsed);
}

function writeFileAtomic(jsonPath: string, data: ParcelamentosData): void {
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

function loadRaw(): { path: string; data: ParcelamentosData; error?: string } {
  const jsonPath = resolveParcelamentosPath();
  try {
    return { path: jsonPath, data: readFile(jsonPath) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao ler parcelamentos.";
    return { path: jsonPath, data: emptyData(), error: message };
  }
}

function getCachedOrLoad(): {
  path: string;
  data: ParcelamentosData;
  error?: string;
} {
  const jsonPath = resolveParcelamentosPath();
  let mtimeMs = 0;
  try {
    if (existsSync(jsonPath)) mtimeMs = statSync(jsonPath).mtimeMs;
  } catch {
    mtimeMs = 0;
  }

  if (cached && cached.path === jsonPath && cached.mtimeMs === mtimeMs) {
    return { path: cached.path, data: cached.data, error: cached.error };
  }

  const loaded = loadRaw();
  cached = {
    mtimeMs,
    path: loaded.path,
    data: loaded.data,
    error: loaded.error,
  };
  return loaded;
}

function persist(data: ParcelamentosData): ParcelamentosData {
  const jsonPath = resolveParcelamentosPath();
  const next: ParcelamentosData = {
    ...data,
    gerado_em: new Date().toISOString().slice(0, 10),
    origem: data.origem ?? "Controle operacional de parcelamentos",
    empresas: sortEmpresasParcelamento(data.empresas),
    competencias: sortCompetencias(data.competencias),
  };
  writeFileAtomic(jsonPath, next);
  invalidateParcelamentosCache();
  return next;
}

export function loadParcelamentos(): ParcelamentosData & { error?: string } {
  const loaded = getCachedOrLoad();
  return { ...loaded.data, error: loaded.error };
}

export function listParcelamentoCompetencias(): string[] {
  return loadParcelamentos().competencias;
}

export function getRegistrosCompetencia(
  competencia: string,
): Record<string, CompetenciaRegistro> {
  const data = loadParcelamentos();
  return data.porCompetencia[competencia] ?? {};
}

export function createEmpresa(
  input: EmpresaInput,
  competencia: string,
  registroInicial?: RegistroInput,
): { empresa: EmpresaParcelamento; registro: CompetenciaRegistro } {
  const data = loadParcelamentos();
  if (data.error) throw new Error(data.error);

  const comp = (competencia || data.atual || "").trim();
  if (!isValidCompetencia(comp)) {
    throw new Error("Competência inválida (use MM-YYYY).");
  }

  const empresa = normalizeEmpresa(input);
  const dig = padCnpj14(empresa.cnpj);
  if (data.empresas.some((e) => e.cnpj === dig)) {
    throw new Error("Já existe empresa com este CNPJ.");
  }

  const registro = normalizeRegistro(
    registroInicial ?? { status: PARCELAMENTO_STATUS_DEFAULT },
  );

  const competencias = data.competencias.includes(comp)
    ? data.competencias
    : [...data.competencias, comp];

  const porCompetencia = { ...data.porCompetencia };
  const month = { ...(porCompetencia[comp] ?? {}) };
  month[empresa.id] = registro;
  porCompetencia[comp] = month;

  persist({
    ...data,
    empresas: [...data.empresas, empresa],
    competencias,
    atual: data.atual || comp,
    porCompetencia,
  });

  return { empresa, registro };
}

export function updateEmpresa(
  id: string,
  input: EmpresaInput,
): EmpresaParcelamento {
  const key = (id || "").trim();
  if (!key) throw new Error("Id da empresa é obrigatório.");
  const data = loadParcelamentos();
  if (data.error) throw new Error(data.error);

  const idx = data.empresas.findIndex((e) => e.id === key);
  if (idx < 0) throw new Error("Empresa não encontrada.");

  const empresa = normalizeEmpresa(
    { ...data.empresas[idx], ...input, id: key },
    { id: key },
  );
  const dig = empresa.cnpj;
  if (data.empresas.some((e) => e.id !== key && e.cnpj === dig)) {
    throw new Error("Já existe empresa com este CNPJ.");
  }

  const empresas = [...data.empresas];
  empresas[idx] = empresa;
  persist({ ...data, empresas });
  return empresa;
}

/**
 * Cria competências faltantes de `de` até `ate` (inclusive), em cadeia.
 * Meses novos nascem vazios — só entram empresas ao preencher o cronograma.
 */
function ensureCompetenciasAte(
  data: ParcelamentosData,
  de: string,
  ate: string,
): ParcelamentosData {
  const startIdx = competenciaToIndex(de);
  const endIdx = competenciaToIndex(ate);
  if (startIdx == null || endIdx == null || endIdx < startIdx) return data;

  let competencias = [...data.competencias];
  const porCompetencia: ParcelamentosData["porCompetencia"] = {
    ...data.porCompetencia,
  };

  if (!porCompetencia[de]) {
    porCompetencia[de] = {};
  }
  if (!competencias.includes(de)) {
    competencias = [...competencias, de];
  }

  for (let idx = startIdx + 1; idx <= endIdx; idx += 1) {
    const next = indexToCompetencia(idx);
    if (!porCompetencia[next]) {
      porCompetencia[next] = {};
      if (!competencias.includes(next)) {
        competencias = [...competencias, next];
      }
    }
  }

  return {
    ...data,
    competencias: sortCompetencias(competencias),
    porCompetencia,
  };
}

function registroFuturoDaEmpresa(
  base: CompetenciaRegistro,
  competenciaMes: string,
): CompetenciaRegistro {
  const vencAuto = isTipoVencimentoAutomatico(base.tipo)
    ? vencimentoAutomaticoPorTipo(base.tipo, competenciaMes)
    : "";
  return {
    status: base.status,
    ...(base.tipo ? { tipo: base.tipo } : {}),
    totalParcelas: base.totalParcelas ?? null,
    vencimento: vencAuto || null,
    ...(base.inicioCompetencia ? { inicioCompetencia: base.inicioCompetencia } : {}),
    atualizadoEm: new Date().toISOString(),
  };
}

export function updateRegistro(
  competencia: string,
  empresaId: string,
  input: RegistroInput,
): {
  registro: CompetenciaRegistro;
  competencias: string[];
  ultimaCompetencia: string | null;
  mesesCronograma: string[];
} {
  const comp = (competencia || "").trim();
  const empId = (empresaId || "").trim();
  if (!isValidCompetencia(comp)) throw new Error("Competência inválida.");
  if (!empId) throw new Error("Id da empresa é obrigatório.");

  let data = loadParcelamentos();
  if (data.error) throw new Error(data.error);
  if (!data.empresas.some((e) => e.id === empId)) {
    throw new Error("Empresa não encontrada.");
  }

  const current = data.porCompetencia[comp]?.[empId];
  const totalInformado = parseParcelaPositiva(input.totalParcelas);
  /** Se informou total e omitiu parcela, assume a 1ª (mês aberto = início). */
  let parcelaInformada = parseParcelaPositiva(input.parcelaAtual);
  if (totalInformado != null && parcelaInformada == null) {
    parcelaInformada = 1;
  }

  let inicioDerived: string | undefined;
  let ultimaCompetencia: string | null = null;
  const mesesDoCronograma: string[] = [];

  if (totalInformado != null && parcelaInformada != null) {
    if (totalInformado > MAX_TOTAL_PARCELAS) {
      throw new Error(`Total de parcelas não pode passar de ${MAX_TOTAL_PARCELAS}.`);
    }
    if (parcelaInformada > totalInformado) {
      throw new Error("Parcela atual não pode ser maior que o total.");
    }

    const inicioExistente = String(
      input.inicioCompetencia ?? current?.inicioCompetencia ?? "",
    ).trim();
    // Se a parcela enviada é a esperada para este mês, não desloca o início.
    if (inicioExistente && isValidCompetencia(inicioExistente)) {
      const esperada = calcParcelaAtual(
        inicioExistente,
        comp,
        totalInformado,
      );
      if (esperada === parcelaInformada) {
        inicioDerived = inicioExistente;
      }
    }
    if (!inicioDerived) {
      inicioDerived = calcInicioCompetencia(comp, parcelaInformada);
    }
    if (!inicioDerived) {
      throw new Error("Não foi possível calcular o início do parcelamento.");
    }
    ultimaCompetencia =
      calcUltimaCompetencia(comp, parcelaInformada, totalInformado) || null;
  }

  const merged: RegistroInput = {
    ...current,
    ...input,
    inicioCompetencia:
      inicioDerived ??
      input.inicioCompetencia ??
      current?.inicioCompetencia ??
      (totalInformado != null ? comp : current?.inicioCompetencia),
  };
  const registro = normalizeRegistro(
    merged,
    parseParcelamentoStatus(current?.status) ?? PARCELAMENTO_STATUS_DEFAULT,
  );

  let competencias = data.competencias.includes(comp)
    ? data.competencias
    : [...data.competencias, comp];
  let porCompetencia = { ...data.porCompetencia };
  const monthAtual = { ...(porCompetencia[comp] ?? {}) };
  monthAtual[empId] = registro;
  porCompetencia[comp] = monthAtual;

  data = {
    ...data,
    competencias,
    porCompetencia,
  };

  if (
    totalInformado != null &&
    parcelaInformada != null &&
    registro.totalParcelas != null &&
    registro.totalParcelas >= 1 &&
    ultimaCompetencia
  ) {
    // Ex.: total 2 parcela 1 → só o mês seguinte; total 24 → todos até o fim.
    const mesesRestantes = registro.totalParcelas - parcelaInformada;
    if (mesesRestantes > 0 && ultimaCompetencia !== comp) {
      data = ensureCompetenciasAte(data, comp, ultimaCompetencia);
      porCompetencia = { ...data.porCompetencia };
      competencias = data.competencias;

      let cursor = addMesesCompetencia(comp, 1);
      while (cursor && competenciaToIndex(cursor)! <= competenciaToIndex(ultimaCompetencia)!) {
        const monthMap = { ...(porCompetencia[cursor] ?? {}) };
        monthMap[empId] = registroFuturoDaEmpresa(registro, cursor);
        porCompetencia[cursor] = monthMap;
        mesesDoCronograma.push(cursor);
        if (cursor === ultimaCompetencia) break;
        cursor = addMesesCompetencia(cursor, 1);
      }
      data = { ...data, porCompetencia };
    }
  }

  const saved = persist({
    ...data,
    competencias: data.competencias,
    atual: data.atual || comp,
    porCompetencia: data.porCompetencia,
  });

  return {
    registro: saved.porCompetencia[comp]?.[empId] ?? registro,
    competencias: saved.competencias,
    ultimaCompetencia,
    /** Meses à frente preenchidos para esta empresa (não inclui o mês atual). */
    mesesCronograma: mesesDoCronograma,
  };
}

export function deleteEmpresa(id: string): { id: string } {
  const key = (id || "").trim();
  if (!key) throw new Error("Id da empresa é obrigatório.");
  const data = loadParcelamentos();
  if (data.error) throw new Error(data.error);

  if (!data.empresas.some((e) => e.id === key)) {
    throw new Error("Empresa não encontrada.");
  }

  const empresas = data.empresas.filter((e) => e.id !== key);
  const porCompetencia: ParcelamentosData["porCompetencia"] = {};
  for (const [comp, map] of Object.entries(data.porCompetencia)) {
    const next = { ...map };
    delete next[key];
    porCompetencia[comp] = next;
  }

  persist({ ...data, empresas, porCompetencia });
  return { id: key };
}

/**
 * Remove a empresa só da grade da competência (apaga o registro do mês).
 * A empresa permanece no cadastro.
 */
export function removeRegistroDaGrade(
  competencia: string,
  empresaId: string,
): { empresaId: string; competencia: string } {
  const comp = (competencia || "").trim();
  const empId = (empresaId || "").trim();
  if (!isValidCompetencia(comp)) throw new Error("Competência inválida.");
  if (!empId) throw new Error("Id da empresa é obrigatório.");

  const data = loadParcelamentos();
  if (data.error) throw new Error(data.error);
  if (!data.empresas.some((e) => e.id === empId)) {
    throw new Error("Empresa não encontrada.");
  }

  const month = { ...(data.porCompetencia[comp] ?? {}) };
  if (!(empId in month)) {
    throw new Error("Registro não encontrado nesta competência.");
  }
  delete month[empId];

  persist({
    ...data,
    porCompetencia: {
      ...data.porCompetencia,
      [comp]: month,
    },
  });

  return { empresaId: empId, competencia: comp };
}

export function gerarCompetencia(de: string, para: string): ParcelamentosData {
  const from = (de || "").trim();
  const to = (para || "").trim();
  if (!isValidCompetencia(from) || !isValidCompetencia(to)) {
    throw new Error("Competências inválidas (use MM-YYYY).");
  }
  if (from === to) throw new Error("A nova competência deve ser diferente da origem.");

  const data = loadParcelamentos();
  if (data.error) throw new Error(data.error);
  if (!data.competencias.includes(from) && !data.porCompetencia[from]) {
    throw new Error(`Competência de origem ${from} não encontrada.`);
  }
  if (data.competencias.includes(to) || data.porCompetencia[to]) {
    throw new Error(`Competência ${to} já existe.`);
  }

  // Mês novo começa vazio; empresas entram ao salvar Total + Parcela atual.
  const novoMap: Record<string, CompetenciaRegistro> = {};

  const competencias = sortCompetencias([...data.competencias, to]);
  return persist({
    ...data,
    competencias,
    atual: to,
    porCompetencia: {
      ...data.porCompetencia,
      [to]: novoMap,
    },
  });
}
