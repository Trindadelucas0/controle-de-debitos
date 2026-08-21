import type {
  CompetenciaRegistro,
  EmpresaParcelamento,
  ParcelamentoStatus,
  ParcelamentoTipo,
} from "@/lib/types";

export const PARCELAMENTO_STATUS_DEFAULT: ParcelamentoStatus = "ativo";

export const PARCELAMENTO_STATUS_LABELS: Record<ParcelamentoStatus, string> = {
  ativo: "Ativo",
  encerrado: "Encerrado",
  saiu: "Saiu da contabilidade",
  erro_emissao: "Erro na emissão",
  cancelado: "Cancelado por falta de pagamento",
};

export const PARCELAMENTO_TIPO_LABELS: Record<ParcelamentoTipo, string> = {
  municipal: "Parcelamento Municipal",
  estadual: "Parcelamento Estadual",
  pgfn: "Parcelamento PGFN",
  sn: "Parcelamento SN",
  sn_pert: "Parcelamento SN PERT",
  outro: "Outro",
};

export const PARCELAMENTO_STATUS_OPTIONS: ParcelamentoStatus[] = [
  "ativo",
  "encerrado",
  "saiu",
  "erro_emissao",
  "cancelado",
];

export const PARCELAMENTO_TIPO_OPTIONS: ParcelamentoTipo[] = [
  "municipal",
  "estadual",
  "pgfn",
  "sn",
  "sn_pert",
  "outro",
];

/** Cores de linha no Excel (ARGB). */
export const STATUS_EXCEL_COLORS: Record<
  ParcelamentoStatus,
  { argb: string; fontArgb: string }
> = {
  ativo: { argb: "FFC6EFCE", fontArgb: "FF006100" },
  encerrado: { argb: "FFBDD7EE", fontArgb: "FF1F4E79" },
  saiu: { argb: "FFD9D9D9", fontArgb: "FF595959" },
  erro_emissao: { argb: "FFFFEB9C", fontArgb: "FF9C5700" },
  cancelado: { argb: "FFFFC7CE", fontArgb: "FF9C0006" },
};

export function digitsCnpj(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

export function padCnpj14(value: string | null | undefined): string {
  const d = digitsCnpj(value);
  if (!d) return "";
  if (d.length >= 14) return d.slice(0, 14);
  return d.padStart(14, "0");
}

export function competenciaToIndex(competencia: string): number | null {
  const match = /^(\d{2})-(\d{4})$/.exec((competencia || "").trim());
  if (!match) return null;
  const month = Number(match[1]);
  const year = Number(match[2]);
  if (!Number.isFinite(month) || !Number.isFinite(year) || month < 1 || month > 12) {
    return null;
  }
  return year * 12 + (month - 1);
}

export function indexToCompetencia(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(month).padStart(2, "0")}-${year}`;
}

export function isValidCompetencia(value: string): boolean {
  return competenciaToIndex(value) != null;
}

/** Limite de segurança para total de parcelas / geração de meses. */
export const MAX_TOTAL_PARCELAS = 120;

/**
 * Soma (ou subtrai) meses a uma competência MM-YYYY.
 * Retorna "" se a competência for inválida.
 */
export function addMesesCompetencia(competencia: string, delta: number): string {
  const idx = competenciaToIndex(competencia);
  if (idx == null || !Number.isFinite(delta)) return "";
  return indexToCompetencia(idx + Math.trunc(delta));
}

/**
 * Início do acordo: competência atual menos (parcelaAtual - 1) meses.
 */
export function calcInicioCompetencia(
  competenciaAtual: string,
  parcelaAtual: number,
): string {
  const p = Math.floor(Number(parcelaAtual));
  if (!Number.isFinite(p) || p < 1) return "";
  return addMesesCompetencia(competenciaAtual, -(p - 1));
}

/**
 * Último mês de pagamento: competência atual mais (total - parcelaAtual) meses.
 */
export function calcUltimaCompetencia(
  competenciaAtual: string,
  parcelaAtual: number,
  totalParcelas: number,
): string {
  const p = Math.floor(Number(parcelaAtual));
  const t = Math.floor(Number(totalParcelas));
  if (!Number.isFinite(p) || !Number.isFinite(t) || p < 1 || t < 1 || p > t) {
    return "";
  }
  return addMesesCompetencia(competenciaAtual, t - p);
}

export function parseParcelaPositiva(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const n =
    typeof value === "string"
      ? Number(String(value).replace(/\D/g, ""))
      : Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00`);
  return !Number.isNaN(d.getTime());
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function mesesEntre(inicio: string, fim: string): number {
  const a = competenciaToIndex(inicio);
  const b = competenciaToIndex(fim);
  if (a == null || b == null) return 0;
  return b - a;
}

