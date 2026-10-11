import {it,expect,vi} from 'vitest';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import Database from 'better-sqlite3';
import type {Pool} from 'pg';
import {importarPacoteOperacionalPostgres} from '../src/postgres-operational-import.js';
import {importarNucleoIsoladoPostgres} from '../src/postgres-import-core.js';
import {sqliteBloqueadoParaCorte} from '../src/sqlite-cutover-lock.js';
import {conferirArquivosPacoteMigracao} from '../src/postgres-migration-package.js';
vi.mock('../src/postgres-migration-package.js',()=>({conferirArquivosPacoteMigracao:vi.fn()}));
async function fixture(work:(source:string)=>Promise<void>){const root=mkdtempSync(join(tmpdir(),'mediador-import-backup-')),source=join(root,'source.sqlite'),db=new Database(source);db.exec('CREATE TABLE escritorios(id INTEGER)');db.close();try{await work(source);}finally{if(!resolve(root).startsWith(resolve(tmpdir())+sep))throw new Error('Limpeza inválida');rmSync(root,{recursive:true,force:true});}}
function packageFixture(source:string){vi.mocked(conferirArquivosPacoteMigracao).mockReturnValue({file:'manifest.json',manifest:{origem:{snapshot:source,path:source},destino:{database:'mediador'},ensaio:{estado_revisado_validado:true},assinatura:'a'.repeat(64)}} as ReturnType<typeof conferirArquivosPacoteMigracao>);}
function poolFixture(acquired:boolean){const calls:string[]=[];const client={query:async(sql:string)=>{calls.push(sql);if(sql==='SELECT pg_advisory_xact_lock(817204619)')throw new Error('Interrupção após bloqueio');return {rows:sql==='SELECT current_database() nome'?[{nome:'mediador'}]:sql.includes('try_advisory')?[{adquirido:acquired}]:sql.includes('pg_stat_activity')?[{n:'0'}]:[]};},release:()=>{}};return {pool:{connect:async()=>client} as unknown as Pool,calls};}
it('pausa ativa recusa pacote antes de bloquear SQLite ou escrever no destino',()=>fixture(async source=>{packageFixture(source);const before=readFileSync(source),{pool,calls}=poolFixture(false);await expect(importarPacoteOperacionalPostgres(pool,'manifest.json',Buffer.alloc(32),{bloquearOrigemParaCorte:true})).rejects.toMatchObject({status:409});expect(sqliteBloqueadoParaCorte(source)).toBe(false);expect(readFileSync(source).equals(before)).toBe(true);expect(calls.at(-1)).toBe('ROLLBACK');expect(calls.some(sql=>/^(INSERT|UPDATE|DELETE|CREATE|ALTER)/.test(sql))).toBe(false);}));
it('falha posterior mantém bloqueio de corte sem reativar SQLite automaticamente',()=>fixture(async source=>{packageFixture(source);const {pool,calls}=poolFixture(true);await expect(importarPacoteOperacionalPostgres(pool,'manifest.json',Buffer.alloc(32),{bloquearOrigemParaCorte:true})).rejects.toThrow('após bloqueio');expect(sqliteBloqueadoParaCorte(source)).toBe(true);expect(calls.at(-1)).toBe('ROLLBACK');}));
it('importação sem pacote nunca pode solicitar bloqueio de origem',()=>fixture(async source=>{const {pool}=poolFixture(true);await expect(importarNucleoIsoladoPostgres(pool,source,{bloquearOrigemParaCorte:true})).rejects.toThrow('pacote operacional');expect(sqliteBloqueadoParaCorte(source)).toBe(false);}));
