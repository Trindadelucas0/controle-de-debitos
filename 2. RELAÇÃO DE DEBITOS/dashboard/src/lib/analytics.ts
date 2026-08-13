import { formatTituloPendencia } from "@/lib/format";
import type { DebitoLinha, Empresa, Esfera, Totais, TotaisGerais } from "@/lib/types";

export const ESFERA_COLORS: Record<Esfera, string> = {
  federal: "#2563eb",
  estadual: "#0d9488",
  municipal: "#ea580c",
};

export const ESFERA_LABELS: Record<Esfera, string> = {
  federal: "Federal",
  estadual: "Estadual",
  municipal: "Municipal",
};

/** Fonte oficial de cada esfera (regra de negócio). */
export const ESFERA_FONTES: Record<Esfera, string> = {
  federal: "ECAC · Receita Federal",
  estadual: "Agenci@Net",
  municipal: "Relatório da Prefeitura",
};

const TITULO_COLORS: Record<string, string> = {
  "DEBITO (SIEF)": "#d97706",
  "DEBITO SUSPENSO": "#0d9488",
  "OMISSAO DE DCTFWEB": "#dc2626",
  "OMISSAO DE DCTF": "#b91c1c",
  "OMISSAO DE DIRF": "#9f1239",
  "DEBITO (SIDA)": "#c2410c",
  "INSCRICAO SUSPENSA": "#0891b2",
  "PARCELAMENTO SUSPENSO": "#7c3aed",
  "PARCELAMENTO (PARCSN/PARCMEI)": "#6366f1",
  PARCELAMENTO: "#4f46e5",
  "PROCESSO FISCAL (SIEF)": "#2563eb",
  "INSCRICAO (SIDA)": "#ea580c",
  "DIVERGENCIA GFIP X GPS": "#ca8a04",
  "INSCRICAO (SISTEMA DIVIDA)": "#64748b",
};

const TITULO_FALLBACK_COLORS = ["#2563eb", "#0d9488", "#ea580c", "#7c3aed", "#db2777", "#0891b2"];

const EMPTY: Totais = {
  original: 0,
  saldo: 0,
  multa: 0,
  juros: 0,
  consolidado: 0,
};

/** Empresas com documento na esfera (visão filtrada do portfólio). */
export function empresasNaEsfera(empresas: Empresa[], esfera: Esfera): Empresa[] {
  return empresas.filter((empresa) => (empresa.esferas?.[esfera]?.qtdDocs ?? 0) > 0);
}

function totaisDaEmpresa(empresa: Empresa, esfera?: Esfera | null): Totais {
  if (!esfera) return empresa.totais;
  return empresa.esferas?.[esfera]?.totais ?? emptyTotais();
}

function statusDaEmpresa(
  empresa: Empresa,
  esfera?: Esfera | null,
): "pendencia" | "regular" | "outro" {
  if (!esfera) {
    return empresa.status === "pendencia" ? "pendencia" : "regular";
  }
  const status = empresa.esferas?.[esfera]?.status;
  if (status === "pendencia") return "pendencia";
  if (status === "regular") return "regular";
  return "outro";
}

/** KPIs do dashboard — globais ou recortados por esfera. */
export function buildTotaisGerais(
  empresas: Empresa[],
  esfera?: Esfera | null,
): TotaisGerais {
  const base = esfera ? empresasNaEsfera(empresas, esfera) : empresas;
  const pendentes = base.filter((e) => statusDaEmpresa(e, esfera) === "pendencia");
  const regulares = base.filter((e) => statusDaEmpresa(e, esfera) === "regular");

  const saldo = round2(base.reduce((sum, e) => sum + totaisDaEmpresa(e, esfera).saldo, 0));
  const consolidado = round2(
    base.reduce((sum, e) => sum + totaisDaEmpresa(e, esfera).consolidado, 0),
  );

  const docsFor = (key: Esfera) =>
    empresas.reduce((sum, e) => sum + (e.esferas?.[key]?.qtdDocs ?? 0), 0);

  return {
    empresas: base.length,
    com_pendencia: pendentes.length,
    regulares: regulares.length,
    saldo,
    consolidado,
    docs_federal: esfera ? (esfera === "federal" ? docsFor("federal") : 0) : docsFor("federal"),
    docs_estadual: esfera ? (esfera === "estadual" ? docsFor("estadual") : 0) : docsFor("estadual"),
    docs_municipal: esfera
      ? esfera === "municipal"
        ? docsFor("municipal")
        : 0
      : docsFor("municipal"),
  };
}

