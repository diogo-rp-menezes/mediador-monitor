import {it,expect,vi} from 'vitest';
import type {Pool} from 'pg';
import {conferirEncerramentoAbruptoMonitoramento} from '../src/postgres-monitoring-crash-check.js';
const fixture={officeA:2,officeB:3,monitorA:1,monitorB:2,actor:1};
it('recusa banco operacional antes de criar solicitação ou subprocesso',async()=>{
  const query=vi.fn(async()=>({rows:[{nome:'mediador'}]})),admin={query} as unknown as Pool;
  const runtimeQuery=vi.fn(),runtime={query:runtimeQuery} as unknown as Pool;
  await expect(conferirEncerramentoAbruptoMonitoramento(runtime,admin,fixture)).rejects.toThrow('descartável');
  expect(query).toHaveBeenCalledOnce();expect(runtimeQuery).not.toHaveBeenCalled();
});
it('recusa pool divergente antes de criar solicitação ou subprocesso',async()=>{
  const query=vi.fn(async()=>({rows:[{nome:'mediador_monitor_test_'+'b'.repeat(32)}]})),admin={query} as unknown as Pool;
  const runtimeQuery=vi.fn(async()=>({rows:[{nome:'mediador'}]})),runtime={query:runtimeQuery} as unknown as Pool;
  await expect(conferirEncerramentoAbruptoMonitoramento(runtime,admin,fixture)).rejects.toThrow('descartável');
  expect(query).toHaveBeenCalledOnce();expect(runtimeQuery).toHaveBeenCalledOnce();
});
