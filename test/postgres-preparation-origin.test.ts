import {it,expect,vi} from 'vitest';
import type {PoolClient,Pool} from 'pg';
import {auditarPreparoPostgres,validarOrigemPreparo,origemSistemaPreparo} from '../src/postgres-preparation-origin.js';
import {prepararEnviosPostgres} from '../src/postgres-preparacao-envios.js';
it('audita rotina como sistema sem inventar usuário/IP mesmo se receber evento HTTP',async()=>{
  const query=vi.fn(),client={query} as unknown as PoolClient;
  await auditarPreparoPostgres(client,3,origemSistemaPreparo,'ENVIO_PREPARACAO_CONCLUIDA',{envio_id:9},{ip:'192.0.2.1',user_agent:'forjado'});
  expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO auditoria'),
    [null,'ENVIO_PREPARACAO_CONCLUIDA',3,expect.any(Number),'','preparacao-envios-v1',expect.any(String),expect.stringContaining('"tipo":"sistema"')]);
});
it('audita ator humano confiável e rejeita origem/campos inválidos antes do banco',async()=>{
  const query=vi.fn(),client={query} as unknown as PoolClient;
  await auditarPreparoPostgres(client,3,{tipo:'usuario',usuario_id:7},'ENVIO_PREPARACAO_INICIADA',{envio_id:9},{ip:'127.0.0.1',request_id:'request-1'});
  expect(query).toHaveBeenCalledWith(expect.any(String),[7,'ENVIO_PREPARACAO_INICIADA',3,expect.any(Number),'127.0.0.1','','request-1',expect.stringContaining('"usuario_id":7')]);
  expect(()=>validarOrigemPreparo({tipo:'sistema',rotina:'preparacao-envios-v1',usuario_id:7})).toThrow();
  const pool={connect:vi.fn()} as unknown as Pool;
  await expect(prepararEnviosPostgres(pool,3,undefined,undefined,{origem:{tipo:'usuario',usuario_id:0}})).rejects.toThrow();
  expect(pool.connect).not.toHaveBeenCalled();
});
