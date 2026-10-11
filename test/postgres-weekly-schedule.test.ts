import {expect,it,vi} from 'vitest';
import type {Pool} from 'pg';
import {AgendaSemanalSchema,janelaSemanal,agendarSemanalPostgres} from '../src/postgres-weekly-schedule.js';
const agenda={dias:[1,2,3,4,5],horario:'08:00',fuso:'America/Sao_Paulo'};
it('respeita dia, hora e fuso, sem recuperar dias anteriores',()=>{
  expect(janelaSemanal(agenda,new Date('2026-10-12T10:59:00Z'))).toBeNull();
  expect(janelaSemanal(agenda,new Date('2026-10-12T11:00:00Z'))).toBe('2026-10-12');
  expect(janelaSemanal(agenda,new Date('2026-10-12T23:00:00Z'))).toBe('2026-10-12');
  expect(janelaSemanal(agenda,new Date('2026-10-11T12:00:00Z'))).toBeNull();
  expect(()=>AgendaSemanalSchema.parse({...agenda,fuso:'invalid/fuso'})).toThrow();
  expect(()=>AgendaSemanalSchema.parse({...agenda,dias:[]})).toThrow();
  expect(()=>AgendaSemanalSchema.parse({...agenda,horario:'24:00'})).toThrow();
});
it('horário repetido no fim do horário de verão usa a mesma janela diária',()=>{
  const config={dias:[0],horario:'01:00',fuso:'America/New_York'};
  expect(janelaSemanal(config,new Date('2026-11-01T05:30:00Z'))).toBe('2026-11-01');
  expect(janelaSemanal(config,new Date('2026-11-01T06:30:00Z'))).toBe('2026-11-01');
});
it('revalida configuração e pausa, impede duplicação e reverte se auditoria falhar',async()=>{
  let paused=false,pending=false,failAudit=false;
  const query=vi.fn(async(sql:string)=>{
    if(sql.startsWith('SELECT id FROM escritorios'))return {rowCount:1,rows:[{id:3}]};
    if(sql.startsWith('SELECT agenda_ativa'))return {rows:[{agenda_ativa:!paused,agenda_semanal_json:agenda}]};
    if(sql.startsWith('SELECT clock_timestamp'))return {rows:[{agora:new Date('2026-10-12T12:00:00Z')}]};
    if(sql.startsWith('SELECT id FROM execucoes'))return {rowCount:pending?1:0,rows:[]};
    if(sql.startsWith('INSERT INTO execucoes'))return {rows:[{id:9}]};
    if(sql.startsWith('INSERT INTO auditoria')&&failAudit)throw new Error('audit');
    return {rows:[]};
  });
  const pool={connect:async()=>({query,release:vi.fn()})} as unknown as Pool;
  expect(await agendarSemanalPostgres(pool,3,2,agenda)).toEqual({criada:true,id:9});
  expect(query).toHaveBeenLastCalledWith('COMMIT');
  pending=true;expect(await agendarSemanalPostgres(pool,3,2,agenda)).toEqual({criada:false});
  pending=false;paused=true;expect(await agendarSemanalPostgres(pool,3,2,agenda)).toEqual({criada:false});
  paused=false;expect(await agendarSemanalPostgres(pool,3,2,{...agenda,horario:'09:00'})).toEqual({criada:false});
  failAudit=true;await expect(agendarSemanalPostgres(pool,3,2,agenda)).rejects.toThrow('audit');
  expect(query).toHaveBeenLastCalledWith('ROLLBACK');
});
