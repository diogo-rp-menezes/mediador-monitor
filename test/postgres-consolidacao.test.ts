import {expect,it,vi} from 'vitest';
import type {Pool} from 'pg';
import {vistaInterpretacaoPostgres} from '../src/postgres-consolidacao.js';

it('não expõe interpretação de base que o escritório não pode consultar',async()=>{
  const client={query:vi.fn()
    .mockResolvedValueOnce({rows:[],rowCount:0})
    .mockResolvedValueOnce({rows:[],rowCount:0})
    .mockResolvedValueOnce({rows:[],rowCount:0})
    .mockResolvedValueOnce({rows:[],rowCount:0})
    .mockResolvedValueOnce({rows:[],rowCount:0}),release:vi.fn()};
  const pool={connect:vi.fn().mockResolvedValue(client)} as unknown as Pool;
  await expect(vistaInterpretacaoPostgres(pool,33,'DF000001/2026')).rejects.toMatchObject({status:404});
  expect(client.query).toHaveBeenNthCalledWith(4,expect.stringContaining('escritorio_id=$1 AND base=$2'),[33,'DF000001/2026']);
  expect(client.query).toHaveBeenNthCalledWith(5,expect.stringContaining('escritorio_id=$1 AND numero_registro=$2'),[33,'DF000001/2026']);
});
