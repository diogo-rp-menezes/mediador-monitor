import {it,expect} from 'vitest';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {inventariarArquivosBackup,lerReferenciasBackupPostgres} from '../src/postgres-backup-inventory.js';
const hash=createHash('sha256').update('bytes').digest('hex');
async function fixture(work:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'mediador-backup-inventory-'));try{await work(root);}finally{if(!resolve(root).startsWith(resolve(tmpdir())+sep))throw new Error('Limpeza fora da raiz');await rm(root,{recursive:true,force:true});}}
it('confere hashes e tamanhos, deduplica referências e gera caminhos lógicos estáveis',()=>fixture(async root=>{
  const source=join(root,'original.pdf');await writeFile(source,'bytes');
  const result=await inventariarArquivosBackup([{source,sha256:hash},{source,sha256:hash,bytes:5}],[root]);
  expect(result).toMatchObject({referencias:2,arquivos:1,bytes:5});expect(result.files[0].path).toMatch(/^files\/[a-f0-9]{64}\.bin$/);
  expect(await inventariarArquivosBackup([{source,sha256:hash}],[root])).toMatchObject({files:result.files});
}));
it('falha fechado para arquivo ausente, fora da raiz, hash/tamanho divergente e referência conflitante',()=>fixture(async root=>{
  const source=join(root,'original.pdf'),allowed=join(root,'allowed');await writeFile(source,'bytes');await mkdir(allowed);
  for(const [references,roots] of [
    [[{source:join(root,'missing'),sha256:hash}],[root]],
    [[{source,sha256:hash}],[allowed]],
    [[{source,sha256:'a'.repeat(64)}],[root]],
    [[{source,sha256:hash,bytes:4}],[root]],
    [[{source,sha256:hash},{source,sha256:'a'.repeat(64)}],[root]]
  ] as const)await expect(inventariarArquivosBackup([...references],[...roots])).rejects.toThrow();
}));
it('lê apenas campos de armazenamento conhecidos em transação global somente leitura',async()=>{
  const calls:string[]=[];let released=false;
  const client={query:async(sql:string)=>{calls.push(sql);return {rows:sql.startsWith('SELECT arquivo_path')?[{arquivo_path:'/original',arquivo_hash:hash}]:sql.startsWith('SELECT snapshot_json')?[{snapshot_json:{html:'não é arquivo',anexos:[{path:'/attachment',hash,bytes:5}]}}]:[]};},release:()=>{released=true;}};
  const pool={connect:async()=>client} as unknown as Pool;
  expect(await lerReferenciasBackupPostgres(pool)).toEqual([{source:'/original',sha256:hash},{source:'/attachment',sha256:hash,bytes:5}]);
  expect(calls[0]).toBe('BEGIN');expect(calls[1]).toContain('READ ONLY');expect(calls.at(-1)).toBe('COMMIT');expect(released).toBe(true);
});
it('snapshot sem contrato válido reverte o inventário em vez de omitir anexos',async()=>{
  const calls:string[]=[];const client={query:async(sql:string)=>{calls.push(sql);return {rows:sql.startsWith('SELECT snapshot_json')?[{snapshot_json:{anexos:[{path:'/bad'}]}}]:[]};},release:()=>{}};
  await expect(lerReferenciasBackupPostgres({connect:async()=>client} as unknown as Pool)).rejects.toThrow();expect(calls.at(-1)).toBe('ROLLBACK');
});