export function calcParcelaAtual(
  inicioCompetencia: string,
  competenciaSelecionada: string,
  totalParcelas: number,
): number {
  const total = Math.max(1, Math.floor(totalParcelas) || 1);
  const diff = mesesEntre(inicioCompetencia, competenciaSelecionada);
  return clamp(1 + diff, 1, total);
}

export function isParcelamentoSemAberto(status: ParcelamentoStatus): boolean {
  return status === "cancelado" || status === "saiu" || status === "encerrado";
}

/**
 * Empresa aparece na grade do mês se tem acordo válido cobrindo a competência
 * (total preenchido, não encerrada/saiu/cancelada, e o mês está no intervalo do cronograma).
 */
export function empresaTemParcelamentoNoMes(
  registro: CompetenciaRegistro | undefined | null,
  competencia: string,
): boolean {
  if (!registro) return false;
  const status =
    parseParcelamentoStatus(registro.status) ?? PARCELAMENTO_STATUS_DEFAULT;
  if (isParcelamentoSemAberto(status)) return false;

  const total = registro.totalParcelas;
  if (total == null || !Number.isFinite(total) || total < 1) return false;
  if (!isValidCompetencia(competencia)) return false;

  const inicio = registro.inicioCompetencia || competencia;
  if (!isValidCompetencia(inicio)) return false;

  const diff = mesesEntre(inicio, competencia);
  // Mês antes do início ou depois da última parcela → fora do cronograma.
  if (diff < 0 || diff >= Math.floor(total)) return false;
  return true;
}

export function calcParcelasEmAberto(
  status: ParcelamentoStatus,
  totalParcelas: number | null | undefined,
  parcelaAtual: number,
): number | null {
  if (isParcelamentoSemAberto(status)) return 0;
  if (totalParcelas == null || !Number.isFinite(totalParcelas) || totalParcelas < 1) {
    return null;
  }
  return Math.max(0, Math.floor(totalParcelas) - parcelaAtual + 1);
}

