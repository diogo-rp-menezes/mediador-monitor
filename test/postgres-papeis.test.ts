import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { bootstrapAdministradorPostgres, possuiAdministradorPlataformaPostgres } from '../src/postgres-papeis.js';

it('valida os dados do bootstrap antes de abrir conexão', async () => {
  const pool={connect:vi.fn(),query:vi.fn()} as unknown as Pool;
  await expect(bootstrapAdministradorPostgres(pool,{nome:'X',email:'not-an-email',senha:'short'})).rejects.toThrow();
  expect(pool.connect).not.toHaveBeenCalled();
});

it('consulta se existe administrador de plataforma sem exigir papel ativo', async () => {
  const pool={query:vi.fn(async()=>({rowCount:1,rows:[{}]}))} as unknown as Pool;
  await expect(possuiAdministradorPlataformaPostgres(pool)).resolves.toBe(true);
  expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("papel='administrador_plataforma' LIMIT 1"));
});
