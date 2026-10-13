import {it,expect,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {solicitarMonitoramentoPostgres,cancelarSolicitacaoMonitoramentoPostgres,listarSolicitacoesMonitoramentoPostgres} from '../src/postgres-monitoring-requests.js';
function client(results:unknown[]){const query=vi.fn();for(const value of results)query.mockResolvedValueOnce(value);return {query} as unknown as PoolClient;}
it('deriva escritório e ator dos argumentos confiáveis e impede injeção no corpo',async()=>{
  const db=client([{rowCount:1},{rowCount:1},{rowCount:0},{rows:[{id:9}]}]);
  expect(await solicitarMonitoramentoPostgres(db,3,7,{monitoramento_id:2})).toBe(9);
  expect(db.query).toHaveBeenLastCalledWith(expect.stringContaining('INSERT'),[3,7,JSON.stringify({formato:'monitoramento-execucao-v1',monitoramento_id:2,origem:'manual'})]);
  await expect(solicitarMonitoramentoPostgres(db,3,7,{monitoramento_id:2,escritorio_id:4})).rejects.toThrow();
});
it('recusa escritório inativo, filtro alheio/inativo e duplicação pendente',async()=>{
  await expect(solicitarMonitoramentoPostgres(client([{rowCount:0}]),3,7,{monitoramento_id:2})).rejects.toThrow('indisponível');
  await expect(solicitarMonitoramentoPostgres(client([{rowCount:1},{rowCount:0}]),3,7,{monitoramento_id:2})).rejects.toThrow('não encontrado');
  const db=client([{rowCount:1},{rowCount:1},{rowCount:1}]);
  await expect(solicitarMonitoramentoPostgres(db,3,7,{monitoramento_id:2})).rejects.toThrow('pendente');
  expect(db.query).toHaveBeenCalledTimes(3);
});
it('lista somente formato novo e cancela apenas solicitação pendente do escritório',async()=>{
  const db=client([{rows:[{id:1}]},{rowCount:1},{rowCount:0},{rowCount:0}]);
  expect(await listarSolicitacoesMonitoramentoPostgres(db,3)).toEqual([{id:1}]);
  expect(db.query).toHaveBeenLastCalledWith(expect.stringContaining("(status='solicitada' OR (status='executando' AND detalhes_json ? 'reserva_token')) AND NOT COALESCE"),[3]);
  expect(db.query).toHaveBeenLastCalledWith(expect.stringContaining("status='executando' AS recuperavel"),[3]);
  await cancelarSolicitacaoMonitoramentoPostgres(db,3,1);
  expect(db.query).toHaveBeenLastCalledWith(expect.stringContaining("status='solicitada'"),[1,3]);
  await expect(cancelarSolicitacaoMonitoramentoPostgres(db,3,2)).rejects.toThrow('worker');
});
