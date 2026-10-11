// Carregado somente pelo teste via --import; produção consulta o provedor normal.
import { readFileSync } from 'node:fs';
const originalFetch = globalThis.fetch;
const resposta = JSON.parse(readFileSync(new URL('./cnpj-resposta.json', import.meta.url), 'utf8'));
globalThis.fetch = async (input, options) => {
  const url = String(input);
  if (url.startsWith('https://brasilapi.com.br/api/cnpj/v1/')) {
    if (url.endsWith('/04252011000110')) return new Response(JSON.stringify({...resposta,cnpj:'04252011000110'}), {headers:{'content-type':'application/json'}});
    if (url.endsWith('/11222333000181')) return new Response(JSON.stringify(resposta), { headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/11444777000161')) return new Response('{}', { status: 404 });
    return new Response('{}', { status: 503 });
  }
  return originalFetch(input, options);
};
