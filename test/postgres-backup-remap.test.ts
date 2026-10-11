import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {remapearArquivosBackupIsolado} from '../src/postgres-backup-remap.js';
const database='mediador_import_test_'+'a'.repeat(32),origin='D:\\old-machine\\arquivo.pdf',logical='files/'+'b'.repeat(64)+'.bin';
const hash=createHash('sha256').update('bytes').digest('hex');
async function fixture(work:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'mediador-remap-test-'));try{await mkdir(join(root,'files'));await writeFile(join(root,...logical.split('/')),'bytes');await work(root);}finally{if(!resolve(root).startsWith(resolve(tmpdir())+sep))throw new Error('Limpeza inválida');await rm(root,{recursive:true,force:true});}}
function poolFixture(){const calls:{sql:string;values?:unknown[]}[]=[];const client={query:async(sql:string,values?:unknown[])=>{calls.push({sql,values});return {rows:sql.startsWith('SELECT current_database')?[{nome:database}]:sql.startsWith('SELECT numero_registro')?[{numero_registro:'DF000001/2026',arquivo_path:origin,arquivo_hash:hash}]:sql.startsWith('SELECT id,snapshot_json')?[{id:1,snapshot_json:{texto:'preservado',anexos:[{path:'./relative/attachment.pdf',hash,bytes:5,nome:'original.pdf'}]}}]:[]};},release:()=>{}};return {pool:{connect:async()=>client} as unknown as Pool,calls};}
it('remapeia Windows e referência relativa usando apenas aliases exatos do mapa',()=>fixture(async root=>{
  const {pool,calls}=poolFixture();
  expect(await remapearArquivosBackupIsolado(pool,database,root,[{origin,path:logical},{origin:'./relative/attachment.pdf',path:logical}])).toEqual({originais:1,envios:1,arquivos:2});
  const update=calls.find(call=>call.sql.startsWith('UPDATE registros'));expect(update?.values?.[0]).toBe(join(root,...logical.split('/')));
  const snapshot=JSON.parse(String(calls.find(call=>call.sql.startsWith('UPDATE envios_clientes'))?.values?.[0]));expect(snapshot.texto).toBe('preservado');expect(snapshot.anexos[0]).toMatchObject({path:join(root,...logical.split('/')),hash,nome:'original.pdf'});expect(calls.at(-1)?.sql).toBe('COMMIT');
}));
it('recusa mapa incompleto ou inseguro e bytes adulterados sem escrever caminhos',()=>fixture(async root=>{
  for(const references of [[],[{origin,path:'../outside'}],[{origin,path:logical},{origin,path:logical}]]){const {pool,calls}=poolFixture();await expect(remapearArquivosBackupIsolado(pool,database,root,references)).rejects.toThrow();expect(calls.some(call=>call.sql.startsWith('UPDATE'))).toBe(false);}
  await writeFile(join(root,...logical.split('/')),'alterado');const {pool,calls}=poolFixture();await expect(remapearArquivosBackupIsolado(pool,database,root,[{origin,path:logical},{origin:'./relative/attachment.pdf',path:logical}])).rejects.toThrow();expect(calls.some(call=>call.sql.startsWith('UPDATE'))).toBe(false);expect(calls.at(-1)?.sql).toBe('ROLLBACK');
}));
