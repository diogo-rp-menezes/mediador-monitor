import type Database from 'better-sqlite3';
import type {PoolClient} from 'pg';
import {createHash,createHmac} from 'node:crypto';
import {codificarLinhaLegada} from './postgres-import-archive.js';
import type {PlanoIdentidade} from './postgres-import-references.js';
import {existsSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';

const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
function canonical(value:unknown):unknown{
  if(value instanceof Date)return {data:value.toISOString()};
  if(Buffer.isBuffer(value))return {blob:value.toString('base64')};
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
  return value;
}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

/** Caller holds a SQLite read transaction. Includes every source table, schema and typed cell. */
export function identificarOrigemImportacao(db:Database.Database,sourcePath?:string){
  const tables=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all() as {name:string;sql:string|null}[];
  const files=[];
  if(sourcePath&&tables.some(table=>table.name==='registros')){
    for(const row of db.prepare('SELECT numero_registro,arquivo_path,arquivo_hash FROM registros WHERE arquivo_path IS NOT NULL AND arquivo_path<>\'\'').all() as {numero_registro:string;arquivo_path:string;arquivo_hash:string|null}[]){
      const path=isAbsolute(row.arquivo_path)?row.arquivo_path:[resolve(row.arquivo_path),resolve(dirname(resolve(sourcePath)),row.arquivo_path)].find(existsSync);
      if(!path||!existsSync(path)||!row.arquivo_hash)throw new Error('Original ausente durante identificação da origem.');
      const digest=createHash('sha256').update(readFileSync(path)).digest('hex');
      if(digest!==row.arquivo_hash.toLowerCase())throw new Error('Original alterado desde a coleta.');
      files.push({registro:row.numero_registro,hash:digest});
    }
    files.sort((a,b)=>a.registro.localeCompare(b.registro));
  }
  return hash({arquivos:files,tabelas:tables.map(table=>{
    const rows=[];
    for(const row of db.prepare(`SELECT * FROM ${quote(table.name)}`).safeIntegers().iterate() as Iterable<Record<string,unknown>>)rows.push(hash(codificarLinhaLegada(row)));
    return {tabela:table.name,esquema:table.sql,linhas:rows.sort()};
  })});
}

export function identificarOpcoesImportacao(plans:PlanoIdentidade[],key:Buffer,mode='destino_vazio'){
  const sorted=plans.map(plan=>({...plan,mapeamentos:[...plan.mapeamentos].sort((a,b)=>a.origem_id-b.origem_id)})).sort((a,b)=>a.tabela.localeCompare(b.tabela));
  return hash({conversor:'nucleo-isolado-v5',modo:mode,planos:sorted,chave:createHmac('sha256',key).update('mediador-importacao-checkpoint-v1').digest('hex')});
}

export async function capturarLinhasPreexistentes(client:PoolClient){
  const tables=(await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows;
  const result=[];
  for(const table of tables)result.push({tabela:table.table_name as string,hashes:(await client.query(`SELECT * FROM public.${quote(table.table_name)}`)).rows.map(row=>hash(row))});
  return result;
}
export async function conferirLinhasPreexistentes(client:PoolClient,before:Awaited<ReturnType<typeof capturarLinhasPreexistentes>>){
  for(const table of before){
    const counts=new Map<string,number>();
    for(const row of (await client.query(`SELECT * FROM public.${quote(table.tabela)}`)).rows){const value=hash(row);counts.set(value,(counts.get(value)??0)+1);}
    for(const value of table.hashes){
      if(!(counts.get(value)??0))throw new Error('Registro preexistente foi alterado durante a conciliação.');
      counts.set(value,counts.get(value)!-1);
    }
  }
}

/** Excludes only the receipt itself. Both operational rows and the private legacy archive are checked. */
export async function identificarDestinoImportacao(client:PoolClient){
  const tables=(await client.query(`SELECT table_schema,table_name FROM information_schema.tables
    WHERE table_schema IN ('public','importacao_privada') AND table_type='BASE TABLE'
    AND NOT (table_schema='importacao_privada' AND table_name='lotes') ORDER BY table_schema,table_name`)).rows;
  if(tables.length)await client.query(`LOCK TABLE ${tables.map(table=>`${quote(table.table_schema)}.${quote(table.table_name)}`).join(',')} IN SHARE MODE`);
  const evidence=[];
  for(const table of tables){
    const columns=(await client.query(`SELECT column_name,data_type,is_nullable,column_default,is_identity FROM information_schema.columns
      WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`,[table.table_schema,table.table_name])).rows;
    const rows=(await client.query(`SELECT * FROM ${quote(table.table_schema)}.${quote(table.table_name)}`)).rows;
    evidence.push({...table,colunas:columns,linhas:rows.map(row=>hash(row)).sort()});
  }
  return hash(evidence);
}

export function conferirCheckpointImportacao(saved:{origem_hash:string;opcoes_hash:string;destino_hash:string},current:{origem_hash:string;opcoes_hash:string;destino_hash:string}){
  if(saved.origem_hash!==current.origem_hash)throw new Error('Origem alterada desde o checkpoint de importação.');
  if(saved.opcoes_hash!==current.opcoes_hash)throw new Error('Mapeamentos, chave ou conversor divergem do checkpoint.');
  if(saved.destino_hash!==current.destino_hash)throw new Error('Destino alterado desde o checkpoint de importação.');
}

/** Old IDs inside historical JSON/text remain source IDs, resolved through this private map. */
export async function persistirProvenienciaImportacao(client:PoolClient,plans:PlanoIdentidade[]){
  await client.query(`CREATE TABLE importacao_privada.identidades(
    tabela text NOT NULL,origem_id bigint NOT NULL,destino_id bigint NOT NULL,
    PRIMARY KEY(tabela,origem_id),UNIQUE(tabela,destino_id))`);
  for(const plan of plans)for(const mapping of plan.mapeamentos){
    if(mapping.destino_id===null||!['inserir_preservando_id','inserir_remapeando_id'].includes(mapping.acao))throw new Error('Proveniência exige mapeamento de inserção validado.');
    // Global legacy audit events remain archived-only and have no operational destination row.
    if(plan.tabela==='auditoria_clientes'&&!(await client.query('SELECT 1 FROM auditoria_clientes WHERE id=$1',[mapping.destino_id])).rowCount)continue;
    await client.query('INSERT INTO importacao_privada.identidades(tabela,origem_id,destino_id) VALUES($1,$2,$3)',[plan.tabela,mapping.origem_id,mapping.destino_id]);
  }
}

