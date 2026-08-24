export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
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
  const key = (titulo || "").trim();
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