export function currentCompetenciaId(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${month}-${year}`;
}

export function isParcelamentoStatus(value: unknown): value is ParcelamentoStatus {
  return (
    value === "ativo" ||
    value === "encerrado" ||
    value === "saiu" ||
    value === "erro_emissao" ||
    value === "cancelado"
  );
}

const LEGACY_PARCELAMENTO_STATUS: Record<string, ParcelamentoStatus> = {
  ok: "ativo",
  atencao: "erro_emissao",
};

/** Aceita situação atual e valores antigos (ok/atenção). */
export function parseParcelamentoStatus(value: unknown): ParcelamentoStatus | null {
  if (typeof value !== "string") return null;
  if (isParcelamentoStatus(value)) return value;
  return LEGACY_PARCELAMENTO_STATUS[value] ?? null;
}

export function isParcelamentoTipo(value: unknown): value is ParcelamentoTipo {
  return (
    value === "municipal" ||
    value === "estadual" ||
    value === "pgfn" ||
    value === "sn" ||
    value === "sn_pert" ||
    value === "outro"
  );
}

export function formatVencimentoBr(iso: string | null | undefined): string {
  if (!iso || !isValidIsoDate(iso)) return iso || "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Tipos cujo vencimento é o último dia útil do mês da competência. */
export const TIPOS_VENCIMENTO_AUTOMATICO: ReadonlySet<ParcelamentoTipo> = new Set([
  "pgfn",
  "sn",
  "sn_pert",
]);

/** Checkboxes do formulário Nova empresa (sem "outro"). */
export const PARCELAMENTO_TIPO_CHECKBOX_OPTIONS: ParcelamentoTipo[] = [
  "pgfn",
  "sn",
  "sn_pert",
  "municipal",
  "estadual",
];

export function isTipoVencimentoAutomatico(
  tipo: string | null | undefined,
): tipo is "pgfn" | "sn" | "sn_pert" {
  return tipo === "pgfn" || tipo === "sn" || tipo === "sn_pert";
}

function toIsoDateLocal(year: number, month1to12: number, day: number): string {
  const y = String(year);
  const m = String(month1to12).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Algoritmo de Meeus/Jones/Butcher — Páscoa no calendário gregoriano. */
function pascoaGregoriana(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function addDaysIso(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return toIsoDateLocal(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Feriados nacionais (fixos + móveis do calendário bancário). */
export function feriadosNacionaisDoAno(year: number): Set<string> {
  const set = new Set<string>();
  const fixos: Array<[number, number]> = [
    [1, 1], // Confraternização Universal
    [4, 21], // Tiradentes
    [5, 1], // Dia do Trabalho
    [9, 7], // Independência
    [10, 12], // Nossa Senhora Aparecida
    [11, 2], // Finados
    [11, 15], // Proclamação da República
    [11, 20], // Consciência Negra
    [12, 25], // Natal
  ];
  for (const [month, day] of fixos) {
    set.add(toIsoDateLocal(year, month, day));
  }

  const pascoa = pascoaGregoriana(year);
  const pascoaIso = toIsoDateLocal(year, pascoa.month, pascoa.day);
  set.add(addDaysIso(pascoaIso, -48)); // Carnaval (segunda)
  set.add(addDaysIso(pascoaIso, -47)); // Carnaval (terça)
  set.add(addDaysIso(pascoaIso, -2)); // Sexta-feira Santa
  set.add(addDaysIso(pascoaIso, 60)); // Corpus Christi

  return set;
}

export function isDiaUtil(iso: string, feriados?: Set<string>): boolean {
  if (!isValidIsoDate(iso)) return false;
  const d = new Date(`${iso}T12:00:00`);
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  const year = d.getFullYear();
  const set = feriados ?? feriadosNacionaisDoAno(year);
  return !set.has(iso);
}

/**
 * Último dia útil do mês da competência (MM-YYYY).
 * Pula sábado, domingo e feriados nacionais.
 */
export function ultimoDiaUtilDoMes(competencia: string): string {
  const match = /^(\d{2})-(\d{4})$/.exec((competencia || "").trim());
  if (!match) return "";
  const month = Number(match[1]);
  const year = Number(match[2]);
  if (!Number.isFinite(month) || !Number.isFinite(year) || month < 1 || month > 12) {
    return "";
  }

  const lastDay = new Date(year, month, 0).getDate();
  const feriados = feriadosNacionaisDoAno(year);
  for (let day = lastDay; day >= 1; day -= 1) {
    const iso = toIsoDateLocal(year, month, day);
    if (isDiaUtil(iso, feriados)) return iso;
  }
  return "";
}

/**
 * Vencimento sugerido pelo tipo: ISO para PGFN/SN/SN PERT;
 * string vazia para municipal/estadual/outro/vazio.
 */
export function vencimentoAutomaticoPorTipo(
  tipo: string | null | undefined,
  competencia: string,
): string {
  if (!isTipoVencimentoAutomatico(tipo)) return "";
  return ultimoDiaUtilDoMes(competencia);
}

export function sortEmpresasParcelamento(
  items: EmpresaParcelamento[],
): EmpresaParcelamento[] {
  return [...items].sort((a, b) => {
    const byName = a.empresa.localeCompare(b.empresa, "pt-BR");
    if (byName !== 0) return byName;
    return a.cnpj.localeCompare(b.cnpj);
  });
}

export type EmpresaInput = {
  id?: string;
  cod?: string;
  empresa?: string;
  grupo?: string;
  cnpj?: string;
  numeroParcelamento?: string;
};

export function normalizeEmpresa(
  input: EmpresaInput,
  opts?: { id?: string },
): EmpresaParcelamento {
  const empresa = String(input.empresa ?? "").trim();
  if (!empresa) throw new Error("Empresa é obrigatória.");

  const cnpj = padCnpj14(input.cnpj);
  if (cnpj.length !== 14) throw new Error("CNPJ deve ter 14 dígitos.");

  const cod = String(input.cod ?? "").trim() || undefined;
  const grupo = String(input.grupo ?? "").trim() || undefined;
  const numeroParcelamento =
    String(input.numeroParcelamento ?? "").trim() || undefined;
  const id =
    opts?.id ||
    (typeof input.id === "string" && input.id.trim()
      ? input.id.trim()
      : crypto.randomUUID());

  return {
    id,
    ...(cod ? { cod } : {}),
    empresa,
    ...(grupo ? { grupo } : {}),
    cnpj,
    ...(numeroParcelamento ? { numeroParcelamento } : {}),
  };
}

export type RegistroInput = Partial<
  Omit<CompetenciaRegistro, "totalParcelas" | "tipo">
> & {
  tipo?: ParcelamentoTipo | "" | null;
  totalParcelas?: number | string | null;
  /** Informada na UI; o servidor deriva inicioCompetencia. */
  parcelaAtual?: number | string | null;
};

export function normalizeRegistro(
  input: RegistroInput,
  fallbackStatus: ParcelamentoStatus = PARCELAMENTO_STATUS_DEFAULT,
): CompetenciaRegistro {
  const status = parseParcelamentoStatus(input.status) ?? fallbackStatus;

  let tipo: ParcelamentoTipo | undefined;
  if (input.tipo === "" || input.tipo == null) tipo = undefined;
  else if (isParcelamentoTipo(input.tipo)) tipo = input.tipo;
  else throw new Error("Tipo de parcelamento inválido.");

  let totalParcelas: number | null | undefined = undefined;
  if (input.totalParcelas === "" || input.totalParcelas == null) {
    totalParcelas = null;
  } else {
    const n =
      typeof input.totalParcelas === "string"
        ? Number(String(input.totalParcelas).replace(/\D/g, ""))
        : Number(input.totalParcelas);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error("Total de parcelas deve ser no mínimo 1.");
    }
    totalParcelas = Math.floor(n);
  }

  let vencimento: string | null | undefined = undefined;
  const vencRaw = String(input.vencimento ?? "").trim();
  if (!vencRaw) {
    vencimento = null;
  } else if (!isValidIsoDate(vencRaw)) {
    throw new Error("Vencimento inválido (use AAAA-MM-DD).");
  } else {
    vencimento = vencRaw;
  }

  const observacao = String(input.observacao ?? "").trim() || undefined;

  let inicioCompetencia: string | undefined;
  const inicioRaw = String(input.inicioCompetencia ?? "").trim();
  if (inicioRaw) {
    if (!isValidCompetencia(inicioRaw)) {
      throw new Error("Início da competência inválido (use MM-YYYY).");
    }
    inicioCompetencia = inicioRaw;
  }

  return {
    status,
    ...(tipo ? { tipo } : {}),
    totalParcelas: totalParcelas ?? null,
    vencimento: vencimento ?? null,
    ...(inicioCompetencia ? { inicioCompetencia } : {}),
    ...(observacao ? { observacao } : {}),
    atualizadoEm: new Date().toISOString(),
  };
}

/**
 * Copia situação/tipo para nova competência; zera total.
 * Se o tipo tiver vencimento automático, preenche o último dia útil do mês novo.
 */
export function cloneRegistroParaNovaCompetencia(
  from: CompetenciaRegistro | undefined,
  competenciaNova?: string,
): CompetenciaRegistro {
  const tipo = from?.tipo;
  const vencAuto =
    tipo && competenciaNova
      ? vencimentoAutomaticoPorTipo(tipo, competenciaNova)
      : "";
  return {
    status: parseParcelamentoStatus(from?.status) ?? PARCELAMENTO_STATUS_DEFAULT,
    ...(tipo ? { tipo } : {}),
    totalParcelas: null,
    vencimento: vencAuto || null,
    atualizadoEm: new Date().toISOString(),
  };
}

export type CardView = {
  empresa: EmpresaParcelamento;
  registro: CompetenciaRegistro;
  parcelaAtual: number | null;
  parcelasEmAberto: number | null;
  /** Último mês de pagamento (MM-YYYY), se total e parcela forem conhecidos. */
  ultimaCompetencia: string | null;
};

export function buildCardView(
  empresa: EmpresaParcelamento,
  registro: CompetenciaRegistro | undefined,
  competencia: string,
  opts?: { parcelaAtualOverride?: number | null },
): CardView {
  const parsedStatus =
    parseParcelamentoStatus(registro?.status) ?? PARCELAMENTO_STATUS_DEFAULT;
  const reg: CompetenciaRegistro = registro
    ? { ...registro, status: parsedStatus }
    : {
        status: parsedStatus,
        totalParcelas: null,
        vencimento: null,
      };
  const total = reg.totalParcelas;
  const inicio = reg.inicioCompetencia || competencia;
  let parcelaAtual: number | null = null;
  if (
    opts?.parcelaAtualOverride != null &&
    Number.isFinite(opts.parcelaAtualOverride) &&
    opts.parcelaAtualOverride >= 1
  ) {
    parcelaAtual =
      total != null && total >= 1
        ? clamp(Math.floor(opts.parcelaAtualOverride), 1, total)
        : Math.floor(opts.parcelaAtualOverride);
  } else if (total != null && total >= 1) {
    parcelaAtual = calcParcelaAtual(inicio, competencia, total);
  }

  const parcelasEmAberto =
    parcelaAtual != null
      ? calcParcelasEmAberto(reg.status, total, parcelaAtual)
      : isParcelamentoSemAberto(reg.status)
        ? 0
        : null;

  const ultimaCompetencia =
    total != null && total >= 1 && parcelaAtual != null
      ? calcUltimaCompetencia(competencia, parcelaAtual, total) || null
      : null;

  return {
    empresa,
    registro: reg,
    parcelaAtual,
    parcelasEmAberto,
    ultimaCompetencia,
  };
}
