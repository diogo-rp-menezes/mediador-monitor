import {it,expect,vi} from 'vitest';
import type {Pool} from 'pg';
import {limiteHoraMonitoramento,limiteDuracaoMonitoramentoMs,limiteVolumeMonitoramentoBytes,conferirVolumeMonitoramento} from '../src/postgres-monitoring-limits.js';
import {reservarMonitoramentoPostgres} from '../src/postgres-monitoring-reservation.js';
it('configura padrão e limite específico sem compartilhar contador entre escritórios',()=>{
  expect(limiteHoraMonitoramento(3,{})).toBe(20);
  const env={PGMONITOR_LIMIT_HOUR:'10',PGMONITOR_LIMIT_HOUR_OFFICE_3:'2'};
  expect(limiteHoraMonitoramento(3,env)).toBe(2);expect(limiteHoraMonitoramento(4,env)).toBe(10);
  for(const value of ['0','1001','1.5','Infinity',''])expect(()=>limiteHoraMonitoramento(3,{PGMONITOR_LIMIT_HOUR:value})).toThrow();
});
it('quota esgotada mantém solicitação pendente e não tenta selecionar ou iniciar trabalho',async()=>{
  const query=vi.fn(async(sql:string)=>sql.includes('count(*)')?{rows:[{quantidade:2}],rowCount:1}:
    sql.includes("status='executando'")?{rows:[],rowCount:0}:{rows:[{id:3}],rowCount:1});
  const pool={connect:vi.fn(async()=>({query,release:vi.fn()}))} as unknown as Pool;
  expect(await reservarMonitoramentoPostgres(pool,3,{limiteHora:2})).toBeNull();
  expect(query.mock.calls.some(([sql])=>sql.includes('SKIP LOCKED')||sql.startsWith('UPDATE'))).toBe(false);
  expect(query).toHaveBeenCalledWith('COMMIT');
});
it('configura duração por escritório e rejeita valores fora do intervalo',()=>{
  expect(limiteDuracaoMonitoramentoMs(3,{})).toBe(900000);
  expect(limiteDuracaoMonitoramentoMs(3,{PGMONITOR_MAX_SECONDS:'100',PGMONITOR_MAX_SECONDS_OFFICE_3:'60'})).toBe(60000);
  for(const value of ['0','9','3601','1.5',''])expect(()=>limiteDuracaoMonitoramentoMs(3,{PGMONITOR_MAX_SECONDS:value})).toThrow();
});
it('soma volume entre tipos, aceita fronteira exata e rejeita evidência inválida',()=>{
  expect(conferirVolumeMonitoramento({convencao:{originais:[{bytes:60}]}},[{bytes:40}],100)).toBe(100);
  expect(()=>conferirVolumeMonitoramento({convencao:{originais:[{bytes:60}]}},[{bytes:41}],100)).toThrow('volume');
  expect(()=>conferirVolumeMonitoramento({},[{bytes:-1}],100)).toThrow('Evidência');
  expect(limiteVolumeMonitoramentoBytes(3,{})).toBe(200*1024*1024);
  expect(limiteVolumeMonitoramentoBytes(3,{PGMONITOR_MAX_MIB_OFFICE_3:'1'})).toBe(1024*1024);
  expect(()=>limiteVolumeMonitoramentoBytes(3,{PGMONITOR_MAX_MIB:'1025'})).toThrow();
});
