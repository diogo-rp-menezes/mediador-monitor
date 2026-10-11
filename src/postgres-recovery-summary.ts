type Registro={situacao:string;alertas:string[]};
/** Review inventory only: zero detected divergences never grants permission to resend. */
export function resumirPendenciasRecuperacao(registros:Registro[],foraDoLote:Record<string,string>){
  const situacoes:Record<string,string>={},alertas:Record<string,string>={};
  let revisar=0n;
  const preservadas=new Set(['estado_importado_preservado','historico_enviado_nao_repetir']);
  for(const registro of registros){
    situacoes[registro.situacao]=String(BigInt(situacoes[registro.situacao]??'0')+1n);
    for(const alerta of new Set(registro.alertas))alertas[alerta]=String(BigInt(alertas[alerta]??'0')+1n);
    if(!preservadas.has(registro.situacao)||registro.alertas.length)revisar++;
  }
  let externos=0n;
  for(const count of Object.values(foraDoLote)){
    if(!/^\d+$/.test(count))throw new Error('Contagem de recuperação inválida.');
    externos+=BigInt(count);
  }
  return {registros_comparados:String(registros.length),registros_exigem_revisao:String(revisar),
    linhas_fora_do_lote:String(externos),por_situacao:situacoes,por_alerta:alertas,
    autorizacao_reativacao:false,
    revisoes_obrigatorias:['Conferir entregas registradas e incertas com o provedor SMTP.',
      'Revisar linhas fora do lote e alterações de cadastros posteriores ao corte.',
      'Manter filas bloqueadas até concluir o procedimento de recuperação e conciliação.']};
}

