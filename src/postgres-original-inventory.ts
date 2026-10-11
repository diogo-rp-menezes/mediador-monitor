import {lstat,readdir,realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import type {Pool} from 'pg';
import {withPostgresTransaction} from './postgres-transaction.js';
import {adicionarReferenciasOriginais} from './original-reference-values.js';

export async function inventariarReferenciasOriginaisPostgres(pool:Pool){
  return withPostgresTransaction(pool,async client=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    await client.query("SELECT set_config('app.global_access','true',true)");
    const identity=(await client.query(`SELECT current_database() nome, oid::text oid,
      inet_server_addr()::text endereco, inet_server_port() porta FROM pg_database WHERE datname=current_database()`)).rows[0];
    if(!identity||typeof identity.nome!=='string'||!/^\d+$/.test(identity.oid))throw new Error('Identidade do banco indisponível.');
    const databaseHash=createHash('sha256').update(JSON.stringify(['postgres-retencao-v1',
      pool.options.host,pool.options.port,identity.nome,identity.oid,identity.endereco,identity.porta])).digest('hex');
    const rows=(await client.query(`SELECT arquivo_path AS referencia FROM registros WHERE arquivo_path IS NOT NULL
      UNION ALL SELECT snapshot_json::text AS referencia FROM envios_clientes WHERE snapshot_json IS NOT NULL`)).rows;
    const references=new Set<string>();
    for(const row of rows){
      const value=row.referencia as string;
      adicionarReferenciasOriginais(references,value.startsWith('{')||value.startsWith('[')?JSON.parse(value):value);
    }
    return {references,databaseHash};
  });
}

export async function referenciasOriginaisPostgres(pool:Pool){
  return (await inventariarReferenciasOriginaisPostgres(pool)).references;
}

/** Read-only candidates, never an authorization for deletion. Skips directories, links and unfamiliar names. */
export async function inventariarOriginais(root:string,references:Set<string>,options:{minAgeDays?:number;now?:number}={}){
  const age=options.minAgeDays??7,now=options.now??Date.now();
  if(!Number.isInteger(age)||age<1||age>3650||!Number.isFinite(now))throw new Error('Janela de inventário inválida.');
  const directory=await realpath(root),items=[];let ignored=0;
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const match=entry.name.match(/^[A-Z]{2}\d{6}_\d{4}-([a-f0-9]{12})\.(pdf|doc)$/);
    if(!entry.isFile()||!match){ignored++;continue;}
    const path=join(directory,entry.name),stat=await lstat(path);
    if(!stat.isFile()||stat.isSymbolicLink()||references.has(resolve(path).toLowerCase())||references.has('nome:'+entry.name.toLowerCase())||stat.mtimeMs>now-age*86400000){ignored++;continue;}
    const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
    const digest=hash.digest('hex'),after=await lstat(path);
    if(references.has('hash:'+digest)||digest.slice(0,12)!==match[1]||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.ino!==stat.ino){ignored++;continue;}
    items.push({nome:entry.name,path,bytes:stat.size,sha256:digest,modificado_em:new Date(stat.mtimeMs).toISOString()});
  }
  return {formato:'inventario-originais-v1',somente_leitura:true,autoriza_exclusao:false,pasta:directory,
    criado_em:new Date(now).toISOString(),min_age_days:age,ignorados:ignored,candidatos:items.sort((a,b)=>a.nome.localeCompare(b.nome))};
}

