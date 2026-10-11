import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { ErroCadastro } from './cadastros.js';
import { DURACAO_RECUPERACAO_MS, DURACAO_SESSAO_MS, INATIVIDADE_SESSAO_MS, criarHashSenha, hashToken, tokenCsrf, verificarSenha, type DadosEvento, type Identidade } from './auth-core.js';
import { withPostgresGlobalTransaction } from './postgres-transaction.js';

const tokenValido=(token:string)=>/^[A-Za-z0-9_-]{43}$/.test(token);
const novoToken=()=>randomBytes(32).toString('base64url');
const LoginSchema=z.object({email:z.string().trim().toLowerCase().email().max(254),senha:z.string().min(1).max(128)}).strict();
const EmailSchema=z.string().trim().toLowerCase().email().max(254);
const SenhaSchema=z.string().max(128).refine(value=>[...value].length>=15&&value.trim().length>0,'Use uma senha com pelo menos 15 caracteres.');
const TokenSchema=z.string().regex(/^[A-Za-z0-9_-]{43}$/);

interface SessaoRow extends QueryResultRow {
  usuario_id:number;nome:string;email:string;papel_plataforma:'administrador_plataforma'|'suporte'|null;
  sessao_hash:string;expira_em:string|number;ultimo_acesso_em:string|number;
}

