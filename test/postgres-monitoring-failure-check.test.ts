import {it,expect,vi} from 'vitest';
import type {Pool} from 'pg';
import {conferirPerdaConexaoMonitoramento} from '../src/postgres-monitoring-failure-check.js';
const fixture={officeA:2,officeB:3,monitorA:1,monitorB:2,actor:1};
it('recusa injeção de falha em banco operacional antes de acessar workers',async()=>{
  const admin={query:vi.fn(async()=>({rows:[{nome:'mediador'}]}))} as unknown as Pool;
  const query=vi.fn(),worker={query} as unknown as Pool;
  await expect(conferirPerdaConexaoMonitoramento(worker,worker,admin,fixture)).rejects.toThrow('descartável');
  expect(query).not.toHaveBeenCalled();expect(admin.query).toHaveBeenCalledOnce();
});
it('recusa pools que apontem para outro banco sem encerrar nenhuma conexão',async()=>{
  const query=vi.fn(async()=>({rows:[{nome:'mediador_monitor_test_'+'a'.repeat(32)}]}));
  const admin={query} as unknown as Pool,worker={query:vi.fn(async()=>({rows:[{nome:'mediador'}]}))} as unknown as Pool;
  await expect(conferirPerdaConexaoMonitoramento(worker,worker,admin,fixture)).rejects.toThrow('divergentes');
  expect(query).toHaveBeenCalledOnce();
});
