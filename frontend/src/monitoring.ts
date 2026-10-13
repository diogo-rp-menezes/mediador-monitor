import {TIPOS_VALIDOS} from '../../src/instrumentos';
export type CollectionQuery={id:number;nome:string;sindicato_nome?:string;ativo:boolean;cnpj_filtro:string;categoria:string;uf:string;titulo:string;vigencia:string;tipos:string[]};
/** Preflight matches the consumer's accepted filters; execution remains server-owned. */
export function collectionQueryIssue(query:CollectionQuery|undefined):string{
  if(!query)return 'Selecione uma consulta.';
  if(!query.ativo)return 'A consulta está inativa.';
  if(![query.cnpj_filtro,query.categoria,query.titulo].some(value=>value?.trim()))return 'Configure ao menos um filtro de CNPJ, categoria ou título em Cadastros.';
  if(!Array.isArray(query.tipos)||!query.tipos.length||query.tipos.some(type=>!TIPOS_VALIDOS.has(type)))return 'Confira os tipos de instrumento em Cadastros.';
  const validity=(query.vigencia||'Vigentes').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(!['vigentes','vigente','todos','nao vigentes','nao vigente','0','1','2'].includes(validity))return 'A coleta aceita vigência Vigentes, Todos ou Não Vigentes. Confira a configuração em Cadastros.';
  if(query.uf.trim()&&!/^[A-Z]{2}$/.test(query.uf.trim().toUpperCase()))return 'Confira o filtro de UF em Cadastros.';
  return '';
}
