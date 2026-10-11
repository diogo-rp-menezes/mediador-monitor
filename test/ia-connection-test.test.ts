import {expect,it,vi} from 'vitest';
import {testarConexaoIa} from '../src/ia-connection-test.js';
const config={base_url:'https://example.invalid/v1/',modelo:'modelo',api_key:'segredo-sintetico'};
it('envia somente ping com a credencial salva, limita tempo e impede redirecionamento',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:'ok'}}]})));
  const result=await testarConexaoIa(config,fetcher as typeof fetch);
  expect(result.ok).toBe(true);expect(JSON.stringify(result)).not.toContain('segredo');
  const [url,options]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe('https://example.invalid/v1/chat/completions');expect(options.redirect).toBe('error');expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(JSON.parse(String(options.body)).messages[1].content).toBe('ping');
  expect((options.headers as Record<string,string>).authorization).toBe('Bearer segredo-sintetico');
});
it('não devolve corpo de erro, exceções, resposta vazia ou dados arbitrários do provedor',async()=>{
  for(const response of [new Response('segredo-sintetico',{status:401}),new Response('{}'),new Response('segredo-sintetico'),new Response(JSON.stringify({choices:[{message:{content:'segredo-sintetico'}}]}))]){
    const result=await testarConexaoIa(config,vi.fn(async()=>response) as typeof fetch);
    expect(JSON.stringify(result)).not.toContain('segredo-sintetico');
  }
  const result=await testarConexaoIa(config,vi.fn(async()=>{throw new Error('segredo-sintetico');}) as typeof fetch);
  expect(result.ok).toBe(false);expect(JSON.stringify(result)).not.toContain('segredo-sintetico');
});
it('recusa configuração incompleta antes da rede e interrompe respostas muito grandes',async()=>{
  const fetcher=vi.fn(async()=>new Response('x'.repeat(65537)));
  await expect(testarConexaoIa({...config,modelo:''},fetcher as typeof fetch)).rejects.toMatchObject({status:400});expect(fetcher).not.toHaveBeenCalled();
  expect((await testarConexaoIa(config,fetcher as typeof fetch)).ok).toBe(false);
});
