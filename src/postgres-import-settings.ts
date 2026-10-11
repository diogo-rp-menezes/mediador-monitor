import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import type Database from 'better-sqlite3';
import type {PoolClient} from 'pg';
import {conferirEscopoConversorImportacao,type EscopoOperacionalImportacao} from './postgres-import-scope.js';

const allowed=new Set(['agendamento','navegador','llm','notificacoes']);
export function desativarAjusteLegado(name:string,raw:unknown):Record<string,unknown>{
  if(!allowed.has(name))throw new Error('Configuração legada sem conversão definida.');
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Configuração legada inválida.');
  const value=structuredClone(raw) as Record<string,unknown>;
  if(name==='agendamento'||name==='llm')value.ativo=false;
  if(name==='notificacoes'){
    for(const channel of ['email','slack']){
      const saved=value[channel];
      if(saved!==undefined&&(!saved||typeof saved!=='object'||Array.isArray(saved)))throw new Error('Canal legado inválido.');
      value[channel]={...(saved as Record<string,unknown>|undefined),ativo:false};
    }
  }
  return value;
}
type Envelope={formato:'ajuste-cifrado-v1';origem:'migracao-sqlite';revisao_obrigatoria:true;ativo:false;valor_cifrado:string};
export function cifrarAjusteImportado(name:string,value:Record<string,unknown>,key:Buffer):Envelope{
  if(key.length!==32)throw new Error('Chave de credenciais deve ter 32 bytes.');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from('ajuste-plataforma:'+name));
  const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return {formato:'ajuste-cifrado-v1',origem:'migracao-sqlite',revisao_obrigatoria:true,ativo:false,valor_cifrado:Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64')};
}
export function decifrarAjusteImportado(name:string,envelope:Envelope,key:Buffer):Record<string,unknown>{
  if(key.length!==32||envelope.formato!=='ajuste-cifrado-v1')throw new Error('Envelope de configuração inválido.');
  const raw=Buffer.from(envelope.valor_cifrado,'base64');if(raw.length<28)throw new Error('Configuração cifrada inválida.');
  const cipher=createDecipheriv('aes-256-gcm',key,raw.subarray(0,12));
  cipher.setAAD(Buffer.from('ajuste-plataforma:'+name));cipher.setAuthTag(raw.subarray(12,28));
  return JSON.parse(Buffer.concat([cipher.update(raw.subarray(28)),cipher.final()]).toString('utf8')) as Record<string,unknown>;
}
export async function importarAjustesIsolados(db:Database.Database,client:PoolClient,key:Buffer,scope?:EscopoOperacionalImportacao){
  const database=(await client.query('SELECT current_database() nome')).rows[0].nome;
  conferirEscopoConversorImportacao(database,scope);
  const source=db.prepare('SELECT chave,valor FROM ajustes ORDER BY chave').all() as {chave:string;valor:string}[];
  const previous=Number((await client.query('SELECT count(*) total FROM ajustes_plataforma')).rows[0].total);
  const expected=new Map<string,string>();
  for(const row of source){
    const value=desativarAjusteLegado(row.chave,JSON.parse(row.valor));
    const envelope=cifrarAjusteImportado(row.chave,value,key);
    await client.query('INSERT INTO ajustes_plataforma(chave,valor_json) VALUES($1,$2::jsonb)',[row.chave,JSON.stringify(envelope)]);
    expected.set(row.chave,JSON.stringify(value));
  }
  const stored=(await client.query('SELECT chave,valor_json FROM ajustes_plataforma WHERE chave=ANY($1::text[]) ORDER BY chave',[source.map(row=>row.chave)])).rows;
  if(stored.length!==source.length)throw new Error('Contagem de configurações divergente.');
  if(Number((await client.query('SELECT count(*) total FROM ajustes_plataforma')).rows[0].total)!==previous+source.length)throw new Error('Configurações preexistentes divergiram.');
  for(const row of stored)if(JSON.stringify(decifrarAjusteImportado(row.chave,row.valor_json,key))!==expected.get(row.chave))throw new Error('Conteúdo de configuração divergente.');
  return {tabela:'ajustes_plataforma',linhas:stored.length,hash:createHash('sha256').update(JSON.stringify([...expected])).digest('hex')};
}

