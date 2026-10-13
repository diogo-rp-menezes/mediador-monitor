import {expect,it} from 'vitest';
import {agendaIssue,nextWeekly} from '../frontend/src/agendas';
it('valida intervalo, dias, horário e fuso',()=>{
  for(const interval of [59,10081,60.5,NaN])expect(agendaIssue(interval,null)).not.toBe('');
  for(const weekly of [{dias:[],horario:'09:00',fuso:'UTC'},{dias:[7],horario:'09:00',fuso:'UTC'},{dias:[1],horario:'24:00',fuso:'UTC'},{dias:[1],horario:'09:00',fuso:'Inexistente'}])expect(agendaIssue(60,weekly)).not.toBe('');
  expect(agendaIssue(10080,{dias:[0,6],horario:'23:59',fuso:'America/Sao_Paulo'})).toBe('');
});
it('calendário semanal respeita dia local e fuso',()=>{expect(nextWeekly({dias:[1],horario:'09:00',fuso:'America/Sao_Paulo'},new Date('2026-10-12T10:00:00Z'))?.toISOString()).toBe('2026-10-12T12:00:00.000Z');});
it('ocorrência futura não confunde horário já passado com semana seguinte',()=>{expect(nextWeekly({dias:[1],horario:'09:00',fuso:'America/Sao_Paulo'},new Date('2026-10-12T12:01:00Z'))?.toISOString()).toBe('2026-10-19T12:00:00.000Z');});
it('calendário segue alteração sazonal do fuso sem offset fixo',()=>{expect(nextWeekly({dias:[0],horario:'03:30',fuso:'America/New_York'},new Date('2026-03-08T06:00:00Z'))?.toISOString()).toBe('2026-03-08T07:30:00.000Z');});
