import {lstatSync,realpathSync,openSync,writeFileSync,fsyncSync,closeSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';

export class ErroSqliteDesativado extends Error {
  readonly code='SQLITE_CUTOVER_LOCKED';
  constructor(){super('SQLite bloqueado para migração. Use PostgreSQL; não reative filas legadas antes da conciliação de entregas e dados.');}
}
export function caminhoBloqueioSqlite(source:string){
  let path=resolve(source);
  try{path=realpathSync(path);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  return path+'.cutover-lock.json';
}
export function sqliteBloqueadoParaCorte(source:string){
  if(source===':memory:'||source==='')return false;
  try{lstatSync(caminhoBloqueioSqlite(source));}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}
  return true;
}
export function exigirSqliteOperacional(source:string){
  if(sqliteBloqueadoParaCorte(source))throw new ErroSqliteDesativado();
}
/** Written before import. Failures leave the lock in place; no automatic release or queue reactivation. */
export function bloquearSqliteParaCorte(source:string,manifestSignature:string){
  if(!/^[a-f0-9]{64}$/.test(manifestSignature)||source===':memory:')throw new Error('Bloqueio de corte inválido.');
  const path=caminhoBloqueioSqlite(source);
  let descriptor:number;
  try{descriptor=openSync(path,'wx');}
  catch(error){
    if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
    const saved=JSON.parse(readFileSync(path,'utf8'));
    if(saved.formato!=='sqlite-cutover-lock-v1'||saved.manifesto_assinatura!==manifestSignature)throw new Error('Bloqueio SQLite pertence a outro pacote ou está inválido.');
    return path;
  }
  try{
    writeFileSync(descriptor,JSON.stringify({formato:'sqlite-cutover-lock-v1',manifesto_assinatura:manifestSignature,criado_em:new Date().toISOString(),liberacao_automatica:false})+'\n');
    fsyncSync(descriptor);
  }finally{closeSync(descriptor);}
  return path;
}
