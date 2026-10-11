import type {Pool} from 'pg';
import {withPostgresTransaction} from './postgres-transaction.js';
import {BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY} from './postgres-backup-gate.js';

export function validarSnapshotBackup(snapshot:string){
  if(!/^[0-9A-F]{8}-[0-9A-F]{8}-[0-9]+$/.test(snapshot))throw new Error('Snapshot PostgreSQL inválido.');
  return snapshot;
}

/** Rehearsal-only database barrier. Filesystem writers must already be drained separately. */
export async function comSnapshotBackupIsolado<T>(pool:Pool,database:string,work:(snapshot:string)=>Promise<T>):Promise<T>{
  if(!/^mediador_backup_test_[a-f0-9]{32}$/.test(database))throw new Error('Snapshot permitido apenas em origem de ensaio.');
  return withPostgresTransaction(pool,async client=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='120s'");
    if((await client.query('SELECT current_database() AS nome')).rows[0]?.nome!==database)throw new Error('Origem divergente.');
    await client.query('SELECT pg_advisory_xact_lock($1,$2)',[BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY]);
    const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    if(!tables.length)throw new Error('Origem sem tabelas.');
    const names=tables.map(row=>'public."'+String(row.tablename).replaceAll('"','""')+'"').join(',');
    await client.query(`LOCK TABLE ${names} IN SHARE MODE`);
    const snapshot=validarSnapshotBackup((await client.query('SELECT pg_export_snapshot() AS snapshot')).rows[0]?.snapshot??'');
    return work(snapshot);
  });
}

