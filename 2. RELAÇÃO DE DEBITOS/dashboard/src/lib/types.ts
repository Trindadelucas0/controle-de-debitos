export type Esfera = "federal" | "estadual" | "municipal";

/** Cadastro operacional: onde consultar cada empresa por esfera. */
export type CadastroConsulta = {
  numero: string;
  empresa: string;
  cnpj: string | null;
  uf: string;
  federal: string;
  estadual: string;
  municipal: string;
};

export type CadastroConsultasData = {
  gerado_em?: string;
  origem?: string;
  empresas: CadastroConsulta[];
  /** Chaves `cnpj:…` / `num:…` ocultas do cadastro de consultas. */
  excluidas?: string[];
};

export type StatusEsfera = "pendencia" | "regular" | "sem_documento" | "indeterminado";

export type DebitoLinha = {
  receita: string;
  pa: string;
  vencimento: string;
  original: number;
  saldo: number;
  multa: number;
  juros: number;
  consolidado: number;
  situacao: string;
  origem: "ECAC" | "AGENCIANET" | "MUNICIPAL" | "OUTRO" | string;
  arquivo: string;
  codigo?: string;
  numero_lancamento?: string;
  esfera?: Esfera;
  inscricao?: string;
  /** Seção do Diagnóstico Fiscal, ex. "DEBITO (SIEF)" | "OMISSAO DE DCTFWEB". */
  titulo?: string;
};

export type Totais = {
  original: number;
  saldo: number;
  multa: number;
  juros: number;
  consolidado: number;
};

export type Documento = {
  arquivo: string;
  codigo?: string;
  esfera: Esfera;
  origemLabel: string;
  statusDoc: "pendencia" | "regular" | "indeterminado";
  debitos: DebitoLinha[];
  totais: Totais;
};

export type EsferaResumo = {
  qtdDocs: number;
  status: StatusEsfera;
  totais: Totais;
  arquivos: string[];
  qtd_debitos: number;
};

export type Empresa = {
  id: string;
  nome: string;
  cnpj: string | null;
  codigo?: string;
  codigos?: string[];
  status: "pendencia" | "regular";
  tipos: string[];
  totais: Totais;
  debitos: DebitoLinha[];
  documentos: Documento[];
  esferas: {
    federal: EsferaResumo;
    estadual: EsferaResumo;
    municipal: EsferaResumo;
  };
  temFederal: boolean;
  temEstadual: boolean;
  temMunicipal: boolean;
  arquivos: string[];
  pasta: string;
  avisos: string[];
  qtd_debitos: number;
  competencia?: string;
};

export type TotaisGerais = {
  empresas: number;
  com_pendencia: number;
  regulares: number;
  saldo: number;
  consolidado: number;
  docs_federal?: number;
  docs_estadual?: number;
  docs_municipal?: number;
};

export type CompetenciaSnapshot = {
  competencia: string;
  gerado_em: string;
  pasta_mes: string;
  totais_gerais: TotaisGerais;
  empresas: Empresa[];
};

export type DashboardData = {
  gerado_em: string;
  competencias?: string[];
  atual?: string;
  snapshots?: Record<string, CompetenciaSnapshot>;
  /** Espelho da competência atual (compat). */
  competencia?: string;
  pasta_mes: string;
  totais_gerais: TotaisGerais;
  empresas: Empresa[];
};

/** Controle operacional de parcelamentos (módulo dedicado). */
export type ParcelamentoStatus =
  | "ativo"
  | "encerrado"
  | "saiu"
  | "erro_emissao"
  | "cancelado";

export type ParcelamentoTipo =
  | "municipal"
  | "estadual"
  | "pgfn"
  | "sn"
  | "sn_pert"
  | "outro";

/** Empresa no catálogo de parcelamentos (identidade fixa). */
export type EmpresaParcelamento = {
  id: string;
  cod?: string;
  empresa: string;
  grupo?: string;
  cnpj: string;
  /** Nº do acordo — fixo no cadastro da empresa. */
  numeroParcelamento?: string;
};

/** Preenchimento mensal por empresa. */
export type CompetenciaRegistro = {
  /** Situação operacional do parcelamento no mês. */
  status: ParcelamentoStatus;
  tipo?: ParcelamentoTipo;
  totalParcelas?: number | null;
  vencimento?: string | null;
  /** Base MM-YYYY para calcular parcela atual (default = competência do preenchimento). */
  inicioCompetencia?: string;
  observacao?: string;
  atualizadoEm?: string;
};

export type ParcelamentosData = {
  gerado_em?: string;
  origem?: string;
  empresas: EmpresaParcelamento[];
  competencias: string[];
  atual: string;
  porCompetencia: Record<string, Record<string, CompetenciaRegistro>>;
};

/** @deprecated Modelo antigo (lista plana) — mantido só para tipagem de migração. */
export type Parcelamento = {
  id: string;
  cod?: string;
  empresa: string;
  grupo?: string;
  cnpj: string;
  tipo: ParcelamentoTipo;
  status: ParcelamentoStatus;
  numeroParcelamento: string;
  totalParcelas: number;
  vencimento: string;
  inicioCompetencia: string;
  observacao?: string;
  atualizadoEm: string;
};