async function auditar(client:PoolClient,acao:string,atorId:number|null,event:DadosEvento,details:Record<string,unknown>,now:number){
  await client.query(`INSERT INTO auditoria_seguranca(ator_id,acao,criado_em,ip,user_agent,request_id,detalhes_json)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[atorId,acao,now,(event.ip??'').slice(0,96),(event.user_agent??'').slice(0,1000),
    event.request_id??randomUUID(),JSON.stringify(details)]);
}

async function aplicarLimite(pool:Pool,operacao:string,email:string,ip:string,now:number):Promise<boolean>{
  const window=operacao==='login'?15*60*1000:60*60*1000;
  return withPostgresGlobalTransaction(pool,async client=>{
    await client.query('DELETE FROM limites_autenticacao WHERE janela_em<$1',[now-24*60*60*1000]);
    let blocked=false;
    for(const [suffix,value,max] of [['conta',email,5],['ip',ip,20]] as const){
      const key=`${operacao}:${suffix}:${hashToken(value)}`;
      const result=await client.query<{contador:number}&QueryResultRow>(`INSERT INTO limites_autenticacao(chave,janela_em,contador)
        VALUES($1,$2,1) ON CONFLICT(chave) DO UPDATE SET
          janela_em=CASE WHEN limites_autenticacao.janela_em<=$3 THEN excluded.janela_em ELSE limites_autenticacao.janela_em END,
          contador=CASE WHEN limites_autenticacao.janela_em<=$3 THEN 1 ELSE limites_autenticacao.contador+1 END
        RETURNING contador`,[key,now,now-window]);
      if(result.rows[0].contador>max)blocked=true;
    }
    return blocked;
  });
}

export async function exigirSessaoPostgres(pool:Pool,token:string,now=Date.now()):Promise<Identidade>{
  if(!tokenValido(token))throw new ErroCadastro('Entre para continuar.',401);
  const sessionHash=hashToken(token);
  return withPostgresGlobalTransaction(pool,async client=>{
    const result=await client.query<SessaoRow>(`SELECT u.id usuario_id,u.nome,u.email,s.token_hash sessao_hash,s.expira_em,s.ultimo_acesso_em,
      CASE WHEN p.ativo THEN p.papel ELSE NULL END papel_plataforma
      FROM sessoes_usuarios s JOIN usuarios u ON u.id=s.usuario_id LEFT JOIN papeis_plataforma p ON p.usuario_id=u.id
      WHERE s.token_hash=$1 AND s.revogada=false AND u.ativo=true FOR UPDATE OF s`,[sessionHash]);
    const row=result.rows[0];
    if(!row||Number(row.expira_em)<=now||Number(row.ultimo_acesso_em)+INATIVIDADE_SESSAO_MS<=now)
      throw new ErroCadastro('Sessão encerrada. Entre novamente.',401);
    await client.query('UPDATE sessoes_usuarios SET ultimo_acesso_em=$1 WHERE token_hash=$2',[now,sessionHash]);
    return {usuario_id:row.usuario_id,nome:row.nome,email:row.email,papel_plataforma:row.papel_plataforma,
      sessao_hash:row.sessao_hash,expira_em:Number(row.expira_em)};
  });
}

export function criarAutenticacaoPostgres(pool:Pool,options:{agora?:()=>number;enviarRecuperacao?:(destino:string,token:string)=>Promise<void>}={}){
  const now=options.agora??Date.now;
  return {
    exigirSessao(token:string){return exigirSessaoPostgres(pool,token,now());},
    async login(raw:unknown,event:DadosEvento={},tokenAnterior=''){
      const data=LoginSchema.parse(raw),moment=now();
      if(await aplicarLimite(pool,'login',data.email,event.ip??'',moment))
        throw new ErroCadastro('Muitas tentativas. Aguarde e tente novamente.',429);
      const query=await pool.query<{id:number;ativo:boolean;senha_hash:string}&QueryResultRow>(`SELECT u.id,u.ativo,c.senha_hash
        FROM usuarios u JOIN credenciais_usuarios c ON c.usuario_id=u.id WHERE lower(u.email)=lower($1)`,[data.email]);
      const row=query.rows[0];
      const passwordMatches=await verificarSenha(data.senha,row?.senha_hash);
      if(!passwordMatches||!row?.ativo){
        await withPostgresGlobalTransaction(pool,client=>auditar(client,'LOGIN_RECUSADO',null,event,{},moment));
        throw new ErroCadastro('E-mail ou senha inválidos.',401);
      }
      const token=novoToken(),sessionHash=hashToken(token),expires=moment+DURACAO_SESSAO_MS;
      const created=await withPostgresGlobalTransaction(pool,async client=>{
        const latest=await client.query<{ativo:boolean;senha_hash:string}&QueryResultRow>(`SELECT u.ativo,c.senha_hash FROM usuarios u
          JOIN credenciais_usuarios c ON c.usuario_id=u.id WHERE u.id=$1 FOR UPDATE OF u,c`,[row.id]);
        if(!latest.rows[0]?.ativo||latest.rows[0].senha_hash!==row.senha_hash)return false;
        if(tokenValido(tokenAnterior))await client.query('UPDATE sessoes_usuarios SET revogada=true WHERE token_hash=$1',[hashToken(tokenAnterior)]);
        await client.query(`INSERT INTO sessoes_usuarios(token_hash,usuario_id,criada_em,ultimo_acesso_em,expira_em)
          VALUES($1,$2,$3,$3,$4)`,[sessionHash,row.id,moment,expires]);
        await auditar(client,'LOGIN_CONCLUIDO',row.id,event,{},moment);
        return true;
      });
      if(!created){
        await withPostgresGlobalTransaction(pool,client=>auditar(client,'LOGIN_RECUSADO',null,event,{},now()));
        throw new ErroCadastro('E-mail ou senha inválidos.',401);
      }
      return {token,identidade:await exigirSessaoPostgres(pool,token,now()),csrf:tokenCsrf(token)};
    },
    async logout(token:string,event:DadosEvento={}){
      const identity=await exigirSessaoPostgres(pool,token,now());
      await withPostgresGlobalTransaction(pool,async client=>{
        const result=await client.query('UPDATE sessoes_usuarios SET revogada=true WHERE token_hash=$1 AND revogada=false',[identity.sessao_hash]);
        if(!result.rowCount)throw new ErroCadastro('Sessão encerrada. Entre novamente.',401);
        await auditar(client,'LOGOUT',identity.usuario_id,event,{},now());
      });
    },
    async solicitarRecuperacao(raw:unknown,event:DadosEvento={}){
      const email=z.object({email:EmailSchema}).strict().parse(raw).email;
      const moment=now();
      if(await aplicarLimite(pool,'recuperacao',email,event.ip??'',moment))
        throw new ErroCadastro('Muitas tentativas. Aguarde e tente novamente.',429);
      const result=await pool.query<{id:number}&QueryResultRow>(`SELECT u.id FROM usuarios u JOIN credenciais_usuarios c ON c.usuario_id=u.id
        WHERE lower(u.email)=lower($1) AND u.ativo=true`,[email]);
      if(result.rows[0]&&options.enviarRecuperacao){
        const rawToken=novoToken(),tokenHash=hashToken(rawToken);
        await pool.query('INSERT INTO recuperacoes_acesso(token_hash,usuario_id,criada_em,expira_em) VALUES($1,$2,$3,$4)',
          [tokenHash,result.rows[0].id,moment,moment+DURACAO_RECUPERACAO_MS]);
        queueMicrotask(()=>{void Promise.resolve().then(()=>options.enviarRecuperacao!(email,rawToken)).catch(()=>{
          void pool.query('UPDATE recuperacoes_acesso SET usada_em=$1 WHERE token_hash=$2 AND usada_em IS NULL',[now(),tokenHash]).catch(()=>{});
        });});
      }
      await withPostgresGlobalTransaction(pool,client=>auditar(client,'RECUPERACAO_SOLICITADA',null,event,{},moment));
      return {mensagem:'Se houver uma conta ativa e o e-mail estiver configurado, você receberá as instruções.'};
    },
    async recuperar(raw:unknown,event:DadosEvento={}){
      const data=z.object({token:TokenSchema,senha:SenhaSchema}).strict().parse(raw);
      const moment=now(),tokenHash=hashToken(data.token);
      if(await aplicarLimite(pool,'confirmar_recuperacao',tokenHash,event.ip??'',moment))
        throw new ErroCadastro('Muitas tentativas. Aguarde e tente novamente.',429);
      const lookup=await pool.query<{usuario_id:number}&QueryResultRow>(`SELECT r.usuario_id FROM recuperacoes_acesso r
        JOIN usuarios u ON u.id=r.usuario_id WHERE r.token_hash=$1 AND r.usada_em IS NULL AND r.expira_em>$2 AND u.ativo=true`,[tokenHash,moment]);
      if(!lookup.rows[0])throw new ErroCadastro('Link inválido ou expirado. Solicite outra recuperação.',400);
      const passwordHash=await criarHashSenha(data.senha);
      const consumed=await withPostgresGlobalTransaction(pool,async client=>{
        const active=await client.query<{usuario_id:number}&QueryResultRow>(`SELECT r.usuario_id FROM recuperacoes_acesso r JOIN usuarios u ON u.id=r.usuario_id
          WHERE r.token_hash=$1 AND r.usada_em IS NULL AND r.expira_em>$2 AND u.ativo=true FOR UPDATE OF r,u`,[tokenHash,now()]);
        const userId=active.rows[0]?.usuario_id;
        if(!userId)return null;
        const updated=await client.query('UPDATE recuperacoes_acesso SET usada_em=$1 WHERE token_hash=$2 AND usada_em IS NULL AND expira_em>$3',[now(),tokenHash,now()]);
        if(!updated.rowCount)return null;
        await client.query(`INSERT INTO credenciais_usuarios(usuario_id,senha_hash,atualizado_em) VALUES($1,$2,$3)
          ON CONFLICT(usuario_id) DO UPDATE SET senha_hash=excluded.senha_hash,atualizado_em=excluded.atualizado_em`,[userId,passwordHash,now()]);
        await client.query('UPDATE sessoes_usuarios SET revogada=true WHERE usuario_id=$1',[userId]);
        await client.query('UPDATE recuperacoes_acesso SET usada_em=$1 WHERE usuario_id=$2 AND usada_em IS NULL',[now(),userId]);
        await auditar(client,'SENHA_RECUPERADA',userId,event,{},now());
        return userId;
      });
      if(!consumed)throw new ErroCadastro('Link inválido ou expirado. Solicite outra recuperação.',400);
      return {mensagem:'Senha atualizada. Entre novamente.'};
    }
  };
}

