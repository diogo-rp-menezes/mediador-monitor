import type Database from 'better-sqlite3';

export type MapeamentoIdentidade={origem_id:number;destino_id:number|null;acao:string};
export type PlanoIdentidade={tabela:string;mapeamentos:MapeamentoIdentidade[]};
export type ReferenciaIdentidade={coluna:string;tabela:string};
/** Numeric primary keys converted to operational PostgreSQL tables (archived-only tables excluded). */
export const TABELAS_IDS_IMPORTACAO=['escritorios','usuarios','clientes','contatos','sindicatos','monitoramentos_escritorios',
  'execucoes','execucoes_escritorio','versoes_interpretacao','publicacoes_documentos','auditoria_acessos_publicacoes',
  'auditoria_seguranca','envios_clientes','tentativas_envio','notificacoes_publicacoes','auditoria_clientes'] as const;
const identities=new Set<string>(TABELAS_IDS_IMPORTACAO);
const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';

export function criarPlanosIdsIsolados(db:Database.Database,remap=false):PlanoIdentidade[]{
  const known=new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(row=>row.name));
  return TABELAS_IDS_IMPORTACAO.filter(table=>known.has(table)).map(table=>{
    const rows=db.prepare(`SELECT id FROM ${quote(table)} ORDER BY id`).safeIntegers().all() as {id:bigint}[];
    let next=rows.reduce((maximum,row)=>row.id>maximum?row.id:maximum,0n)+1n;
    return {tabela:table,mapeamentos:rows.map(row=>{
      const id=Number(row.id),destination=Number(remap?next++:row.id);
      if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(destination)||destination<1)throw new Error('ID fora do intervalo seguro.');
      return {origem_id:id,destino_id:destination,acao:remap?'inserir_remapeando_id':'inserir_preservando_id'};
    })};
  });
}

/** Uses declared FKs, including composite constraints, rather than guessing from column names. */
export function referenciasIdentidades(db:Database.Database,table:string):ReferenciaIdentidade[]{
  const references=db.prepare(`PRAGMA foreign_key_list(${quote(table)})`).all() as {from:string;table:string;to:string}[];
  const result=new Map<string,ReferenciaIdentidade>();
  for(const reference of references){
    if(!identities.has(reference.table)||reference.to!=='id')continue;
    const previous=result.get(reference.from);
    if(previous&&previous.tabela!==reference.table)throw new Error('Referência de identidade ambígua.');
    result.set(reference.from,{coluna:reference.from,tabela:reference.table});
  }
  return [...result.values()].sort((a,b)=>a.coluna.localeCompare(b.coluna));
}

/** Only approved insert mappings can be applied. Existing identities require an explicit later decision. */
export function remapearReferenciasIdentidade(row:Record<string,unknown>,references:ReferenciaIdentidade[],plans:PlanoIdentidade[]){
  const result={...row};
  for(const reference of references){
    const value=row[reference.coluna];
    if(value===null)continue;
    if(value===undefined)throw new Error('Coluna de referência ausente.');
    if(typeof value!=='number'&&typeof value!=='bigint')throw new Error('ID de referência inválido.');
    const id=Number(value);
    if(!Number.isSafeInteger(id)||id<1)throw new Error('ID de referência inválido.');
    const matches=plans.filter(plan=>plan.tabela===reference.tabela).flatMap(plan=>plan.mapeamentos.filter(mapping=>mapping.origem_id===id));
    if(matches.length!==1)throw new Error('Referência sem mapeamento único.');
    const mapping=matches[0];
    if(!['inserir_preservando_id','inserir_remapeando_id'].includes(mapping.acao)||mapping.destino_id===null)throw new Error('Referência exige revisão de identidade.');
    if(!Number.isSafeInteger(mapping.destino_id)||mapping.destino_id<1)throw new Error('ID remapeado inválido.');
    result[reference.coluna]=mapping.destino_id;
  }
  return result;
}

/** Counts only; never includes document contents, credentials, or historical JSON in the report. */
export function planejarReferenciasIdentidade(db:Database.Database,plans:PlanoIdentidade[]){
  const tables=(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {name:string}[]);
  return tables.flatMap(({name})=>{
    const references=referenciasIdentidades(db,name);
    if(!references.length)return [];
    const counts=references.map(reference=>({...reference,referencias:0,remapeadas:0,bloqueadas:0}));
    for(const row of db.prepare(`SELECT ${references.map(reference=>quote(reference.coluna)).join(',')} FROM ${quote(name)}`).safeIntegers().iterate() as Iterable<Record<string,unknown>>){
      for(const count of counts){
        if(row[count.coluna]===null)continue;
        count.referencias++;
        try{
          const mapped=remapearReferenciasIdentidade(row,[count],plans);
          if(BigInt(mapped[count.coluna] as number)!==BigInt(row[count.coluna] as bigint))count.remapeadas++;
        }catch{count.bloqueadas++;}
      }
    }
    return [{tabela:name,colunas:counts}];
  });
}

