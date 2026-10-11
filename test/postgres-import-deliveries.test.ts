import {expect,it} from 'vitest';
import {converterEstadoEnvioLegado,converterEstadoNotificacaoLegada} from '../src/postgres-import-deliveries.js';

it.each(['bloqueado','revisao','na_fila'])('envio %s exige nova preparação sem carregar aprovação',status=>{
  const raw={status,snapshot_json:'prévia antiga',aprovado_por:'Admin',aprovado_em:'data',contexto_aprovacao:'hash',proxima_tentativa:'data',message_id:'id'};
  const result=converterEstadoEnvioLegado(raw);
  expect(result).toMatchObject({status:'bloqueado',snapshot_json:null,aprovado_por:null,aprovado_em:null,contexto_aprovacao:null,proxima_tentativa:null,message_id:'id'});
  expect(raw.snapshot_json).toBe('prévia antiga');expect(raw.status).toBe(status);
});
it.each(['preparando','enviando'])('envio interrompido %s exige conferência',status=>{
  expect(converterEstadoEnvioLegado({status,message_id:'original'})).toMatchObject({status:'incerto',message_id:'original',proxima_tentativa:null});
});
it.each(['enviado','falhou','cancelado','incerto'])('preserva histórico de envio %s',status=>{
  expect(converterEstadoEnvioLegado({status,tentativas:3,snapshot_json:'histórico'})).toMatchObject({status,tentativas:3,snapshot_json:'histórico'});
});
it('notificações pendentes são canceladas e interrupções permanecem incertas',()=>{
  expect(converterEstadoNotificacaoLegada({estado:'pendente'}).estado).toBe('cancelado');
  expect(converterEstadoNotificacaoLegada({estado:'enviando'}).estado).toBe('incerto');
  expect(converterEstadoNotificacaoLegada({estado:'enviado'}).estado).toBe('enviado');
  expect(()=>converterEstadoNotificacaoLegada({estado:'desconhecido'})).toThrow();
  expect(()=>converterEstadoEnvioLegado({status:'desconhecido'})).toThrow();
});
