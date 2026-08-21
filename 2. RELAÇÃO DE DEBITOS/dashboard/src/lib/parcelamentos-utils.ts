import type {
  CompetenciaRegistro,
  EmpresaParcelamento,
  ParcelamentoStatus,
  ParcelamentoTipo,
} from "@/lib/types";

export const PARCELAMENTO_STATUS_LABELS: Record<ParcelamentoStatus, string> = {
  ok: "OK",
  saiu: "Saiu",
  cancelado: "Cancelado",
  atencao: "Atenção",
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
  "ok",
  "atencao",
  "saiu",
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
  ok: { argb: "FFC6EFCE", fontArgb: "FF006100" },
  saiu: { argb: "FFD9D9D9", fontArgb: "FF595959" },
  cancelado: { argb: "FFFFC7CE", fontArgb: "FF9C0006" },
  atencao: { argb: "FFFFEB9C", fontArgb: "FF9C5700" },
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

export function isValidCompetencia(value: string): boolean {
  return competenciaToIndex(value) != null;
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

export function calcParcelasEmAberto(
  status: ParcelamentoStatus,
  totalParcelas: number | null | undefined,
  parcelaAtual: number,
): number | null {
  if (status === "cancelado" || status === "saiu") return 0;
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
    value === "ok" ||
    value === "saiu" ||
    value === "cancelado" ||
    value === "atencao"
  );
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
};

export function normalizeRegistro(
  input: RegistroInput,
  fallbackStatus: ParcelamentoStatus = "ok",
): CompetenciaRegistro {
  const status = isParcelamentoStatus(input.status) ? input.status : fallbackStatus;

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

/** Copia status/tipo para nova competência; zera acordo. */
export function cloneRegistroParaNovaCompetencia(
  from: CompetenciaRegistro | undefined,
): CompetenciaRegistro {
  return {
    status: from?.status ?? "ok",
    ...(from?.tipo ? { tipo: from.tipo } : {}),
    totalParcelas: null,
    vencimento: null,
    atualizadoEm: new Date().toISOString(),
  };
}

export type CardView = {
  empresa: EmpresaParcelamento;
  registro: CompetenciaRegistro;
  parcelaAtual: number | null;
  parcelasEmAberto: number | null;
};

export function buildCardView(
  empresa: EmpresaParcelamento,
  registro: CompetenciaRegistro | undefined,
  competencia: string,
): CardView {
  const reg: CompetenciaRegistro = registro ?? {
    status: "ok",
    totalParcelas: null,
    vencimento: null,
  };
  const total = reg.totalParcelas;
  const inicio = reg.inicioCompetencia || competencia;
  const parcelaAtual =
    total != null && total >= 1
      ? calcParcelaAtual(inicio, competencia, total)
      : null;
  const parcelasEmAberto =
    parcelaAtual != null
      ? calcParcelasEmAberto(reg.status, total, parcelaAtual)
      : reg.status === "cancelado" || reg.status === "saiu"
        ? 0
        : null;

  return { empresa, registro: reg, parcelaAtual, parcelasEmAberto };
}
