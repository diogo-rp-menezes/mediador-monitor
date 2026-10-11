import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { resolverContextoPostgres } from '../src/postgres-autorizacao.js';

it('rejeita contexto malformado antes de consultar o PostgreSQL', async () => {
  const pool={query:vi.fn(),connect:vi.fn()} as unknown as Pool;
  const identity={usuario_id:1,nome:'Pessoa',email:'pessoa@example.test',papel_plataforma:null,sessao_hash:'a'.repeat(64),expira_em:Date.now()+60_000};
  await expect(resolverContextoPostgres(pool,identity,{tipo:'escritorio',id:'1'})).rejects.toThrow();
  expect(pool.query).not.toHaveBeenCalled();
  expect(pool.connect).not.toHaveBeenCalled();
});
