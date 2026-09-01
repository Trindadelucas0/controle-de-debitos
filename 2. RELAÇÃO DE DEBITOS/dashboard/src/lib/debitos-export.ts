import { ESFERA_LABELS } from "@/lib/analytics";
import { sortCompetencias } from "@/lib/competencia";
import { loadDashboardData } from "@/lib/data";
import { isOmissaoDebito } from "@/lib/format";
import type { DebitoLinha, Empresa, Esfera } from "@/lib/types";

export type DebitoDetalheRow = {
  competencia: string;
  codigo: string;
  empresa: string;
  cnpj: string;
  esfera: string;
  pa: string;
  receita: string;
  situacao: string;
  titulo: string;
  numeroLancamento: string;
  inscricao: string;
  vencimento: string;
  original: number;
  saldo: number;
  multa: number;
  juros: number;
  consolidado: number;
  origem: string;
  arquivo: string;
};

/** Critério do Excel de débitos: inverso do de omissões (sem omissão/INAPTA/irregularidade). */
export function isDebitoExportavel(row: {
  situacao?: string;
  titulo?: string;
}): boolean {
  return !isOmissaoDebito(row);
}

function paSortKey(pa: string): [number, number, string] {
  const up = pa.toUpperCase().trim();
  const m = up.match(/^([A-Z]{3})\/(\d{4})$/);
  if (m) {
    const meses: Record<string, number> = {
      JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
      JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
    };
    return [Number(m[2]), meses[m[1]] ?? 99, pa];
  }
  const y = up.match(/^(\d{4})$/);
  if (y) return [Number(y[1]), 0, pa];
  return [9999, 99, pa];
}

function codigoEmpresa(emp: Empresa): string {
  return emp.codigo || emp.codigos?.[0] || "";
}

function inferEsferaDebito(debito: DebitoLinha): Esfera | null {
  if (debito.esfera) return debito.esfera;
  const origem = (debito.origem || "").toUpperCase();
  if (origem.includes("ECAC") || origem.includes("FEDERAL")) return "federal";
  if (origem.includes("AGENCI") || origem.includes("ESTADUAL")) return "estadual";
  if (origem.includes("MUNICIP") || origem.includes("PREFEITURA")) return "municipal";
  return null;
}

function inferEsferaArquivo(arquivo: string): Esfera | null {
  const upper = (arquivo || "").toUpperCase();
  if (upper.includes("ECAC")) return "federal";
  if (upper.includes("AGENCIANET") || upper.includes("AGENCI")) return "estadual";
  if (
    upper.includes("MUNICIP") ||
    upper.includes("PREFEITURA") ||
    upper.includes("IPTU") ||
    upper.includes("ISSQN") ||
    upper.includes("CCM") ||
    upper.includes("NFSE")
  ) {
    return "municipal";
  }
  return null;
}

function resolveEsferaLabel(debito: DebitoLinha): string {
  const esfera =
    debito.esfera ?? inferEsferaDebito(debito) ?? inferEsferaArquivo(debito.arquivo);
  return esfera ? ESFERA_LABELS[esfera] : "";
}

/** Coleta todos os débitos monetários de todos os snapshots do painel. */
export function collectDebitosDetalhe(): {
  rows: DebitoDetalheRow[];
  error?: string;
} {
  const data = loadDashboardData();
  if (data.dataError) {
    return { rows: [], error: data.dataError };
  }

  const snapshots = data.snapshots ?? {};
  let competencias = Object.keys(snapshots);
  if (!competencias.length && (data.empresas?.length || data.atual)) {
    competencias = [data.atual || data.competencia || "sem-competencia"];
  }
  competencias = sortCompetencias(competencias);

  const rows: DebitoDetalheRow[] = [];

  for (const competencia of competencias) {
    const empresas: Empresa[] =
      snapshots[competencia]?.empresas ??
      (competencia === (data.atual || data.competencia) ? data.empresas : []) ??
      [];

    for (const emp of empresas) {
      const debitos: DebitoLinha[] = emp.debitos ?? [];
      for (const d of debitos) {
        if (!isDebitoExportavel(d)) continue;
        rows.push({
          competencia,
          codigo: d.codigo || codigoEmpresa(emp),
          empresa: emp.nome || "",
          cnpj: emp.cnpj || "",
          esfera: resolveEsferaLabel(d),
          pa: d.pa || "",
          receita: d.receita || "",
          situacao: d.situacao || "",
          titulo: d.titulo || "",
          numeroLancamento: d.numero_lancamento || "",
          inscricao: d.inscricao || "",
          vencimento: d.vencimento || "",
          original: d.original ?? 0,
          saldo: d.saldo ?? 0,
          multa: d.multa ?? 0,
          juros: d.juros ?? 0,
          consolidado: d.consolidado ?? 0,
          origem: String(d.origem || ""),
          arquivo: d.arquivo || "",
        });
      }
    }
  }

  rows.sort((a, b) => {
    if (a.competencia !== b.competencia) return a.competencia.localeCompare(b.competencia);
    if (a.empresa !== b.empresa) return a.empresa.localeCompare(b.empresa);
    if (a.esfera !== b.esfera) return a.esfera.localeCompare(b.esfera);
    const ta = (a.titulo || "").toUpperCase();
    const tb = (b.titulo || "").toUpperCase();
    if (ta !== tb) return ta.localeCompare(tb);
    const [ya, ma, pa] = paSortKey(a.pa);
    const [yb, mb, pb] = paSortKey(b.pa);
    if (ya !== yb) return ya - yb;
    if (ma !== mb) return ma - mb;
    return pa.localeCompare(pb);
  });

  return { rows };
}
