import type { Pool, PoolClient } from 'pg';

/** Runs every unit of work on a dedicated PostgreSQL connection. */
export async function withPostgresTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let lost:Error|undefined,discard=false;
  const onError=(error:Error)=>{lost??=error;discard=true;};
  const onEnd=()=>onError(new Error('Conexão da transação encerrada.'));
  client.on?.('error',onError);client.on?.('end',onEnd);
  try {
    await client.query('BEGIN');
    if(lost)throw lost;
    const result = await work(client);
    if(lost)throw lost;
    await client.query('COMMIT');
    if(lost)throw lost;
    return result;
  } catch (error) {
    if(!lost){try { await client.query('ROLLBACK'); } catch { discard=true; /* Keep the original operation error. */ }}
    throw error;
  } finally {
    client.removeListener?.('error',onError);client.removeListener?.('end',onEnd);
    // Never recycle a connection whose transaction could not be closed reliably.
    if(discard)client.release(new Error('Conexão da transação descartada.'));else client.release();
  }
}

/** Sets the trusted office scope only for this transaction; PostgreSQL clears it at commit/rollback. */
export async function withPostgresOfficeTransaction<T>(pool: Pool, officeId: number, work: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!Number.isSafeInteger(officeId) || officeId < 1) throw new Error('Contexto PostgreSQL inválido.');
  return withPostgresTransaction(pool, async client => {
    await client.query("SELECT set_config('app.global_access', 'false', true)");
    await client.query("SELECT set_config('app.escritorio_id', $1, true)", [String(officeId)]);
    return work(client);
  });
}

/** Explicitly marks authentication/platform work that must inspect multiple tenants. */
export async function withPostgresGlobalTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  return withPostgresTransaction(pool, async client => {
    await client.query("SELECT set_config('app.escritorio_id', '', true)");
    await client.query("SELECT set_config('app.global_access', 'true', true)");
    return work(client);
  });
}

