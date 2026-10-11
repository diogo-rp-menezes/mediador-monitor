import type Database from 'better-sqlite3';
import type {PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {referenciasIdentidades,remapearReferenciasIdentidade,TABELAS_IDS_IMPORTACAO,type PlanoIdentidade,type ReferenciaIdentidade} from './postgres-import-references.js';

export type RegraChaveImportacao={tabela:string;destino:string;colunas:string[];ids:string[];principal?:boolean;documento?:boolean};
const rule=(tabela:string,colunas:string[],ids:string[]=[],extra:Partial<RegraChaveImportacao>={}):RegraChaveImportacao=>({tabela,destino:tabela,colunas,ids,...extra});
/** Other unique numeric IDs and natural keys are covered by the identity reconciliation plan. */
export const REGRAS_CHAVES_IMPORTACAO:RegraChaveImportacao[]=[
  rule('registros',['numero_registro'],[],{documento:true}),
  rule('credenciais_usuarios',['usuario_id'],['usuario_id']),rule('papeis_plataforma',['usuario_id'],['usuario_id']),
  rule('usuarios_escritorios',['usuario_id','escritorio_id'],['usuario_id','escritorio_id']),
  rule('usuarios_clientes',['usuario_id','cliente_id'],['usuario_id','cliente_id']),
  rule('clientes_contatos',['cliente_id','contato_id'],['cliente_id','contato_id']),
  rule('clientes_sindicatos',['cliente_id','sindicato_id'],['cliente_id','sindicato_id']),
  rule('clientes_sindicatos',['cliente_id'],['cliente_id'],{principal:true}),
  rule('registros_sindicatos',['numero_registro','sindicato_id'],['sindicato_id']),
  rule('monitoramentos_escritorios',['escritorio_id','sindicato_id'],['escritorio_id','sindicato_id']),
  rule('vinculos_escritorio',['escritorio_id','aditivo'],['escritorio_id']),
  rule('interpretacoes_escritorio',['escritorio_id','base'],['escritorio_id']),
  rule('versoes_interpretacao',['escritorio_id','base','versao'],['escritorio_id']),
  rule('configuracoes_smtp_escritorio',['escritorio_id'],['escritorio_id']),
  rule('publicacoes_documentos',['escritorio_id','cliente_id','base','versao'],['escritorio_id','cliente_id']),
  rule('clientes_documentos',['cliente_id','numero_registro'],['cliente_id']),
  rule('envios_clientes',['cliente_id','contato_id','numero_registro','versao'],['cliente_id','contato_id']),
  rule('notificacoes_publicacoes',['publicacao_id','destino'],['publicacao_id']),
  rule('ajustes',['chave'],[],{destino:'ajustes_plataforma'}),
];
export type RestricaoUnicaImportacao={tabela:string;indice:string;expressoes:string[];predicado:string|null;valido?:boolean;nulos_nao_distintos?:boolean};
export function classificarRestricaoUnicaImportacao(index:RestricaoUnicaImportacao){
  if(['mediador_schema_migrations','sessoes_usuarios','recuperacoes_acesso','concessoes_suporte','limites_autenticacao','limites_monitoramento_escritorio','tentativas_analise','solicitacoes_analise'].includes(index.tabela))return 'fora_da_importacao_operacional';
  if(index.valido===false)return 'restricao_sem_plano';
  if((TABELAS_IDS_IMPORTACAO as readonly string[]).includes(index.tabela)&&index.expressoes.includes('id'))return 'id_numerico_planejado';
  if(index.nulos_nao_distintos)return 'restricao_sem_plano';
  const natural:Record<string,string[]>={escritorios:['cnpj'],usuarios:['lower(email)'],clientes:['cnpj'],contatos:['escritorio_id','lower(email)']};
  if(!index.predicado&&JSON.stringify(natural[index.tabela])===JSON.stringify(index.expressoes))return 'identidade_natural_planejada';
  if(REGRAS_CHAVES_IMPORTACAO.some(rule=>rule.destino===index.tabela&&JSON.stringify(rule.colunas)===JSON.stringify(index.expressoes)
    &&(rule.principal?index.predicado==='principal':index.predicado===null)))return 'chave_textual_composta_planejada';
  return 'restricao_sem_plano';
}
export async function conferirCoberturaChavesImportacao(client:PoolClient){
  const indexes=(await client.query<RestricaoUnicaImportacao>(`SELECT t.relname tabela,i.relname indice,pg_get_expr(x.indpred,x.indrelid) predicado,
    x.indisvalid valido,x.indnullsnotdistinct nulos_nao_distintos,
    ARRAY(SELECT pg_get_indexdef(x.indexrelid,k,true) FROM generate_series(1,x.indnkeyatts) k ORDER BY k) expressoes
    FROM pg_index x JOIN pg_class t ON t.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND x.indisunique ORDER BY t.relname,i.relname`)).rows;
  return indexes.map(index=>({...index,cobertura:classificarRestricaoUnicaImportacao(index)}));
}
const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
const fingerprint=(value:string)=>createHash('sha256').update(value).digest('hex');

function key(row:Record<string,unknown>,definition:RegraChaveImportacao){
  return JSON.stringify(definition.colunas.map(column=>{
    const value=row[column];
    if(definition.ids.includes(column)){
      if(!['number','bigint','string'].includes(typeof value)||!/^\d+$/.test(String(value))||BigInt(String(value))<1n)throw new Error('ID de chave inválido.');
      return {id:BigInt(String(value)).toString()};
    }
    if(typeof value!=='string'||!value.length)throw new Error('Chave textual inválida.');
    // Text keys are exact; never trim, lowercase or renumber document identifiers.
    return {texto:value};
  }));
}

export function conciliarChavesLegadas(definition:RegraChaveImportacao,source:Record<string,unknown>[],target:Record<string,unknown>[],references:ReferenciaIdentidade[],plans:PlanoIdentidade[]){
  const destination=new Map<string,Record<string,unknown>[]>();
  for(const row of target){const value=key(row,definition);destination.set(value,[...(destination.get(value)??[]),row]);}
  const candidates=source.map((row,index)=>{
    try{
      const mapped=remapearReferenciasIdentidade(row,references,plans);
      return {row,ordinal:index+1,chave:key(mapped,definition),erro:null};
    }catch{return {row,ordinal:index+1,chave:null,erro:'bloqueado_chave_ou_dependencia'};}
  });
  const counts=new Map<string,number>();
  for(const candidate of candidates)if(candidate.chave)counts.set(candidate.chave,(counts.get(candidate.chave)??0)+1);
  return candidates.map(candidate=>{
    let action=candidate.erro??'inserir';
    const matches=candidate.chave?destination.get(candidate.chave)??[]:[];
    if(candidate.chave&&(counts.get(candidate.chave)??0)>1)action='conflito_chave_origem';
    else if(matches.length>1)action='conflito_chave_destino';
    else if(matches.length===1){
      action='revisar_vinculo_existente';
      if(definition.documento){
        const original=String(candidate.row.arquivo_hash??'').toLowerCase(),stored=String(matches[0].arquivo_hash??'').toLowerCase();
        action=!/^[a-f0-9]{64}$/.test(original)||!/^[a-f0-9]{64}$/.test(stored)?'revisar_documento_sem_hash'
          :original===stored?'revisar_documento_existente':'conflito_original_divergente';
      }
    }
    return {origem_ordinal:candidate.ordinal,chave_hash:candidate.chave?fingerprint(candidate.chave):null,acao:action};
  });
}

/** Caller owns read snapshots in both databases. Only key columns and document hashes are read. */
export async function planejarChavesImportacao(db:Database.Database,client:PoolClient,plans:PlanoIdentidade[]){
  const known=new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(row=>row.name));
  const report=[];
  for(const definition of REGRAS_CHAVES_IMPORTACAO){
    if(!known.has(definition.tabela))continue;
    const fields=[...definition.colunas,...(definition.documento?['arquivo_hash']:[])].map(quote).join(',');
    const order=definition.colunas.map(quote).join(',');
    const source=db.prepare(`SELECT ${fields} FROM ${quote(definition.tabela)}${definition.principal?' WHERE principal=1':''} ORDER BY ${order}`).safeIntegers().all() as Record<string,unknown>[];
    const target=(await client.query(`SELECT ${fields} FROM ${quote(definition.destino)}${definition.principal?' WHERE principal':''} ORDER BY ${order}`)).rows;
    const references=referenciasIdentidades(db,definition.tabela).filter(reference=>definition.ids.includes(reference.coluna));
    const entries=conciliarChavesLegadas(definition,source,target,references,plans);
    report.push({tabela:definition.tabela,destino:definition.destino,colunas:definition.colunas,indice_parcial_principal:!!definition.principal,
      linhas_origem:source.length,linhas_destino:target.length,itens:entries});
  }
  return report;
}

