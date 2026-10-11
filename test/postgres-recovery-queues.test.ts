import {it,expect} from 'vitest';
import {classificarFilaRecuperacao,resumirTentativasRecuperacao} from '../src/postgres-recovery-queues.js';

it('não confunde estado importado desativado com entrega e identifica divergências',()=>{
  expect(classificarFilaRecuperacao('na_fila','bloqueado','bloqueado')).toBe('estado_importado_preservado');
  expect(classificarFilaRecuperacao('pendente','cancelado','cancelado')).toBe('estado_importado_preservado');
  expect(classificarFilaRecuperacao('na_fila',null,'bloqueado')).toBe('registro_destino_ausente');
  expect(classificarFilaRecuperacao('na_fila','revisao','bloqueado')).toBe('alteracao_exige_revisao');
});

it('sinaliza estado enviado sem aceitação, message-id divergente e resultados incertos/desconhecidos sem expor valores',()=>{
  expect(resumirTentativasRecuperacao([],'enviado',null).alertas).toContain('estado_enviado_sem_tentativa_aceita');
  const summary=resumirTentativasRecuperacao([{resultado:'aceito_smtp',message_id:'privado-1'},{resultado:'incerto',message_id:'privado-2'},{resultado:'valor-sigiloso',message_id:null}],'enviado','privado-3');
  expect(summary.aceitacoes_smtp_registradas).toBe('1');
  expect(summary.resultados_incertos).toBe('1');
  expect(summary.alertas).toEqual(['message_id_sem_correspondencia_na_aceitacao','resultado_tentativa_desconhecido','tentativa_incerta_exige_conferencia']);
  expect(JSON.stringify(summary)).not.toMatch(/privado|sigiloso/);
  expect(resumirTentativasRecuperacao([{resultado:'enviado',message_id:'id'}],'enviado','id').alertas).toEqual([]);
});
it('distingue histórico enviado, envio posterior registrado e resultados que exigem conferência',()=>{
  expect(classificarFilaRecuperacao('enviado','enviado','enviado')).toBe('historico_enviado_nao_repetir');
  expect(classificarFilaRecuperacao('na_fila','enviado','bloqueado')).toBe('entrega_posterior_registrada_nao_repetir');
  for(const state of ['preparando','enviando','incerto']){
    expect(classificarFilaRecuperacao(state,'enviado','incerto')).toBe('entrega_exige_conferencia');
    expect(classificarFilaRecuperacao('na_fila',state,'bloqueado')).toBe('entrega_exige_conferencia');
  }
});
