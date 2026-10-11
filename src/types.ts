/** Um item da tela "Resultado: N Instrumento(s) Coletivo(s) Encontrado(s)". */
export interface Registro {
  /** Nº do Registro no MTE, ex.: DF000380/2026 (chave de identidade) */
  numeroRegistro: string;
  /** Nº da Solicitação, ex.: MR036310/2026 */
  numeroSolicitacao: string;
  tipo: string; // Convenção Coletiva, Acordo Coletivo, Termo Aditivo...
  vigencia: string; // "01/05/2026 - 30/04/2028"
  partes: string; // sindicatos/empresas, separados por "; "
  /** Posição do item na página de resultados (0-based), usada para clicar no "Download" correto */
  indice: number;
}

/** Dados lidos de forma determinística do cabeçalho do documento baixado. */
export interface Cabecalho {
  titulo?: string;
  numeroRegistro?: string;
  dataRegistro?: string;
  numeroSolicitacao?: string;
  numeroProcesso?: string;
  cnpjs: string[];
}

/** Um ponto analisado por LLM (sempre conferir no documento). */
export interface Topico {
  resumo: string;
  /** Cláusula de origem, ex.: "Cláusula 12ª" */
  clausula?: string;
  /** Trecho literal do documento que sustenta o resumo */
  citacao?: string;
}

import type { PadraoCct } from "./cct-template.js";

/** Análise v1 padronizada ou versão histórica, preservada no SQLite. */
export interface Extracao {
  padrao?: PadraoCct;
  aditivo?: { versao: string; alteracoes: Array<{campo:string; acao:string; valor:string; clausula:string; citacao:string}> };
  topicos: Record<string, Topico>;
  observacoes?: string[];
}
