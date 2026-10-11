import type Database from 'better-sqlite3';
import type {PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {conferirEscopoConversorImportacao,type EscopoOperacionalImportacao} from './postgres-import-scope.js';

type Cell={tipo:'nulo'|'inteiro'|'real'|'texto'|'blob';valor:string|null};
export function codificarLinhaLegada(row:Record<string,unknown>):Record<string,Cell>{
  return Object.fromEntries(Object.keys(row).sort().map(key=>{
    const value=row[key];let cell:Cell;
    if(value===null)cell={tipo:'nulo',valor:null};
    else if(typeof value==='bigint')cell={tipo:'inteiro',valor:value.toString()};
    else if(typeof value==='number'){
      if(!Number.isFinite(value))throw new Error('Valor numérico legado não finito.');
      cell={tipo:'real',valor:Object.is(value,-0)?'-0':String(value)};
    }else if(typeof value==='string')cell={tipo:'texto',valor:value};
    else if(Buffer.isBuffer(value))cell={tipo:'blob',valor:value.toString('base64')};
    else throw new Error('Tipo legado não suportado.');
    return [key,cell];
  }));
}
export function decodificarLinhaLegada(row:Record<string,Cell>):Record<string,unknown>{
  return Object.fromEntries(Object.entries(row).map(([key,cell])=>[key,
    cell.tipo==='nulo'?null:cell.tipo==='inteiro'?BigInt(cell.valor!):cell.tipo==='real'?Number(cell.valor):cell.tipo==='blob'?Buffer.from(cell.valor!,'base64'):cell.valor]));
}
const quote=(value:string)=>'"'+value.replaceAll('"','""')+'"';
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

/** Archive in a private schema, never in runtime session/queue tables. Caller owns the transaction. */
export async function preservarLegadoIsolado(db:Database.Database,client:PoolClient,tables:string[],scope?:EscopoOperacionalImportacao){
  const database=(await client.query('SELECT current_database() nome')).rows[0].nome;
  conferirEscopoConversorImportacao(database,scope);
  await client.query('CREATE SCHEMA importacao_privada');
  await client.query('REVOKE ALL ON SCHEMA importacao_privada FROM PUBLIC');
  await client.query(`CREATE TABLE importacao_privada.tabelas(nome text PRIMARY KEY,esquema_json jsonb NOT NULL,linhas bigint NOT NULL,hash text NOT NULL)`);
  await client.query(`CREATE TABLE importacao_privada.linhas(tabela text NOT NULL REFERENCES importacao_privada.tabelas(nome),ordinal bigint NOT NULL,conteudo_json jsonb NOT NULL,hash text NOT NULL,PRIMARY KEY(tabela,ordinal))`);
  const report:{tabela:string;linhas:number;hash:string}[]=[];
  for(const table of [...tables].sort()){
    const schema={sql:(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as {sql:string}).sql,
      colunas:db.prepare(`PRAGMA table_info(${quote(table)})`).all()};
    await client.query('INSERT INTO importacao_privada.tabelas(nome,esquema_json,linhas,hash) VALUES($1,$2::jsonb,0,$3)',[table,JSON.stringify(schema),hash(schema)]);
    const rowHashes:string[]=[];
    for(const row of db.prepare(`SELECT * FROM ${quote(table)}`).safeIntegers().iterate() as Iterable<Record<string,unknown>>){
      const payload=codificarLinhaLegada(row),fingerprint=hash(payload);rowHashes.push(fingerprint);
      await client.query('INSERT INTO importacao_privada.linhas(tabela,ordinal,conteudo_json,hash) VALUES($1,$2,$3::jsonb,$4)',[table,rowHashes.length,JSON.stringify(payload),fingerprint]);
    }
    const stored=(await client.query('SELECT conteudo_json,hash FROM importacao_privada.linhas WHERE tabela=$1 ORDER BY ordinal',[table])).rows;
    if(stored.length!==rowHashes.length||stored.some((row,index)=>hash(row.conteudo_json)!==rowHashes[index]||row.hash!==rowHashes[index]))throw new Error(`Arquivo legado divergente: ${table}`);
    const tableHash=hash({schema,rows:rowHashes.sort()});
    await client.query('UPDATE importacao_privada.tabelas SET linhas=$1,hash=$2 WHERE nome=$3',[stored.length,tableHash,table]);
    const savedSchema=(await client.query('SELECT esquema_json FROM importacao_privada.tabelas WHERE nome=$1',[table])).rows[0].esquema_json;
    if(hash(savedSchema)!==hash(schema))throw new Error(`Esquema legado divergente: ${table}`);
    report.push({tabela:table,linhas:stored.length,hash:tableHash});
  }
  return report;
}

