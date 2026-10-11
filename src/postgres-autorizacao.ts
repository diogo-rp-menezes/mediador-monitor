import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Pool } from 'pg';
import { ErroCadastro } from './cadastros.js';
import { INATIVIDADE_SESSAO_MS, type DadosEvento, type Identidade } from './auth-core.js';
import { exigirPermissao, type Contexto } from './autorizacao.js';
import { withPostgresGlobalTransaction } from './postgres-transaction.js';

const ContextSchema=z.object({tipo:z.enum(['escritorio','cliente']),id:z.number().int().positive(),concessao:z.string().uuid().optional()}).strict();
const SessionQuery=`SELECT 1 FROM sessoes_usuarios s JOIN usuarios u ON u.id=s.usuario_id
  WHERE s.token_hash=$1 AND s.usuario_id=$2 AND u.ativo=true AND s.revogada=false AND s.expira_em>$3 AND s.ultimo_acesso_em>$4`;

async function exigirSessaoAtual(pool:Pool,identity:Identidade,now:number){
  const active=await pool.query(SessionQuery,[identity.sessao_hash,identity.usuario_id,now,now-INATIVIDADE_SESSAO_MS]);
  if(!active.rowCount)throw new ErroCadastro('Sessão encerrada.',401);
}

export async function resolverContextoPostgres(pool:Pool,identity:Identidade,raw:unknown,now=Date.now()):Promise<Contexto>{
  const data=ContextSchema.parse(raw);
  await exigirSessaoAtual(pool,identity,now);
  return withPostgresGlobalTransaction(pool,async client=>{
  if(data.tipo==='cliente'){
    const result=await client.query<{escritorio_id:number}&Record<string,unknown>>(`SELECT c.escritorio_id FROM usuarios_clientes v
      JOIN clientes c ON c.id=v.cliente_id AND c.escritorio_id=v.escritorio_id JOIN escritorios e ON e.id=c.escritorio_id
      WHERE v.usuario_id=$1 AND c.id=$2 AND v.ativo=true AND c.ativo=true AND e.ativo=true`,[identity.usuario_id,data.id]);
    if(result.rows[0])return Object.freeze({tipo:'cliente',escritorio_id:result.rows[0].escritorio_id,cliente_id:data.id,papel:'cliente'});
  }else{
    const member=await client.query<{papel:'administrador'|'operador'}&Record<string,unknown>>(`SELECT v.papel FROM usuarios_escritorios v
      JOIN escritorios e ON e.id=v.escritorio_id WHERE v.usuario_id=$1 AND e.id=$2 AND v.ativo=true AND e.ativo=true`,[identity.usuario_id,data.id]);
    if(member.rows[0]&&!data.concessao)return Object.freeze({tipo:'escritorio',escritorio_id:data.id,cliente_id:null,papel:member.rows[0].papel});
    const role=await client.query<{papel:'administrador_plataforma'|'suporte'}&Record<string,unknown>>(
      'SELECT papel FROM papeis_plataforma WHERE usuario_id=$1 AND ativo=true',[identity.usuario_id]);
    const grant=data.concessao&&role.rows[0]?await client.query(`SELECT g.id FROM concessoes_suporte g JOIN escritorios e ON e.id=g.escritorio_id
      WHERE g.id=$1 AND g.sessao_hash=$2 AND g.escritorio_id=$3 AND g.revogada=false AND g.expira_em>$4 AND e.ativo=true`,
      [data.concessao,identity.sessao_hash,data.id,now]):{rowCount:0};
    if(grant.rowCount&&role.rows[0])return Object.freeze({tipo:'escritorio',escritorio_id:data.id,cliente_id:null,
      papel:role.rows[0].papel==='administrador_plataforma'?'administrador':'suporte',concessao:data.concessao});
  }
  throw new ErroCadastro('Contexto não autorizado.',403);
  });
}

