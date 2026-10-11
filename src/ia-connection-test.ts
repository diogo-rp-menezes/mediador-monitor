import {ErroCadastro} from './cadastros.js';

/** Explicit administrator probe. No documents or provider response text leave this function. */
export async function testarConexaoIa(config:{base_url:string;modelo:string;api_key:string},fetcher:typeof fetch=fetch){
  if(!config.base_url||!config.modelo)throw new ErroCadastro('Salve o endereço e o modelo antes de testar.',400);
  const started=Date.now();
  try{
    const response=await fetcher(config.base_url.replace(/\/+$/,'')+'/chat/completions',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{'content-type':'application/json',...(config.api_key?{authorization:`Bearer ${config.api_key}`}:{})},
      body:JSON.stringify({model:config.modelo,messages:[{role:'system',content:'Responda apenas com a palavra: ok'},{role:'user',content:'ping'}]}),
    });
    if(!response.ok){await response.body?.cancel();return {ok:false,ms:Date.now()-started,mensagem:response.status===401||response.status===403?'O provedor recusou a autenticação. Confira a chave e as permissões.':response.status===429?'O provedor atingiu o limite de uso. Tente novamente mais tarde.':'O provedor não aceitou o teste. Confira o endereço e o modelo.'};}
    const reader=response.body?.getReader();if(!reader)return {ok:false,ms:Date.now()-started,mensagem:'O provedor retornou uma resposta vazia.'};
    const chunks:Uint8Array[]=[];let bytes=0;
    try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>65536){await reader.cancel();throw new Error('oversize');}chunks.push(chunk.value);}}finally{reader.releaseLock();}
    const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const text=value?.choices?.[0]?.message?.content;
    return typeof text==='string'&&text.trim()?{ok:true,ms:Date.now()-started,mensagem:'Conexão e resposta do modelo confirmadas.'}:{ok:false,ms:Date.now()-started,mensagem:'O provedor não retornou uma resposta compatível. Confira o modelo.'};
  }catch{return {ok:false,ms:Date.now()-started,mensagem:'Não foi possível concluir o teste em até 15 segundos. Confira o endereço e a disponibilidade do provedor.'};}
}
