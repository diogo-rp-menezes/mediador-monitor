import {expect,it,vi} from 'vitest';
import {ApiError,createApiTransport} from '../frontend/src/services/api';
it('encaminha o sinal de cancelamento sem perder o contexto',async()=>{
  const signal=new AbortController().signal,send=vi.fn(async()=>new Response('[]'));
  const api=createApiTransport({csrf:()=>'',unauthorized:vi.fn(),fetch:send});
  await api.json('/api/contexto/execucoes','GET',undefined,{'x-context-id':'12'},signal);
  expect(send).toHaveBeenCalledWith('/api/contexto/execucoes',expect.objectContaining({signal,headers:expect.objectContaining({'x-context-id':'12'})}));
});
it('preserva status 409 e mensagem para bloquear decisão obsoleta',async()=>{
  const api=createApiTransport({csrf:()=>'',unauthorized:vi.fn(),fetch:vi.fn(async()=>new Response(JSON.stringify({erro:'Decisão concorrente.'}),{status:409}))});
  const error=await api.json('/api/contexto/vinculos','POST',{}).catch(e=>e);
  expect(error).toBeInstanceOf(ApiError);expect(error).toMatchObject({message:'Decisão concorrente.',status:409});
});
it('distingue indisponibilidade de conflito mesmo sem JSON',async()=>{
  const api=createApiTransport({csrf:()=>'',unauthorized:vi.fn(),fetch:vi.fn(async()=>new Response('Indisponível',{status:503}))});
  await expect(api.json('/api/contexto/interpretacoes')).rejects.toMatchObject({status:503,message:'Não foi possível concluir a operação.'});
});
it('mantém CSRF, contexto e expiração na propagação do erro',async()=>{
  const unauthorized=vi.fn(),send=vi.fn(async()=>new Response(JSON.stringify({erro:'Sessão expirada.'}),{status:401}));
  const api=createApiTransport({csrf:()=>'csrf-fixture',unauthorized,fetch:send});
  await expect(api.json('/api/contexto/vinculos','POST',{revisao:1},{'x-context-id':'12'})).rejects.toMatchObject({status:401});
  expect(unauthorized).toHaveBeenCalledOnce();expect(send).toHaveBeenCalledWith('/api/contexto/vinculos',expect.objectContaining({credentials:'same-origin',headers:expect.objectContaining({'x-csrf-token':'csrf-fixture','x-context-id':'12'}),body:'{"revisao":1}'}));
});