export function buildPortfolioAnalytics(empresas: Empresa[], esfera?: Esfera | null) {
  const base = esfera ? empresasNaEsfera(empresas, esfera) : empresas;
  const esferasChart: Esfera[] = esfera
    ? [esfera]
    : (["federal", "estadual", "municipal"] as Esfera[]);

  const porEsfera = esferasChart.map((key) => {
    const consolidado = empresas.reduce(
      (sum, empresa) => sum + (empresa.esferas?.[key]?.totais?.consolidado ?? 0),
      0,
    );
    const saldo = empresas.reduce(
      (sum, empresa) => sum + (empresa.esferas?.[key]?.totais?.saldo ?? 0),
      0,
    );
    const docs = empresas.reduce(
      (sum, empresa) => sum + (empresa.esferas?.[key]?.qtdDocs ?? 0),
      0,
    );
    return {
      esfera: key,
      label: ESFERA_LABELS[key],
      consolidado: round2(consolidado),
      saldo: round2(saldo),
      docs,
      fill: ESFERA_COLORS[key],
    };
  });

  const composicao = (() => {
    const totals = base.reduce(
      (acc, empresa) => {
        const t = totaisDaEmpresa(empresa, esfera);
        acc.saldo += t.saldo;
        acc.multa += t.multa;
        acc.juros += t.juros;
        return acc;
      },
      { saldo: 0, multa: 0, juros: 0 },
    );
    return [
      { name: "Saldo", value: round2(totals.saldo), fill: "#2563eb" },
      { name: "Multa", value: round2(totals.multa), fill: "#d97706" },
      { name: "Juros", value: round2(totals.juros), fill: "#dc2626" },
    ].filter((item) => item.value > 0);
  })();

  const pendentes = base.filter((e) => statusDaEmpresa(e, esfera) === "pendencia");
  const regulares = base.filter((e) => statusDaEmpresa(e, esfera) === "regular");

  const statusDonut = [
    {
      name: "Pendência",
      value: pendentes.length,
      saldo: round2(pendentes.reduce((s, e) => s + totaisDaEmpresa(e, esfera).saldo, 0)),
      consolidado: round2(
        pendentes.reduce((s, e) => s + totaisDaEmpresa(e, esfera).consolidado, 0),
      ),
      fill: "#d97706",
    },
    {
      name: "Regular",
      value: regulares.length,
      saldo: 0,
      consolidado: 0,
      fill: "#059669",
    },
  ];

  const topEmpresas = [...base]
    .map((e) => {
      const t = totaisDaEmpresa(e, esfera);
      const status = statusDaEmpresa(e, esfera);
      return {
        id: e.id,
        nome: truncate(e.nome, 28),
        nomeCompleto: e.nome,
        consolidado: t.consolidado,
        saldo: t.saldo,
        status: status === "outro" ? e.status : status,
      };
    })
    .filter((e) => e.consolidado > 0 || e.status === "pendencia")
    .sort((a, b) => b.consolidado - a.consolidado)
    .slice(0, 10);

  const allDebitos = base.flatMap((empresa) =>
    esfera
      ? empresa.debitos.filter((d) => (d.esfera ?? inferEsferaDebito(d)) === esfera)
      : empresa.debitos,
  );
  const porTitulo = aggregatePorTitulo(allDebitos);

  return { porEsfera, composicao, statusDonut, topEmpresas, porTitulo };
}

function inferEsferaDebito(debito: DebitoLinha): Esfera | null {
  if (debito.esfera) return debito.esfera;
  const origem = (debito.origem || "").toUpperCase();
  if (origem.includes("ECAC") || origem.includes("FEDERAL")) return "federal";
  if (origem.includes("AGENCI") || origem.includes("ESTADUAL")) return "estadual";
  if (origem.includes("MUNICIP") || origem.includes("PREFEITURA")) return "municipal";
  return null;
}

export type ComposicaoSlice = {
  name: string;
  value: number;
  fill: string;
};

function composicaoFromTotais(totais: Totais): ComposicaoSlice[] {
  return [
    { name: "Saldo", value: round2(totais.saldo), fill: "#2563eb" },
    { name: "Multa", value: round2(totais.multa), fill: "#d97706" },
    { name: "Juros", value: round2(totais.juros), fill: "#dc2626" },
  ].filter((item) => item.value > 0);
}

