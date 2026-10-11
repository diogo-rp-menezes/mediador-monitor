/** Applies migration state rules; source rows are separately archived without changes. */
export function converterEstadoEnvioLegado(raw:Record<string,unknown>):Record<string,unknown>{
  const row={...raw},status=String(row.status);
  if(!['bloqueado','preparando','revisao','na_fila','enviando','enviado','falhou','cancelado','incerto'].includes(status))throw new Error('Estado de envio legado desconhecido.');
  if(['bloqueado','revisao','na_fila'].includes(status)){
    Object.assign(row,{status:'bloqueado',snapshot_json:null,aprovado_por:null,aprovado_em:null,contexto_aprovacao:null,
      motivo:'Migrado: prepare uma nova prévia e revise antes de enviar.',proxima_tentativa:null});
  }else if(['preparando','enviando'].includes(status)){
    Object.assign(row,{status:'incerto',erro:'Migrado durante processamento: confira a entrega antes de repetir.',proxima_tentativa:null});
  }else row.proxima_tentativa=null;
  return row;
}

export function converterEstadoNotificacaoLegada(raw:Record<string,unknown>):Record<string,unknown>{
  const row={...raw},state=String(row.estado);
  if(!['pendente','enviando','enviado','falhou','incerto','cancelado'].includes(state))throw new Error('Estado de notificação legado desconhecido.');
  if(state==='pendente')Object.assign(row,{estado:'cancelado',erro:'Migrada sem envio: publique um novo aviso após conferir o destinatário.'});
  if(state==='enviando')Object.assign(row,{estado:'incerto',erro:'Migrada durante processamento: confira a entrega antes de repetir.'});
  return row;
}

