/** Paleta Êxito compartilhada (UI CSS vars + react-pdf hex). */

export const EXITO = {
  surface: "#f9f9ff",
  surfaceLow: "#f0f3ff",
  surfaceContainer: "#e7eeff",
  surfaceHighest: "#d7e3fd",
  card: "#ffffff",
  ink: "#101c2f",
  muted: "#536259",
  line: "#d7e3fd",
  green: "#006b2b",
  greenHover: "#008738",
  greenSoft: "#d6e7db",
  greenFixed: "#88fb9a",
  greenFixedDim: "#6cdd81",
  greenDeep: "#00531f",
  danger: "#b42318",
  dangerBg: "#fef3f2",
  dangerBorder: "#fecdca",
  error: "#ba1a1a",
  tertiary: "#b22217",
  tertiaryContainer: "#d53c2d",
  onErrorContainer: "#93000a",
  outline: "#6e7a6c",
  outlineVariant: "#bdcaba",
  secondaryFixedDim: "#bacbbf",
  onSecondaryFixedVariant: "#3b4a42",
  onSurfaceVariant: "#3e4a3e",
  inverseSurface: "#253145",
  secondaryBorder: "#d1d5db",
} as const;

export const ESFERA_COLORS_HEX = {
  federal: EXITO.green,
  estadual: EXITO.greenFixedDim,
  municipal: EXITO.muted,
} as const;

/** Cores de títulos de pendência (gráficos / PDF). */
export const TITULO_COLORS: Record<string, string> = {
  "DEBITO (SIEF)": EXITO.greenHover,
  "DEBITO SUSPENSO": EXITO.muted,
  "OMISSAO DE DCTFWEB": EXITO.danger,
  "OMISSAO DE DCTF": EXITO.tertiary,
  "OMISSAO DE DIRF": EXITO.error,
  "OMISSAO DE EFD-CONTRIB": EXITO.tertiaryContainer,
  "OMISSAO DE PGDAS-D": EXITO.onErrorContainer,
  "IRREGULARIDADE CADASTRAL": EXITO.onErrorContainer,
  "DEBITO (SIDA)": EXITO.green,
  "INSCRICAO SUSPENSA": EXITO.outline,
  "PARCELAMENTO SUSPENSO": EXITO.onSecondaryFixedVariant,
  "PARCELAMENTO (PARCSN/PARCMEI)": EXITO.secondaryFixedDim,
  PARCELAMENTO: EXITO.outline,
  "PROCESSO FISCAL (SIEF)": EXITO.greenDeep,
  "INSCRICAO (SIDA)": EXITO.greenFixedDim,
  "DIVERGENCIA GFIP X GPS": EXITO.onSurfaceVariant,
  "INSCRICAO (SISTEMA DIVIDA)": EXITO.inverseSurface,
};

export const TITULO_FALLBACK_COLORS = [
  EXITO.green,
  EXITO.greenFixedDim,
  EXITO.muted,
  EXITO.greenHover,
  EXITO.outline,
  EXITO.greenDeep,
  EXITO.onSecondaryFixedVariant,
  EXITO.inverseSurface,
];

export const CHART_COMPOSICAO = {
  saldo: EXITO.green,
  multa: EXITO.outline,
  juros: EXITO.danger,
} as const;

export const CHART_RISCO = {
  pendencia: EXITO.danger,
  regular: EXITO.green,
} as const;