/** Débitos da empresa filtrados por esfera (com fallback por origem/arquivo). */
export function debitosDaEsfera(empresa: Empresa, esfera: Esfera): DebitoLinha[] {
  return empresa.debitos.filter((item) => {
    const inferred =
      item.esfera ??
      inferEsferaDebito(item) ??
      inferEsferaArquivo(item.arquivo);
    return inferred === esfera;
  });
}

export type DebitoGrupo = {
  titulo: string;
  label: string;
  debitos: DebitoLinha[];
  consolidado: number;
};

export type TituloSlice = {
  titulo: string;
  label: string;
  labelCurto: string;
  consolidado: number;
  qtd: number;
  fill: string;
};

function colorForTitulo(titulo: string, index: number) {
  const key = (titulo || "").trim();
  if (key && TITULO_COLORS[key]) return TITULO_COLORS[key];
  return TITULO_FALLBACK_COLORS[index % TITULO_FALLBACK_COLORS.length];
}

/** Soma Sdo. consol. por título do diagnóstico (labels amigáveis). */
export function aggregatePorTitulo(debitos: DebitoLinha[]): TituloSlice[] {
  return groupDebitosByTitulo(debitos)
    .map((grupo, index) => ({
      titulo: grupo.titulo,
      label: grupo.label,
      labelCurto: truncate(grupo.label, 28),
      consolidado: grupo.consolidado,
      qtd: grupo.debitos.length,
      fill: colorForTitulo(grupo.titulo, index),
    }))
    .filter((item) => item.consolidado > 0)
    .sort((a, b) => b.consolidado - a.consolidado);
}

/** Agrupa lançamentos pela seção do Diagnóstico Fiscal, na ordem de aparição. */
export function groupDebitosByTitulo(debitos: DebitoLinha[]): DebitoGrupo[] {
  const groups: DebitoGrupo[] = [];
  const index = new Map<string, number>();
  for (const row of debitos) {
    const titulo = (row.titulo || "").trim();
    const key = titulo || "__sem_titulo__";
    const existing = index.get(key);
    if (existing === undefined) {
      index.set(key, groups.length);
      groups.push({
        titulo,
        label: formatTituloPendencia(titulo || null),
        debitos: [row],
        consolidado: round2(row.consolidado || 0),
      });
      continue;
    }
    const group = groups[existing];
    group.debitos.push(row);
    group.consolidado = round2(group.consolidado + (row.consolidado || 0));
  }
  return groups;
}

/** Composição saldo/multa/juros de uma esfera da empresa. */
export function buildEsferaComposicao(empresa: Empresa, esfera: Esfera): ComposicaoSlice[] {
  const totais = empresa.esferas?.[esfera]?.totais ?? emptyTotais();
  return composicaoFromTotais(totais);
}

export function buildEmpresaAnalytics(empresa: Empresa) {
  const composicao = composicaoFromTotais(empresa.totais);

  const porEsfera = (["federal", "estadual", "municipal"] as Esfera[]).map((esfera) => {
    const bucket = empresa.esferas?.[esfera];
    return {
      esfera,
      label: ESFERA_LABELS[esfera],
      consolidado: bucket?.totais?.consolidado ?? 0,
      saldo: bucket?.totais?.saldo ?? 0,
      docs: bucket?.qtdDocs ?? 0,
      fill: ESFERA_COLORS[esfera],
    };
  });

  const topReceitas = aggregateReceitas(empresa.debitos).slice(0, 8);
  const porTitulo = aggregatePorTitulo(empresa.debitos);

  return { composicao, porEsfera, topReceitas, porTitulo };
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

function aggregateReceitas(debitos: DebitoLinha[]) {
  const map = new Map<string, number>();
  for (const debito of debitos) {
    map.set(debito.receita, (map.get(debito.receita) ?? 0) + debito.consolidado);
  }
  return [...map.entries()]
    .map(([receita, consolidado]) => ({
      receita: truncate(receita, 30),
      receitaCompleta: receita,
      consolidado: round2(consolidado),
    }))
    .sort((a, b) => b.consolidado - a.consolidado);
}

export function emptyTotais(): Totais {
  return { ...EMPTY };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
