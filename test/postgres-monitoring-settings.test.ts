import {it,expect,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {resolverLimitesMonitoramento,salvarLimitesMonitoramentoPostgres} from '../src/postgres-monitoring-settings.js';
it('usa padrões sem configuração e nunca ultrapassa teto mesmo se o ambiente for reduzido',()=>{
  expect(resolverLimitesMonitoramento(3,{},{}).efetivos).toEqual({limite_hora:20,duracao_segundos:900,volume_mib:200});
  expect(resolverLimitesMonitoramento(3,{monitor_limite_hora:15,monitor_duracao_segundos:600,monitor_volume_mib:100},
    {PGMONITOR_LIMIT_HOUR:'10',PGMONITOR_MAX_SECONDS:'300',PGMONITOR_MAX_MIB:'50'}).efetivos)
    .toEqual({limite_hora:10,duracao_segundos:300,volume_mib:50});
  expect(()=>resolverLimitesMonitoramento(3,{monitor_volume_mib:0},{})).toThrow();
});
it('rejeita corpo injetado, teto excedido e escritório indisponível; permite restaurar padrão',async()=>{
  const query=vi.fn(async()=>({rowCount:1,rows:[]})),client={query} as unknown as PoolClient;
  const input={limite_hora:null,duracao_segundos:null,volume_mib:null};
  await expect(salvarLimitesMonitoramentoPostgres(client,3,{...input,escritorio_id:4})).rejects.toThrow();expect(query).not.toHaveBeenCalled();
  // A controlled platform ceiling makes this rejection independent of local configuration.
  vi.stubEnv('PGMONITOR_MAX_MIB_OFFICE_3','1');
  try{await expect(salvarLimitesMonitoramentoPostgres(client,3,{...input,volume_mib:2})).rejects.toMatchObject({status:400});}
  finally{vi.unstubAllEnvs();}
  expect(query).not.toHaveBeenCalled();await salvarLimitesMonitoramentoPostgres(client,3,input);
  expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO limites_monitoramento_escritorio'),[3,null,null,null]);
  query.mockResolvedValueOnce({rowCount:0,rows:[]});await expect(salvarLimitesMonitoramentoPostgres(client,3,input)).rejects.toMatchObject({status:409});
});
