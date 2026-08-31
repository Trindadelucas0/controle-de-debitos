import { fold } from "@/lib/format";
import { sortCompetencias } from "@/lib/competencia";
import { loadDashboardData } from "@/lib/data";
import type { DebitoLinha, Empresa } from "@/lib/types";

export type OmissaoDetalheRow = {
  competencia: string;
  codigo: string;
  empresa: string;
  cnpj: string;
  pa: string;
  receita: string;
  situacao: string;
  titulo: string;
  origem: string;
  arquivo: string;
};

/** Critério do Excel de omissões (não inclui INAPTA / irregularidade cadastral). */
export function isOmissaoExportavel(row: {
  situacao?: string;
  titulo?: string;
}): boolean {
  const situacao = fold(row.situacao).toUpperCase();
  const titulo = fold(row.titulo).toUpperCase();
  return situacao === "OMISSAO" || titulo.startsWith("OMISSAO");
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

/** Coleta todas as omissões de todos os snapshots do painel. */
export function collectOmissoesDetalhe(): {
  rows: OmissaoDetalheRow[];
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

  const rows: OmissaoDetalheRow[] = [];

  for (const competencia of competencias) {
    const empresas: Empresa[] =
      snapshots[competencia]?.empresas ??
      (competencia === (data.atual || data.competencia) ? data.empresas : []) ??
      [];

    for (const emp of empresas) {
      const debitos: DebitoLinha[] = emp.debitos ?? [];
      for (const d of debitos) {
        if (!isOmissaoExportavel(d)) continue;
        rows.push({
          competencia,
          codigo: codigoEmpresa(emp),
          empresa: emp.nome || "",
          cnpj: emp.cnpj || "",
          pa: d.pa || "",
          receita: d.receita || "",
          situacao: d.situacao || "",
          titulo: d.titulo || "",
          origem: String(d.origem || ""),
          arquivo: d.arquivo || "",
        });
      }
    }
  }

  rows.sort((a, b) => {
    if (a.competencia !== b.competencia) return a.competencia.localeCompare(b.competencia);
    const ta = (a.titulo || "").toUpperCase();
    const tb = (b.titulo || "").toUpperCase();
    if (ta !== tb) return ta.localeCompare(tb);
    if (a.empresa !== b.empresa) return a.empresa.localeCompare(b.empresa);
    const [ya, ma, pa] = paSortKey(a.pa);
    const [yb, mb, pb] = paSortKey(b.pa);
    if (ya !== yb) return ya - yb;
    if (ma !== mb) return ma - mb;
    return pa.localeCompare(pb);
  });

  return { rows };
}
