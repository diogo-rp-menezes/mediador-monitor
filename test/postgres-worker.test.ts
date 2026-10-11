import {expect,it,vi} from 'vitest';
import type {Pool} from 'pg';
import {executarCicloFilasPostgres} from '../src/postgres-worker.js';
import {processarFilaPostgres} from '../src/postgres-fila-envios.js';
import {processarNotificacoesPublicacaoPostgres} from '../src/postgres-notificacoes-publicacoes.js';
vi.mock('../src/postgres-fila-envios.js',()=>({processarFilaPostgres:vi.fn()}));
vi.mock('../src/postgres-notificacoes-publicacoes.js',()=>({processarNotificacoesPublicacaoPostgres:vi.fn()}));
function pool(){const client={query:vi.fn(async(sql:string)=>({rows:sql.startsWith('SELECT e.id')?[{id:3},{id:4}]:[],rowCount:2})),release:vi.fn()};return {connect:vi.fn(async()=>client)} as unknown as Pool;}
it('isola falha de uma fila e continua os demais escritórios',async()=>{
  vi.mocked(processarFilaPostgres).mockReset().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({enviados:1,falhas:0,ignorados:0});
  vi.mocked(processarNotificacoesPublicacaoPostgres).mockReset().mockResolvedValue({enviadas:1,falhas:0,canceladas:0});
  const onError=vi.fn();
  await expect(executarCicloFilasPostgres(pool(),{onError})).resolves.toEqual({escritorios:2,envios:1,notificacoes:2,falhas:1});
  expect(onError).toHaveBeenCalledWith(3,'envios',expect.any(Error));
  expect(processarFilaPostgres).toHaveBeenLastCalledWith(expect.anything(),4,{limite:10});
});
it('interrupção impede iniciar trabalho em outro escritório',async()=>{
  const controller=new AbortController();
  vi.mocked(processarFilaPostgres).mockReset().mockImplementationOnce(async()=>{controller.abort();return {enviados:1,falhas:0,ignorados:0};});
  vi.mocked(processarNotificacoesPublicacaoPostgres).mockReset();
  await expect(executarCicloFilasPostgres(pool(),{signal:controller.signal})).resolves.toEqual({escritorios:1,envios:1,notificacoes:0,falhas:0});
  expect(processarFilaPostgres).toHaveBeenCalledOnce();expect(processarNotificacoesPublicacaoPostgres).not.toHaveBeenCalled();
});
