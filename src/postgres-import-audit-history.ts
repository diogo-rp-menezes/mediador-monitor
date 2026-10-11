import type Database from 'better-sqlite3';
import type {PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {remapearReferenciasIdentidade,type PlanoIdentidade} from './postgres-import-references.js';
import {sincronizarSequenciaImportacao} from './postgres-import-sequences.js';
import {conferirEscopoConversorImportacao,type EscopoOperacionalImportacao} from './postgres-import-scope.js';

type Lookup=(entity:'clientes'|'contatos',id:number)=>number|undefined;
const positive=(value:unknown)=>{const number=Number(value);return Number.isSafeInteger(number)&&number>0?number:undefined;};
/** Returns no office when the evidence is missing or contradictory; never guesses the first office. */
export function resolverEscritorioAuditoria(entity:string,id:string,details:Record<string,unknown>,lookup:Lookup):number|undefined{
  if(['usuario','usuarios','migracao'].includes(entity))return undefined;
  const candidates=new Set<number>();
  const add=(value:unknown)=>{const office=positive(value);if(office)candidates.add(office);};
  add(details.escritorio_id);
  for(const key of ['antes','depois']){
    const snapshot=details[key];if(snapshot&&typeof snapshot==='object')add((snapshot as Record<string,unknown>).escritorio_id);
  }
  const ids=id.split(':');
  if(entity==='escritorio')add(positive(id));
  else if(entity==='usuario_escritorio'&&ids.length===2)add(positive(ids[1]));
  else if(['cliente','clientes','contato','contatos'].includes(entity)){
    const target=positive(id);if(target)add(lookup(entity.startsWith('cliente')?'clientes':'contatos',target));
  }else if((entity==='documento_cliente'||entity==='usuario_cliente')&&ids.length>=2){
    const target=positive(ids[entity==='usuario_cliente'?1:0]);if(target)add(lookup('clientes',target));
  }else return undefined;
  return candidates.size===1?[...candidates][0]:undefined;
}
const canonical=(value:unknown):unknown=>value instanceof Date?value.toISOString():Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

export async function importarAuditoriaCadastrosIsolada(db:Database.Database,client:PoolClient,identityPlans?:PlanoIdentidade[],scope?:EscopoOperacionalImportacao){
  conferirEscopoConversorImportacao((await client.query('SELECT current_database() nome')).rows[0].nome,scope);
  const previous=Number((await client.query('SELECT count(*) total FROM auditoria_clientes')).rows[0].total);
  const offices=new Set((db.prepare('SELECT id FROM escritorios').all() as {id:number}[]).map(row=>row.id));
  const lookup:Lookup=(table,id)=>(db.prepare(`SELECT escritorio_id FROM ${table} WHERE id=?`).get(id) as {escritorio_id:number}|undefined)?.escritorio_id;
  let archivedOnly=0;const hashes:string[]=[];
  for(const row of db.prepare('SELECT * FROM auditoria_clientes ORDER BY id').safeIntegers().iterate() as Iterable<Record<string,unknown>>){
    const details=JSON.parse(String(row.detalhes_json)) as Record<string,unknown>;
    if(!details||typeof details!=='object'||Array.isArray(details))throw new Error('Detalhes de auditoria inválidos.');
    const office=resolverEscritorioAuditoria(String(row.entidade),String(row.entidade_id),details,lookup);
    if(!office||!offices.has(office)){archivedOnly++;continue;}
    const raw=String(row.criado_em),date=new Date(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?$/.test(raw)?raw.replace(' ','T')+'Z':raw);
    if(!Number.isFinite(date.getTime()))throw new Error('Data de auditoria inválida.');
    const mappedOffice=identityPlans?remapearReferenciasIdentidade({escritorio_id:office},[{coluna:'escritorio_id',tabela:'escritorios'}],identityPlans).escritorio_id as number:office;
    const mappedId=identityPlans?remapearReferenciasIdentidade({id:row.id},[{coluna:'id',tabela:'auditoria_clientes'}],identityPlans).id:row.id;
    const expected={id:String(mappedId),escritorio_id:mappedOffice,entidade:String(row.entidade),entidade_id:String(row.entidade_id),acao:String(row.acao),detalhes_json:details,criado_em:date};
    const stored=(await client.query(`INSERT INTO auditoria_clientes(id,escritorio_id,entidade,entidade_id,acao,detalhes_json,criado_em)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING id::text,escritorio_id,entidade,entidade_id,acao,detalhes_json,criado_em`,
    [expected.id,mappedOffice,expected.entidade,expected.entidade_id,expected.acao,JSON.stringify(details),date])).rows[0];
    if(hash(expected)!==hash(stored))throw new Error('Auditoria convertida divergiu da origem.');hashes.push(hash(expected));
  }
  const total=Number((await client.query('SELECT count(*) total FROM auditoria_clientes')).rows[0].total);
  if(total!==previous+hashes.length)throw new Error('Contagem de auditoria divergente.');
  await sincronizarSequenciaImportacao(client,'auditoria_clientes','id');
  return {tabela:'auditoria_clientes',linhas:hashes.length,hash:hash(hashes.sort()),somente_arquivo:archivedOnly};
}

