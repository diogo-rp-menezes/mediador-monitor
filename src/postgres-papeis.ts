import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { ErroCadastro } from './cadastros.js';
import { criarHashSenha } from './auth-core.js';
import { withPostgresGlobalTransaction } from './postgres-transaction.js';
import {BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY} from './postgres-backup-gate.js';

const ROLE_CHANGE_LOCK=817_204_613;
const RoleSchema=z.enum(['administrador_plataforma','suporte']);
const BootstrapSchema=z.object({nome:z.string().trim().min(2).max(250),email:z.string().trim().toLowerCase().email().max(254),senha:z.string().max(128).refine(v=>[...v].length>=15&&v.trim().length>0,'Use uma senha com pelo menos 15 caracteres.')}).strict();

export async function possuiAdministradorPlataformaPostgres(pool:Pool):Promise<boolean>{
  const result=await pool.query("SELECT 1 FROM papeis_plataforma WHERE papel='administrador_plataforma' LIMIT 1");
  return !!result.rowCount;
}

async function audit(client:PoolClient,actorId:number,action:string,details:Record<string,unknown>){
  await client.query(`INSERT INTO auditoria_seguranca(ator_id,acao,criado_em,ip,user_agent,request_id,detalhes_json)
    VALUES($1,$2,$3,'','',$4,$5::jsonb)`,[actorId,action,Date.now(),randomUUID(),JSON.stringify(details)]);
}

export async function bootstrapAdministradorPostgres(pool:Pool,raw:unknown):Promise<number>{
  const data=BootstrapSchema.parse(raw);
  const passwordHash=await criarHashSenha(data.senha);
  return withPostgresGlobalTransaction(pool,async client=>{
    if((await client.query('SELECT pg_try_advisory_xact_lock_shared($1,$2) AS adquirido',[BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY])).rows[0]?.adquirido!==true)throw new ErroCadastro('Backup em andamento. Bootstrap não iniciado.',409);
    await client.query('SELECT pg_advisory_xact_lock($1)',[ROLE_CHANGE_LOCK]);
    const exists=await client.query("SELECT 1 FROM papeis_plataforma WHERE papel='administrador_plataforma' LIMIT 1");
    if(exists.rowCount)throw new ErroCadastro('Administrador inicial já configurado.',409);
    const user=await client.query<{id:number}&QueryResultRow>('INSERT INTO usuarios(nome,email) VALUES($1,$2) RETURNING id',[data.nome,data.email]);
    const id=user.rows[0].id;
    await client.query('INSERT INTO credenciais_usuarios(usuario_id,senha_hash,atualizado_em) VALUES($1,$2,$3)',[id,passwordHash,Date.now()]);
    await client.query("INSERT INTO papeis_plataforma(usuario_id,papel,ativo) VALUES($1,'administrador_plataforma',true)",[id]);
    await audit(client,id,'ADMINISTRADOR_INICIAL_CRIADO',{origem:'cli_postgres'});
    return id;
  });
}

/** Assigns, changes, or revokes a platform role while preserving the role row as history. */
async function alterarPapelPlataformaTx(client:PoolClient,usuarioId:number,papel:'administrador_plataforma'|'suporte'|null,atorId:number):Promise<void>{
  if(!Number.isSafeInteger(usuarioId)||usuarioId<1||!Number.isSafeInteger(atorId)||atorId<1)throw new TypeError('Identificador inválido.');
  if(papel!==null)RoleSchema.parse(papel);
  await client.query('SELECT pg_advisory_xact_lock($1)',[ROLE_CHANGE_LOCK]);
  const actor=await client.query('SELECT 1 FROM papeis_plataforma WHERE usuario_id=$1 AND papel=\'administrador_plataforma\' AND ativo=true',[atorId]);
  if(!actor.rowCount)throw new ErroCadastro('Somente administrador ativo pode alterar papéis da plataforma.',403);
  const user=await client.query<{ativo:boolean}&QueryResultRow>('SELECT ativo FROM usuarios WHERE id=$1',[usuarioId]);
  if(!user.rowCount)throw new ErroCadastro('Usuário não encontrado.',404);
  if(papel!==null&&!user.rows[0].ativo)throw new ErroCadastro('Usuário inativo.',409);
  const current=await client.query<{papel:string;ativo:boolean}&QueryResultRow>('SELECT papel,ativo FROM papeis_plataforma WHERE usuario_id=$1 FOR UPDATE',[usuarioId]);
  const wasActiveAdmin=current.rows[0]?.papel==='administrador_plataforma'&&current.rows[0]?.ativo;
  if(wasActiveAdmin&&papel!=='administrador_plataforma'){
    const others=await client.query("SELECT count(*)::integer AS total FROM papeis_plataforma WHERE papel='administrador_plataforma' AND ativo=true AND usuario_id<>$1",[usuarioId]);
    if(others.rows[0].total===0)throw new ErroCadastro('Não é possível remover o último administrador da plataforma.',409);
  }
  if(papel===null){
    if(!current.rowCount||!current.rows[0].ativo)throw new ErroCadastro('Papel ativo não encontrado.',404);
    await client.query('UPDATE papeis_plataforma SET ativo=false WHERE usuario_id=$1',[usuarioId]);
  }else{
    await client.query(`INSERT INTO papeis_plataforma(usuario_id,papel,ativo) VALUES($1,$2,true)
      ON CONFLICT(usuario_id) DO UPDATE SET papel=excluded.papel,ativo=true`,[usuarioId,papel]);
  }
  await audit(client,atorId,'PAPEL_PLATAFORMA_ATUALIZADO',{usuario_alvo_id:usuarioId,papel_anterior:current.rows[0]?.papel??null,
    ativo_anterior:current.rows[0]?.ativo??false,papel_novo:papel,ativo_novo:papel!==null});
}

export function alterarPapelPlataformaPostgres(pool:Pool,usuarioId:number,papel:'administrador_plataforma'|'suporte'|null,atorId:number):Promise<void>{
  return withPostgresGlobalTransaction(pool,client=>alterarPapelPlataformaTx(client,usuarioId,papel,atorId));
}

