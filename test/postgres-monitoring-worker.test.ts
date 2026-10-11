import {it,expect,vi} from 'vitest';
import type {Pool} from 'pg';
import {lerArgumentosWorkerMonitoramento,executarCicloMonitoramentoPostgres} from '../src/postgres-monitoring-worker.js';
import {executarSolicitacaoMonitoramentoPostgres} from '../src/postgres-monitoring-executor.js';
vi.mock('../src/postgres-monitoring-executor.js',()=>({executarSolicitacaoMonitoramentoPostgres:vi.fn().mockResolvedValue({reservada:false})}));
vi.mock('../src/postgres-monitoring-lock.js',()=>({comExclusividadeMonitoramentoPostgres:vi.fn(async(_pool,_office,work,signal)=>({adquirido:true,result:await work(signal)}))}));
it('exige escritório explícito e usa ciclo único por padrão',()=>{
  expect(lerArgumentosWorkerMonitoramento(['--escritorio','3'])).toEqual({office:3,once:true});
  expect(lerArgumentosWorkerMonitoramento(['--escritorio','3','--continuous'])).toEqual({office:3,once:false});
  for(const args of [[],['--escritorio','0'],['--escritorio','1.5'],['--escritorio','3','--all'],['--escritorio','9007199254740992']])
    expect(()=>lerArgumentosWorkerMonitoramento(args)).toThrow('Uso');
});
it('encaminha somente escritório e sinal escolhidos, sem criar solicitação',async()=>{
  const pool={} as Pool,work=vi.fn(),signal=new AbortController().signal;
  expect(await executarCicloMonitoramentoPostgres(pool,3,{work,signal})).toEqual({reservada:false});
  expect(executarSolicitacaoMonitoramentoPostgres).toHaveBeenLastCalledWith(pool,3,work,{signal});
});
