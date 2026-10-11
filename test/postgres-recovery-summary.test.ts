import {it,expect} from 'vitest';
import {resumirPendenciasRecuperacao} from '../src/postgres-recovery-summary.js';
it('conta cada registro para revisão uma vez e deduplica alertas dentro dele',()=>{
  const result=resumirPendenciasRecuperacao([
    {situacao:'estado_importado_preservado',alertas:[]},
    {situacao:'historico_enviado_nao_repetir',alertas:['incerto','incerto']},
    {situacao:'entrega_posterior_registrada_nao_repetir',alertas:[]},
    {situacao:'entrega_exige_conferencia',alertas:['incerto']}
  ],{envios:'2',notificacoes:'3'});
  expect(result.registros_comparados).toBe('4');expect(result.registros_exigem_revisao).toBe('3');
  expect(result.por_alerta.incerto).toBe('2');expect(result.linhas_fora_do_lote).toBe('5');
  expect(result.autorizacao_reativacao).toBe(false);
});
it('zero divergências não autoriza reativação e contagens grandes mantêm precisão',()=>{
  const result=resumirPendenciasRecuperacao([],{envios:'9007199254740993',notificacoes:'1'});
  expect(result.linhas_fora_do_lote).toBe('9007199254740994');
  expect(resumirPendenciasRecuperacao([],{}).autorizacao_reativacao).toBe(false);
  for(const count of ['-1','NaN','1.2'])expect(()=>resumirPendenciasRecuperacao([],{envios:count})).toThrow('inválida');
});
