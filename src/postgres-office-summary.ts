import type {Pool} from 'pg';
import {withPostgresOfficeTransaction} from './postgres-transaction.js';

/** A single statement keeps all counters on one snapshot under tenant RLS. */
export async function resumoEscritorioPostgres(pool:Pool,office:number){
  return withPostgresOfficeTransaction(pool,office,async client=>{
    const row=(await client.query(`SELECT
      (SELECT count(*)::integer FROM clientes WHERE escritorio_id=$1 AND ativo=true) clientes_ativos,
      (SELECT count(*)::integer FROM monitoramentos_escritorios WHERE escritorio_id=$1 AND ativo=true) monitoramentos_ativos,
      (SELECT count(*)::integer FROM envios_clientes WHERE escritorio_id=$1 AND status='revisao') envios_revisao,
      (SELECT count(*)::integer FROM envios_clientes WHERE escritorio_id=$1 AND status='na_fila') envios_fila,
      (SELECT count(*)::integer FROM envios_clientes WHERE escritorio_id=$1 AND status IN ('falhou','incerto','bloqueado')) envios_atencao`,[office])).rows[0];
    return row;
  });
}

