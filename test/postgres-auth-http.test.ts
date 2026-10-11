import { expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { criarAcessoHttpPostgres } from '../src/postgres-auth-http.js';

it('exige HTTPS para origem externa e rejeita configuração inválida', () => {
  const pool={} as Pool;
  expect(()=>criarAcessoHttpPostgres(pool,{publicUrl:'http://app.example.test'})).toThrow(/exige HTTPS/);
  expect(()=>criarAcessoHttpPostgres(pool,{publicUrl:'https://app.example.test/path'})).toThrow(/somente a origem/);
});

it('não consulta o banco para caminho que não pertence à API de autenticação', async () => {
  const pool={query:vi.fn(),connect:vi.fn()} as unknown as Pool;
  const access=criarAcessoHttpPostgres(pool,{publicUrl:'http://localhost:3000'});
  const req={method:'GET',headers:{host:'localhost:3000'},socket:{remoteAddress:'127.0.0.1'}} as unknown as IncomingMessage;
  const res={writeHead:vi.fn(),end:vi.fn()} as unknown as ServerResponse;
  await expect(access.tratar(req,res,new URL('http://localhost:3000/legacy'),async()=>({}))).resolves.toBe(false);
  expect(pool.query).not.toHaveBeenCalled();
});

it('rejeita Host não autorizado antes de tocar no banco', async () => {
  const pool={query:vi.fn(),connect:vi.fn()} as unknown as Pool;
  const access=criarAcessoHttpPostgres(pool,{publicUrl:'https://app.example.test'});
  const req={method:'GET',headers:{host:'attacker.example.test'},socket:{remoteAddress:'127.0.0.1'}} as unknown as IncomingMessage;
  const res={writeHead:vi.fn(),end:vi.fn()} as unknown as ServerResponse;
  await expect(access.tratar(req,res,new URL('https://attacker.example.test/api/auth/estado'),async()=>({})))
    .rejects.toMatchObject({status:403});
  expect(pool.query).not.toHaveBeenCalled();
});
