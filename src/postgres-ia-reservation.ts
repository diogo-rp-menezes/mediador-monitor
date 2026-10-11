import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {ErroCadastro} from './cadastros.js';
import {obterIaSecretaPostgres} from './postgres-ia-settings.js';
import {withPostgresGlobalTransaction} from './postgres-transaction.js';
import {hashBytes} from './relatorio-core.js';
import {lerOriginalIaPostgres} from './postgres-ia-original.js';
import {validarRespostaIaPostgres} from './postgres-ia-generation.js';
const numberSchema=z.string().trim().min(1).max(100);
const failureSchema=z.enum(['original_invalido','documento_invalido','provedor_indisponivel','resposta_invalida','execucao_interrompida']);
export type MotivoFalhaIa=z.infer<typeof failureSchema>;
async function audit(client:PoolClient,action:string,details:Record<string,unknown>){
  await client.query(`INSERT INTO auditoria_seguranca(ator_id,acao,escritorio_id,criado_em,ip,user_agent,request_id,detalhes_json)
    VALUES(NULL,$1,NULL,$2,'','extracao-ia-v1',$3,$4::jsonb)`,[action,Date.now(),randomUUID(),JSON.stringify({...details,origem:{tipo:'sistema',rotina:'extracao-ia-v1'}})]);
}
/** Trusted platform worker only. Explicit document, no automatic requeue or provider call. */
export async function reservarAnalisePostgres(pool:Pool,number:string,afterReserve?:(client:PoolClient,attempt:{id:number;numero_registro:string})=>Promise<void>){
  const document=numberSchema.parse(number);
  return withPostgresGlobalTransaction(pool,async client=>{
    const config=await obterIaSecretaPostgres(client);if(!config)return null;
    const row=(await client.query(`SELECT numero_registro,tipo,arquivo_path,arquivo_hash,analise_status,analise_iniciada_em
      FROM registros WHERE numero_registro=$1 FOR UPDATE`,[document])).rows[0];
    if(!row)throw new ErroCadastro('Documento não encontrado.',404);
    if(!row.arquivo_path||! /^[a-f0-9]{64}$/.test(row.arquivo_hash??''))throw new ErroCadastro('Original sem integridade confirmada.',409);
    if(row.analise_status==='analisando'||(await client.query("SELECT id FROM tentativas_analise WHERE numero_registro=$1 AND status='executando'",[document])).rowCount)
      throw new ErroCadastro('Documento já possui análise em andamento; interrupções exigem recuperação explícita.',409);
    const token=randomUUID();
    const id=(await client.query(`INSERT INTO tentativas_analise(numero_registro,arquivo_hash,config_versao,modelo,status_anterior,inicio_anterior,reserva_token,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,'executando') RETURNING id`,[document,row.arquivo_hash,config.versao,config.modelo,row.analise_status,row.analise_iniciada_em,token])).rows[0].id as number;
    await client.query("UPDATE registros SET analise_status='analisando',analise_iniciada_em=now(),analise_erro=NULL WHERE numero_registro=$1",[document]);
    await audit(client,'IA_EXTRACAO_RESERVADA',{tentativa_id:id,numero_registro:document,config_versao:config.versao});
    await afterReserve?.(client,{id,numero_registro:document});
    // Secret stays in worker memory. Do not serialize this result into HTTP/audit/logs.
    return {id,token,numero_registro:document,arquivo_path:row.arquivo_path as string,arquivo_hash:row.arquivo_hash as string,tipo:row.tipo as string|null,config};
  });
}
/** Call only after all work has stopped. Never store raw provider errors, prompts or credentials. */
export async function falharAnalisePostgres(pool:Pool,id:number,token:string,reason:MotivoFalhaIa){
  z.number().int().positive().parse(id);z.string().uuid().parse(token);const motivo=failureSchema.parse(reason);
  await withPostgresGlobalTransaction(pool,async client=>{
    // Same lock order as reservation: document, then attempt.
    const lookup=(await client.query('SELECT numero_registro FROM tentativas_analise WHERE id=$1',[id])).rows[0];
    if(!lookup)throw new ErroCadastro('Reserva de análise não encontrada.',409);
    const doc=(await client.query('SELECT numero_registro,analise_status,arquivo_hash FROM registros WHERE numero_registro=$1 FOR UPDATE',[lookup.numero_registro])).rows[0];
    const attempt=(await client.query("SELECT * FROM tentativas_analise WHERE id=$1 AND status='executando' AND reserva_token=$2 FOR UPDATE",[id,token])).rows[0];
    if(!attempt||doc?.analise_status!=='analisando')throw new ErroCadastro('Reserva não corresponde à análise ativa.',409);
    await client.query("UPDATE tentativas_analise SET status='falhou',motivo=$2,reserva_token=NULL,concluida_em=now() WHERE id=$1",[id,motivo]);
    await client.query(`UPDATE registros SET analise_status=$2,analise_iniciada_em=$3,analise_erro=$4 WHERE numero_registro=$1`,
      [attempt.numero_registro,doc.arquivo_hash===attempt.arquivo_hash?attempt.status_anterior:'falhou',attempt.inicio_anterior,`Falha na nova extração: ${motivo}.`]);
    const jobs=await client.query("UPDATE solicitacoes_analise SET status='falhou',motivo=$2,reserva_token=NULL,concluida_em=now() WHERE tentativa_id=$1 AND status='executando' RETURNING id",[id,motivo]);
    await audit(client,'IA_EXTRACAO_FALHOU',{tentativa_id:id,numero_registro:attempt.numero_registro,motivo,solicitacoes:jobs.rows.map(row=>row.id)});
  });
}

