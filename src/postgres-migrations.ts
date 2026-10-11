import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import {BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY} from './postgres-backup-gate.js';
import {ErroCadastro} from './cadastros.js';

const advisoryLockId = 817_204_611;
const migrationName = /^\d{3}_[a-z0-9_]+\.sql$/;

export async function migratePostgres(pool: Pool, directory = resolve(process.cwd(), 'migrations', 'postgres')): Promise<string[]> {
  const files = readdirSync(directory).filter(file => migrationName.test(file)).sort();
  const client = await pool.connect();
  const applied: string[] = [];
  let participant=false,migrationLocked=false,broken=false;
  try {
    try{participant=(await client.query('SELECT pg_try_advisory_lock_shared($1,$2) AS adquirido',[BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY])).rows[0].adquirido===true;}catch(error){broken=true;throw error;}
    if(!participant)throw new ErroCadastro('Backup em andamento. Migrações não iniciadas.',409);
    await client.query('SELECT pg_advisory_lock($1)', [advisoryLockId]);
    migrationLocked=true;
    await client.query(`CREATE TABLE IF NOT EXISTS mediador_schema_migrations (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const known = new Map((await client.query<{version:string;checksum:string}>('SELECT version,checksum FROM mediador_schema_migrations')).rows.map(row => [row.version,row.checksum]));
    for (const file of files) {
      const sql = readFileSync(resolve(directory,file),'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = known.get(file);
      if (previous) {
        if (previous !== checksum) throw new Error(`A migração PostgreSQL aplicada ${file} foi alterada. Crie uma nova migração em vez de editar a existente.`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO mediador_schema_migrations(version,checksum) VALUES($1,$2)',[file,checksum]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return applied;
  } finally {
    try{
      if(migrationLocked&&(await client.query('SELECT pg_advisory_unlock($1) AS liberado',[advisoryLockId])).rows[0]?.liberado!==true)broken=true;
      if(participant&&(await client.query('SELECT pg_advisory_unlock_shared($1,$2) AS liberado',[BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY])).rows[0]?.liberado!==true)broken=true;
    }catch{broken=true;}finally{client.release(broken?new Error('Conexão de migração incerta.'):undefined);}
    if(broken)throw new Error('Migração não confirmada: conexão ou liberação de bloqueio incerta.');
  }
}

