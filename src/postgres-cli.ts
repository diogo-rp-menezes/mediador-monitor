import { criarPoolPostgres } from './postgres.js';
import { migratePostgres } from './postgres-migrations.js';

const pool = criarPoolPostgres();
try {
  const applied = await migratePostgres(pool);
  console.log(applied.length ? `Migrações PostgreSQL aplicadas: ${applied.join(', ')}` : 'PostgreSQL já está atualizado.');
} catch (error) {
  console.error('Falha ao migrar o PostgreSQL:', (error as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

