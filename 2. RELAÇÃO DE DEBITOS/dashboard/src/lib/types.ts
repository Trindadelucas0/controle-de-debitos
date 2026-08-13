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
