import {z} from 'zod';
import type {PoolClient} from 'pg';
import {ErroCadastro} from './cadastros.js';
import {ehCct,ehAditivoCct} from './vinculos.js';
import {obterIaPostgres} from './postgres-ia-settings.js';
const schema=z.object({numero_registro:z.string().trim().regex(/^[A-Z]{2}\d{6}\/\d{4}$/),confirmar_reanalise:z.boolean().optional()}).strict();
/** Caller owns a platform transaction and human audit, never takes actor from the body. */
export async function solicitarAnalisePostgres(client:PoolClient,actor:number,raw:unknown){
  const data=schema.parse(raw);z.number().int().positive().parse(actor);
  if(!(await obterIaPostgres(client)).ativo)throw new ErroCadastro('Habilite a IA da plataforma antes de solicitar.',409);
  const doc=(await client.query('SELECT numero_registro,tipo,arquivo_path,arquivo_hash,analise_status FROM registros WHERE numero_registro=$1 FOR UPDATE',[data.numero_registro])).rows[0];
  if(!doc)throw new ErroCadastro('Documento não encontrado.',404);
  if(!ehCct(doc.tipo)&&!ehAditivoCct(doc.tipo))throw new ErroCadastro('Selecione uma CCT ou termo aditivo de CCT.',400);
  if(!doc.arquivo_path||! /^[a-f0-9]{64}$/.test(doc.arquivo_hash??''))throw new ErroCadastro('Original sem integridade confirmada.',409);
  if(doc.analise_status==='analisado'&&!data.confirmar_reanalise)throw new ErroCadastro('Confirme a nova análise deste documento já analisado.',409);
  if(doc.analise_status==='analisando'||(await client.query("SELECT id FROM solicitacoes_analise WHERE numero_registro=$1 AND status IN ('solicitada','executando')",[doc.numero_registro])).rowCount)
    throw new ErroCadastro('Documento já possui análise pendente.',409);
  return (await client.query("INSERT INTO solicitacoes_analise(numero_registro,arquivo_hash,solicitada_por,status) VALUES($1,$2,$3,'solicitada') RETURNING id,numero_registro,status",[doc.numero_registro,doc.arquivo_hash,actor])).rows[0];
}
export async function listarSolicitacoesIaPostgres(client:PoolClient){
  return (await client.query('SELECT id,numero_registro,solicitada_por,status,tentativa_id,motivo,criada_em,concluida_em FROM solicitacoes_analise ORDER BY id DESC LIMIT 100')).rows;
}

