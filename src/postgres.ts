import 'dotenv/config';
import dotenv from 'dotenv';
import { Pool, type PoolConfig } from 'pg';

dotenv.config({ path: '.env.docker', override: false });

/**
 * Connection factory for the PostgreSQL target, the only operational store.
 */
export function postgresConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  const port = Number(env.PGPORT || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PGPORT inválida.');
  const sslMode = (env.PGSSLMODE || 'disable').toLowerCase();
  if (!['disable', 'require', 'verify-ca', 'verify-full'].includes(sslMode)) throw new Error('PGSSLMODE inválido.');
  return {
    host: env.PGHOST || '127.0.0.1',
    port,
    database: env.PGDATABASE || 'mediador',
    user: env.PGUSER || 'mediador',
    password: env.PGPASSWORD || '',
    ssl: sslMode === 'disable' ? false : { rejectUnauthorized: sslMode === 'verify-ca' || sslMode === 'verify-full' },
    application_name: 'mediador-monitor',
    max: Math.max(1, Math.min(10, Number(env.PGPOOL_MAX) || 5)),
    connectionTimeoutMillis: Math.max(1000, Math.min(30000, Number(env.PGCONNECT_TIMEOUT_MS) || 5000)),
    idleTimeoutMillis: 30000
  };
}

export function criarPoolPostgres(env: NodeJS.ProcessEnv = process.env): Pool {
  return new Pool(postgresConfigFromEnv(env));
}

/** Application pool uses a dedicated least-privilege role; never falls back to the migration/admin account. */
export function postgresRuntimeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  const user=env.PGAPPUSER?.trim(),password=env.PGAPPASSWORD;
  if(!user||!password)throw new Error('Defina PGAPPUSER e PGAPPASSWORD para conectar com o papel runtime.');
  if(user===(env.PGUSER||'mediador'))throw new Error('PGAPPUSER deve ser diferente do usuário administrativo PGUSER.');
  return postgresConfigFromEnv({...env,PGUSER:user,PGPASSWORD:password});
}

export function criarPoolPostgresRuntime(env: NodeJS.ProcessEnv = process.env): Pool {
  return new Pool(postgresRuntimeConfigFromEnv(env));
}

