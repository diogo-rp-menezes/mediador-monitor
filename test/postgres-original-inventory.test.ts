import {it,expect,vi} from 'vitest';
import {mkdtempSync,writeFileSync,utimesSync,readFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {inventariarOriginais,referenciasOriginaisPostgres} from '../src/postgres-original-inventory.js';
it('identifica apenas original antigo sem referência/hash divergente, preservando todos os arquivos',async()=>{
  const dir=mkdtempSync(join('data','inventory-test-')),paths:string[]=[],now=Date.now();
  const create=(number:string,text:string,old=true)=>{
    const digest=createHash('sha256').update(text).digest('hex'),path=join(dir,`${number}-${digest.slice(0,12)}.doc`);
    writeFileSync(path,text);paths.push(path);if(old)utimesSync(path,new Date(now-10*86400000),new Date(now-10*86400000));return path;
  };
  try{
    const orphan=create('DF999991_2026','candidato'),referenced=create('DF999992_2026','referenciado');
    create('DF999993_2026','recente',false);const tampered=create('DF999994_2026','original');writeFileSync(tampered,'alterado');utimesSync(tampered,new Date(now-10*86400000),new Date(now-10*86400000));
    const result=await inventariarOriginais(dir,new Set([resolve(referenced).toLowerCase()]),{now});
    expect(result.candidatos).toHaveLength(1);expect(result.candidatos[0].path).toBe(resolve(orphan));expect(result.autoriza_exclusao).toBe(false);
    expect(readFileSync(orphan).toString()).toBe('candidato');expect(readFileSync(referenced).toString()).toBe('referenciado');
  }finally{paths.forEach(path=>unlinkSync(path));rmdirSync(dir);}
});
it('consulta referências e snapshots em transação somente leitura sem publicar seus conteúdos',async()=>{
  const query=vi.fn(async(sql:string)=>({rows:sql.startsWith('SELECT current_database')?[{nome:'test',oid:'123',endereco:'127.0.0.1',porta:5432}]:sql.startsWith('SELECT arquivo_path')?[{referencia:'downloads/original.doc'},{referencia:JSON.stringify({anexos:[{path:'downloads/snapshot.doc'}],destinatario:'privado@example.invalid'})}]:[]}));
  const release=vi.fn(),pool={options:{host:'localhost',port:5432},connect:vi.fn(async()=>({query,release}))} as unknown as Pool;
  const references=await referenciasOriginaisPostgres(pool);
  expect(references.has(resolve('downloads/original.doc').toLowerCase())).toBe(true);expect(references.has(resolve('downloads/snapshot.doc').toLowerCase())).toBe(true);
  expect(query).toHaveBeenCalledWith('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');expect(query).toHaveBeenCalledWith('COMMIT');expect(release).toHaveBeenCalledOnce();
});