/** Validated public extraction only; office reviews/decisions are never changed here. */
export async function concluirAnalisePostgres(pool:Pool,id:number,token:string,raw:unknown,text:string){
  z.number().int().positive().parse(id);z.string().uuid().parse(token);z.string().trim().min(1).max(150000).parse(text);
  return withPostgresGlobalTransaction(pool,async client=>{
    const lookup=(await client.query('SELECT numero_registro FROM tentativas_analise WHERE id=$1',[id])).rows[0];
    if(!lookup)throw new ErroCadastro('Reserva de análise não encontrada.',409);
    const doc=(await client.query('SELECT * FROM registros WHERE numero_registro=$1 FOR UPDATE',[lookup.numero_registro])).rows[0];
    const attempt=(await client.query("SELECT * FROM tentativas_analise WHERE id=$1 AND status='executando' AND reserva_token=$2 FOR UPDATE",[id,token])).rows[0];
    if(!attempt||doc?.analise_status!=='analisando')throw new ErroCadastro('Reserva não corresponde à análise ativa.',409);
    if(doc.arquivo_hash!==attempt.arquivo_hash||!doc.arquivo_path)
      throw new ErroCadastro('Original alterado durante a extração.',409);
    lerOriginalIaPostgres(doc.arquivo_path,attempt.arquivo_hash);
    const extraction=validarRespostaIaPostgres(raw,doc.tipo,text),serialized=JSON.stringify(extraction);
    await client.query(`UPDATE tentativas_analise SET status='concluida',reserva_token=NULL,concluida_em=now(),extracao_json=$2::jsonb WHERE id=$1`,[id,serialized]);
    await client.query(`UPDATE registros SET analise_status='analisado',extracao_json=$2::jsonb,analise_erro=NULL,analise_concluida_em=now() WHERE numero_registro=$1`,[attempt.numero_registro,serialized]);
    const jobs=await client.query("UPDATE solicitacoes_analise SET status='concluida',motivo=NULL,reserva_token=NULL,concluida_em=now() WHERE tentativa_id=$1 AND status='executando' RETURNING id",[id]);
    await audit(client,'IA_EXTRACAO_CONCLUIDA',{tentativa_id:id,numero_registro:attempt.numero_registro,config_versao:attempt.config_versao,resultado_hash:hashBytes(serialized),solicitacoes:jobs.rows.map(row=>row.id)});
    return {tentativa_id:id,numero_registro:attempt.numero_registro,status:'concluida' as const};
  });
}


