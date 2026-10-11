import type {Pool} from 'pg';
import {withPostgresOfficeTransaction} from './postgres-transaction.js';

const columns=['id','cliente_id','publicacao_id','versao','ator_id','evento','resultado','criado_em','ip','user_agent','request_id'] as const;
export async function listarAuditoriaPublicacoesPostgres(pool:Pool,office:number){
  return withPostgresOfficeTransaction(pool,office,async client=>(await client.query(`SELECT ${columns.join(',')} FROM auditoria_acessos_publicacoes WHERE escritorio_id=$1 ORDER BY id DESC LIMIT 200`,[office])).rows);
}
export function auditoriaPublicacoesCsv(rows:Record<string,unknown>[]){
  const cell=(raw:unknown)=>{
    let value=raw instanceof Date?raw.toISOString():String(raw??'');
    if(/^\s*[=+@-]/.test(value))value="'"+value;
    return '"'+value.replaceAll('"','""')+'"';
  };
  return '\uFEFF'+[columns.join(','),...rows.map(row=>columns.map(key=>cell(row[key])).join(','))].join('\r\n');
}

