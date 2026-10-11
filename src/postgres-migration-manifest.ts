import {createHmac,timingSafeEqual} from 'node:crypto';
function canonical(value:unknown):unknown{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
  return value;
}
export function assinarManifestoMigracao(manifest:Record<string,unknown>,key:Buffer){
  if(key.length!==32)throw new Error('Chave de manifesto inválida.');
  const {assinatura:_,...payload}=manifest;
  return createHmac('sha256',key).update(JSON.stringify(canonical(payload))).digest('hex');
}
export function conferirAssinaturaManifestoMigracao(manifest:Record<string,unknown>,key:Buffer){
  if(typeof manifest.assinatura!=='string'||!/^[a-f0-9]{64}$/.test(manifest.assinatura))throw new Error('Manifesto sem assinatura válida.');
  if(!timingSafeEqual(Buffer.from(manifest.assinatura,'hex'),Buffer.from(assinarManifestoMigracao(manifest,key),'hex')))throw new Error('Manifesto alterado ou chave divergente.');
}

