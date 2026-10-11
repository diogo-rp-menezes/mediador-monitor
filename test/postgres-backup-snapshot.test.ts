import {it,expect} from 'vitest';
import type {Pool} from 'pg';
import {validarSnapshotBackup,comSnapshotBackupIsolado} from '../src/postgres-backup-snapshot.js';
import {lerReferenciasBackupPostgres} from '../src/postgres-backup-inventory.js';
const database='mediador_backup_test_'+'a'.repeat(32),snapshot='00000003-000000AF-1';
it('recusa snapshot malformado e origem operacional antes de conectar',async()=>{
  for(const value of ['',"00000003-000000AF-1'; DROP TABLE x",'../file','abc'])expect(()=>validarSnapshotBackup(value)).toThrow();
  const pool={connect:async()=>{throw new Error('Não deve conectar');}} as unknown as Pool;
  await expect(comSnapshotBackupIsolado(pool,'mediador',async()=>{})).rejects.toThrow('origem de ensaio');
  await expect(lerReferenciasBackupPostgres(pool,"';" )).rejects.toThrow('Snapshot');
});
it('mantém bloqueio até terminar o trabalho e reverte/libera conexão se ele falhar',async()=>{
  const calls:string[]=[];let released=false;
  const client={query:async(sql:string)=>{calls.push(sql);return {rows:sql.startsWith('SELECT current_database')?[{nome:database}]:sql.startsWith('SELECT tablename')?[{tablename:'registros'},{tablename:'nome"especial'}]:sql.startsWith('SELECT pg_export_snapshot')?[{snapshot}]:[]};},release:()=>{released=true;}};
  await expect(comSnapshotBackupIsolado({connect:async()=>client} as unknown as Pool,database,async value=>{expect(value).toBe(snapshot);expect(calls.some(sql=>sql.includes('IN SHARE MODE'))).toBe(true);expect(calls).not.toContain('COMMIT');throw new Error('Cópia interrompida');})).rejects.toThrow('Cópia interrompida');
  expect(calls).toContain('LOCK TABLE public."registros",public."nome""especial" IN SHARE MODE');expect(calls.at(-1)).toBe('ROLLBACK');expect(released).toBe(true);
});
it('importa snapshot antes de consultar contexto ou referências',async()=>{
  const calls:string[]=[];const client={query:async(sql:string)=>{calls.push(sql);return {rows:[]};},release:()=>{}};
  expect(await lerReferenciasBackupPostgres({connect:async()=>client} as unknown as Pool,snapshot)).toEqual([]);
  expect(calls.slice(0,3)).toEqual(['BEGIN','SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',`SET TRANSACTION SNAPSHOT '${snapshot}'`]);
});