export async function iniciarContextoSuportePostgres(pool:Pool,identity:Identidade,raw:unknown,event:DadosEvento={},now=Date.now()):Promise<Contexto>{
  await exigirSessaoAtual(pool,identity,now);
  const role=await pool.query<{papel:'administrador_plataforma'|'suporte'}&Record<string,unknown>>(
    'SELECT papel FROM papeis_plataforma WHERE usuario_id=$1 AND ativo=true',[identity.usuario_id]);
  const current={...identity,papel_plataforma:role.rows[0]?.papel??null};
  exigirPermissao(current,'suporte.contexto');
  const data=z.object({escritorio_id:z.number().int().positive(),justificativa:z.string().trim().min(8).max(1000)}).strict().parse(raw);
  const office=await pool.query('SELECT id FROM escritorios WHERE id=$1 AND ativo=true',[data.escritorio_id]);
  if(!office.rowCount)throw new ErroCadastro('Contexto não autorizado.',403);
  const grantId=randomUUID(),expires=Math.min(identity.expira_em,now+60*60*1000);
  await withPostgresGlobalTransaction(pool,async client=>{
    const active=await client.query(SessionQuery,[identity.sessao_hash,identity.usuario_id,now,now-INATIVIDADE_SESSAO_MS]);
    if(!active.rowCount)throw new ErroCadastro('Sessão encerrada.',401);
    const currentRole=await client.query('SELECT 1 FROM papeis_plataforma WHERE usuario_id=$1 AND ativo=true',[identity.usuario_id]);
    if(!currentRole.rowCount)throw new ErroCadastro('Contexto não autorizado.',403);
    await client.query(`INSERT INTO concessoes_suporte(id,sessao_hash,escritorio_id,justificativa,criada_em,expira_em)
      VALUES($1,$2,$3,$4,$5,$6)`,[grantId,identity.sessao_hash,data.escritorio_id,data.justificativa,now,expires]);
    await client.query(`INSERT INTO auditoria_seguranca(ator_id,acao,escritorio_id,criado_em,ip,user_agent,request_id,detalhes_json)
      VALUES($1,'SUPORTE_CONTEXTO_INICIADO',$2,$3,$4,$5,$6,$7::jsonb)`,[identity.usuario_id,data.escritorio_id,now,
      (event.ip??'').slice(0,96),(event.user_agent??'').slice(0,1000),event.request_id??randomUUID(),
      JSON.stringify({justificativa:data.justificativa,concessao:grantId})]);
  });
  return resolverContextoPostgres(pool,current,{tipo:'escritorio',id:data.escritorio_id,concessao:grantId},now);
}

export async function encerrarContextoSuportePostgres(pool:Pool,identity:Identidade,id:string,event:DadosEvento={},now=Date.now()):Promise<void>{
  await exigirSessaoAtual(pool,identity,now);
  const grantId=z.string().uuid().parse(id);
  await withPostgresGlobalTransaction(pool,async client=>{
    const result=await client.query<{escritorio_id:number}&Record<string,unknown>>(`UPDATE concessoes_suporte SET revogada=true
      WHERE id=$1 AND sessao_hash=$2 AND revogada=false RETURNING escritorio_id`,[grantId,identity.sessao_hash]);
    const row=result.rows[0];
    if(!row)throw new ErroCadastro('Contexto não autorizado.',403);
    await client.query(`INSERT INTO auditoria_seguranca(ator_id,acao,escritorio_id,criado_em,ip,user_agent,request_id,detalhes_json)
      VALUES($1,'SUPORTE_CONTEXTO_ENCERRADO',$2,$3,$4,$5,$6,$7::jsonb)`,[identity.usuario_id,row.escritorio_id,Date.now(),
      (event.ip??'').slice(0,96),(event.user_agent??'').slice(0,1000),event.request_id??randomUUID(),JSON.stringify({concessao:grantId})]);
  });
}

