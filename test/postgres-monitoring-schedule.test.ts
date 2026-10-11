import {it,expect,vi} from 'vitest';
import type {Pool} from 'pg';
import {agendarMonitoramentoPostgres} from '../src/postgres-monitoring-schedule.js';
function pool(pending=false,failAudit=false){
  const query=vi.fn(async(sql:string)=>{
    if(sql.startsWith('SELECT id FROM escritorios')||sql.startsWith('SELECT id,agenda_ativa'))return {rowCount:1,rows:[{id:1}]};
    if(sql.startsWith('SELECT floor'))return {rows:[{janela:'100',agora:'1800000000000'}]};
    if(sql.startsWith('SELECT id FROM execucoes'))return {rowCount:pending?1:0,rows:[]};
    if(sql.startsWith('INSERT INTO execucoes'))return {rows:[{id:7}]};
    if(sql.startsWith('INSERT INTO auditoria')&&failAudit)throw new Error('audit failure');
    return {rows:[]};
  });
  const release=vi.fn();return {db:{connect:vi.fn(async()=>({query,release}))} as unknown as Pool,query,release};
}
it('cria solicitação automática sem inventar usuário e audita na mesma transação',async()=>{
  const p=pool();expect(await agendarMonitoramentoPostgres(p.db,3,{monitoramento_id:2,intervalo_minutos:60})).toEqual({criada:true,id:7});
  expect(p.query).toHaveBeenCalledWith(expect.stringContaining("VALUES($1,NULL,'solicitada'"),[3,expect.stringContaining('"origem":"agendada"')]);
  expect(p.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO auditoria'),[3,1800000000000,expect.any(String),expect.stringContaining('"ator_tipo":"sistema"')]);
  expect(p.query).toHaveBeenLastCalledWith('COMMIT');expect(p.release).toHaveBeenCalledOnce();
});
it('não duplica janela nem trabalho pendente e rejeita contexto injetado/intervalo inválido',async()=>{
  const p=pool(true);expect(await agendarMonitoramentoPostgres(p.db,3,{monitoramento_id:2,intervalo_minutos:60})).toEqual({criada:false});
  expect(p.query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
  await expect(agendarMonitoramentoPostgres(p.db,3,{monitoramento_id:2,intervalo_minutos:59})).rejects.toThrow();
  await expect(agendarMonitoramentoPostgres(p.db,3,{monitoramento_id:2,intervalo_minutos:60,escritorio_id:4})).rejects.toThrow();
});
it('reverte criação se auditoria falhar',async()=>{
  const p=pool(false,true);await expect(agendarMonitoramentoPostgres(p.db,3,{monitoramento_id:2,intervalo_minutos:60})).rejects.toThrow('audit failure');
  expect(p.query).toHaveBeenLastCalledWith('ROLLBACK');expect(p.release).toHaveBeenCalledOnce();
});
it('revalida pausa e intervalo alterado antes de criar uma solicitação persistente',async()=>{
  const p=pool();
  expect(await agendarMonitoramentoPostgres(p.db,3,{monitoramento_id:2,intervalo_minutos:60},{exigirAgenda:true})).toEqual({criada:false});
  expect(p.query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
  p.query.mockImplementation(async(sql:string)=>sql.startsWith('SELECT id,agenda_ativa')?
    {rowCount:1,rows:[{id:2,agenda_ativa:true,agenda_intervalo_minutos:120}]}:{rowCount:1,rows:[]});
  expect(await agendarMonitoramentoPostgres(p.db,3,{monitoramento_id:2,intervalo_minutos:60},{exigirAgenda:true})).toEqual({criada:false});
});
