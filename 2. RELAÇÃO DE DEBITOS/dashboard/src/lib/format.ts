export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Remove acentos e lower-case — busca tolerante a "Omissão" vs "OMISSAO". */
export function fold(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Chave canônica de título (remove asterisco decorativo do PDF). */
export function normalizeTituloKey(titulo?: string | null): string {
  return (titulo || "").trim().replace(/\*+$/, "").trim();
}

const TITULO_PENDENCIA_LABELS: Record<string, string> = {
  "OMISSAO DE DCTFWEB": "Pendência · Omissão de DCTFWeb",
  "OMISSAO DE DCTF": "Pendência · Omissão de DCTF",
  "OMISSAO DE DIRF": "Pendência · Omissão de DIRF",
  "OMISSAO DE EFD-CONTRIB": "Pendência · Omissão de EFD-Contrib",
  "OMISSAO DE PGDAS-D": "Pendência · Omissão de PGDAS-D",
  "IRREGULARIDADE CADASTRAL": "Pendência · Irregularidade cadastral",
  "DEBITO (SIEF)": "Pendência · Débito (SIEF)",
  "DEBITO (SIDA)": "Pendência · Débito (SIDA)",
  "DEBITO SUSPENSO": "Débito com exigibilidade suspensa",
  "INSCRICAO SUSPENSA": "Inscrição com exigibilidade suspensa",
  "PARCELAMENTO SUSPENSO": "Parcelamento com exigibilidade suspensa",
  "PARCELAMENTO (PARCSN/PARCMEI)": "Pendência · Parcelamento (PARCSN/PARCMEI)",
  PARCELAMENTO: "Pendência · Parcelamento",
  "PROCESSO FISCAL (SIEF)": "Pendência · Processo Fiscal (SIEF)",
  "INSCRICAO (SIDA)": "Pendência · Inscrição (SIDA)",
  "DIVERGENCIA GFIP X GPS": "Pendência · Divergência GFIP x GPS",
  "INSCRICAO (SISTEMA DIVIDA)": "Pendência · Inscrição (Sistema Dívida)",
};

export function formatTituloPendencia(titulo?: string | null): string {
  const key = normalizeTituloKey(titulo);
  if (!key) return "Lançamentos";
  const mapped = TITULO_PENDENCIA_LABELS[key];
  if (mapped) return mapped;
  if (key.startsWith("OMISSAO DE ")) {
    return `Pendência · Omissão de ${key.slice("OMISSAO DE ".length)}`;
  }
  return `Pendência · ${key}`;
}

/** Espelha o subtotal do relatório: "5 itens · R$ 537,98". */
export function formatItensETotal(qtd: number, consolidado: number): string {
  const itens = qtd === 1 ? "1 item" : `${qtd} itens`;
  if (consolidado > 0) return `${itens} · ${formatBRL(consolidado)}`;
  return itens;
}

/** Resumo do card por título: "3 empresas · 21 itens · R$ …". */
export function formatTituloResumo(
  qtdEmpresas: number,
  qtdItens: number,
  consolidado: number,
): string {
  const empresas = qtdEmpresas === 1 ? "1 empresa" : `${qtdEmpresas} empresas`;
  const itens = qtdItens === 1 ? "1 item" : `${qtdItens} itens`;
  if (consolidado > 0) return `${empresas} · ${itens} · ${formatBRL(consolidado)}`;
  return `${empresas} · ${itens}`;
}

export function isOmissaoDebito(row: { situacao?: string; titulo?: string }): boolean {
  const situacao = (row.situacao || "").toUpperCase();
  const titulo = (row.titulo || "").toUpperCase();
  return (
    situacao === "OMISSAO" ||
    situacao === "INAPTA" ||
    titulo.startsWith("OMISSAO") ||
    titulo === "IRREGULARIDADE CADASTRAL"
  );
}

/** Agenci@Net A VENCER: consulta lista o débito mas sem valor BRL na tela. */
export function isAvencerSemValor(row: {
  situacao?: string;
  consolidado?: number;
  saldo?: number;
  original?: number;
}): boolean {
  const sit = (row.situacao || "").toUpperCase();
  if (!sit.includes("A VENCER")) return false;
  const val = row.consolidado ?? row.saldo ?? row.original ?? 0;
  return Math.abs(val) < 0.01;
}

/** Valor monetário na tabela de débitos (omissão, A VENCER sem BRL, ou BRL). */
export function formatDebitoValor(
  row: {
    situacao?: string;
    titulo?: string;
    consolidado?: number;
    saldo?: number;
    original?: number;
  },
  valor?: number,
): string {
  if (isOmissaoDebito(row)) return "—";
  if (isAvencerSemValor(row)) return "A vencer (sem valor na consulta)";
  const n = valor ?? row.consolidado ?? row.saldo ?? row.original ?? 0;
  return formatBRL(n);
}

export function formatCnpj(cnpj: string | null | undefined): string {
  if (!cnpj) return "—";
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length === 14) {
    return digits.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      "$1.$2.$3/$4-$5",
    );
  }
  return cnpj;
}

/** '8' e '08' são o mesmo código; mostra só a forma com zero à esquerda. */
export function collapseCodigos(codigos: string[] | undefined | null): string[] {
  const best = new Map<number, string>();
  const other: string[] = [];
  for (const raw of codigos ?? []) {
    const code = String(raw || "").trim();
    if (!code) continue;
    if (/^\d+$/.test(code)) {
      const n = Number(code);
      const prev = best.get(n);
      if (!prev || code.length > prev.length) best.set(n, code);
      continue;
    }
    if (!other.includes(code)) other.push(code);
  }
  return [...best.values(), ...other];
}
