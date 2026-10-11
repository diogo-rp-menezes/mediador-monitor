import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { criarAutenticacaoPostgres, exigirSessaoPostgres } from '../src/postgres-autenticacao.js';

it('recusa token de sessão malformado antes de consultar o pool', async () => {
  const pool={connect:vi.fn(),query:vi.fn()} as unknown as Pool;
  await expect(exigirSessaoPostgres(pool,'token-invalido')).rejects.toMatchObject({status:401});
  expect(pool.connect).not.toHaveBeenCalled();
  expect(pool.query).not.toHaveBeenCalled();
});

it('valida e-mail de login antes de abrir conexão', async () => {
  const pool={connect:vi.fn(),query:vi.fn()} as unknown as Pool;
  await expect(criarAutenticacaoPostgres(pool).login({email:'inválido',senha:'senha'})).rejects.toThrow();
  expect(pool.connect).not.toHaveBeenCalled();
  expect(pool.query).not.toHaveBeenCalled();
});

it('rejeita recuperação com campos extras e senha abaixo da política antes de conectar', async () => {
  const pool={connect:vi.fn(),query:vi.fn()} as unknown as Pool;
  const auth=criarAutenticacaoPostgres(pool);
  await expect(auth.solicitarRecuperacao({email:'user@example.test',extra:true})).rejects.toThrow();
  await expect(auth.recuperar({token:'A'.repeat(43),senha:'curta'})).rejects.toThrow();
  expect(pool.connect).not.toHaveBeenCalled();
  expect(pool.query).not.toHaveBeenCalled();
});
