import type {Pool,PoolClient,QueryResultRow} from 'pg';
import {comEscritorArquivosPostgres} from './postgres-backup-gate.js';
import {withPostgresOfficeTransaction} from './postgres-transaction.js';
import {obterSmtpSecretoPostgres} from './postgres-smtp.js';
import {criarTransporteEmail} from './smtp-transporte.js';
import {ErroCadastro} from './cadastros.js';

type Notification={id:number;publicacao_id:number;escritorio_id:number;cliente_id:number;usuario_id:number;destino:string;tentativas:number;razao_social:string;base:string;versao:string};
type SendOptions={publicUrl?:string;sendMail?:(message:Record<string,unknown>,smtp:{host:string;porta:number;secure:boolean;usuario:string;senha:string;remetente:string})=>Promise<{accepted?:unknown[]}>;limit?:number};

/** Queue link-only email notices only for active, tenant-owned publications and current client users. */
export async function prepararNotificacoesPublicacaoPostgres(client:PoolClient,officeId:number,publicationId:number):Promise<number>{
  const publication=await client.query(`SELECT p.id,p.cliente_id FROM publicacoes_documentos p JOIN clientes c ON c.id=p.cliente_id AND c.escritorio_id=p.escritorio_id
    WHERE p.id=$1 AND p.escritorio_id=$2 AND p.estado='ativa' FOR SHARE OF p,c`,[publicationId,officeId]);
  if(!publication.rowCount)throw new ErroCadastro('Publicação ativa não encontrada neste escritório.',404);
  const inserted=await client.query(`INSERT INTO notificacoes_publicacoes(publicacao_id,escritorio_id,cliente_id,usuario_id,destino)
    SELECT $1,$2,$3,u.id,u.email FROM usuarios_clientes v JOIN usuarios u ON u.id=v.usuario_id
    WHERE v.escritorio_id=$2 AND v.cliente_id=$3 AND v.ativo=true AND u.ativo=true
    ON CONFLICT(publicacao_id,destino) DO NOTHING`,[publicationId,officeId,publication.rows[0].cliente_id]);
  return inserted.rowCount??0;
}

async function reserve(pool:Pool,officeId:number,limit:number):Promise<Notification[]>{
  return withPostgresOfficeTransaction(pool,officeId,async client=>{
    await client.query(`UPDATE notificacoes_publicacoes n SET estado='cancelado',erro='Usuário, vínculo ou publicação inativos.'
      WHERE n.escritorio_id=$1 AND n.estado='pendente' AND NOT EXISTS(
       SELECT 1 FROM publicacoes_documentos p JOIN usuarios_clientes v ON v.usuario_id=n.usuario_id AND v.cliente_id=n.cliente_id AND v.escritorio_id=n.escritorio_id
       JOIN usuarios u ON u.id=n.usuario_id WHERE p.id=n.publicacao_id AND p.escritorio_id=n.escritorio_id AND p.cliente_id=n.cliente_id
       AND p.estado='ativa' AND v.ativo=true AND u.ativo=true AND u.email=n.destino)`,[officeId]);
    const result=await client.query<Notification&QueryResultRow>(`WITH batch AS (
      SELECT n.id FROM notificacoes_publicacoes n JOIN publicacoes_documentos p ON p.id=n.publicacao_id AND p.escritorio_id=n.escritorio_id AND p.cliente_id=n.cliente_id
      JOIN usuarios_clientes v ON v.usuario_id=n.usuario_id AND v.cliente_id=n.cliente_id AND v.escritorio_id=n.escritorio_id AND v.ativo=true
      JOIN usuarios u ON u.id=n.usuario_id AND u.ativo=true AND u.email=n.destino
      WHERE n.escritorio_id=$1 AND n.estado='pendente' AND p.estado='ativa'
      ORDER BY n.id FOR UPDATE OF n SKIP LOCKED LIMIT $2
    ) UPDATE notificacoes_publicacoes n SET estado='enviando',tentativas=n.tentativas+1,erro=NULL,iniciado_em=now() FROM batch b,publicacoes_documentos p,clientes c
      WHERE n.id=b.id AND p.id=n.publicacao_id AND p.escritorio_id=n.escritorio_id AND c.id=n.cliente_id AND c.escritorio_id=n.escritorio_id
      RETURNING n.id,n.publicacao_id,n.escritorio_id,n.cliente_id,n.usuario_id,n.destino,n.tentativas,c.razao_social,p.base,p.versao`,[officeId,limit]);
    return result.rows;
  });
}

export async function processarNotificacoesPublicacaoPostgres(pool:Pool,officeId:number,options:SendOptions={}):Promise<{enviadas:number;falhas:number;canceladas:number}>{
  const limit=options.limit??20;if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new ErroCadastro('Limite de notificações inválido.',400);
  const origin=new URL(options.publicUrl??process.env.AUTH_PUBLIC_URL??`http://localhost:${process.env.UI_PORT||3000}`);
  if(origin.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(origin.hostname))throw new ErroCadastro('Notificações externas exigem HTTPS.',503);
  return comEscritorArquivosPostgres(pool,async signal=>{
  const jobs=await reserve(pool,officeId,limit);let enviadas=0,falhas=0,canceladas=0;
  for(const job of jobs){
    signal.throwIfAborted();
    let acceptedBySmtp=false;
    try{
      const smtp=await obterSmtpSecretoPostgres(pool,officeId);if(!smtp)throw new ErroCadastro('Configure e ative o SMTP deste escritório.',409);
      const current=await withPostgresOfficeTransaction(pool,officeId,client=>client.query(`SELECT n.id FROM notificacoes_publicacoes n
        JOIN publicacoes_documentos p ON p.id=n.publicacao_id AND p.escritorio_id=n.escritorio_id AND p.cliente_id=n.cliente_id
        JOIN usuarios_clientes v ON v.usuario_id=n.usuario_id AND v.escritorio_id=n.escritorio_id AND v.cliente_id=n.cliente_id
        JOIN usuarios u ON u.id=n.usuario_id JOIN clientes c ON c.id=n.cliente_id AND c.escritorio_id=n.escritorio_id
        JOIN escritorios e ON e.id=n.escritorio_id
        WHERE n.id=$1 AND n.escritorio_id=$2 AND n.estado='enviando' AND p.estado='ativa'
          AND v.ativo AND u.ativo AND c.ativo AND e.ativo AND u.email=n.destino`,[job.id,officeId]));
      if(!current.rowCount)throw new ErroCadastro('Publicação ou destinatário inativo antes da notificação.',409);
      const message={from:smtp.remetente,to:job.destino,subject:'Documento disponível no Mediador Monitor',
        text:`Um documento foi publicado para sua empresa. Entre na sua conta para consultá-lo: ${new URL('/acesso',origin).href}\n\nEste link exige autenticação; não compartilhe sua senha.`};
      signal.throwIfAborted();let info:{accepted?:unknown[]};
      if(options.sendMail)info=await options.sendMail(message,smtp);
      else{const transport=criarTransporteEmail({slack:{ativo:false,webhook:''},email:{ativo:true,host:smtp.host,port:smtp.porta,secure:smtp.secure,user:smtp.usuario,password:smtp.senha,from:smtp.remetente,to:''}});try{info=await transport.sendMail(message);}finally{transport.close();}}
      if(!(info.accepted??[]).some(value=>(typeof value==='string'?value:(value as {address?:string})?.address)?.toLowerCase()===job.destino.toLowerCase()))
        throw new Error('O servidor SMTP não aceitou o destinatário da notificação.');
      acceptedBySmtp=true;
      await withPostgresOfficeTransaction(pool,officeId,async client=>{const changed=await client.query(`UPDATE notificacoes_publicacoes SET estado='enviado',enviada_em=now(),erro=NULL
        WHERE id=$1 AND escritorio_id=$2 AND estado='enviando' AND EXISTS(SELECT 1 FROM publicacoes_documentos p JOIN usuarios_clientes v ON v.usuario_id=notificacoes_publicacoes.usuario_id
        JOIN usuarios u ON u.id=notificacoes_publicacoes.usuario_id WHERE p.id=notificacoes_publicacoes.publicacao_id AND p.estado='ativa'
        AND v.ativo=true AND v.escritorio_id=$2 AND v.cliente_id=notificacoes_publicacoes.cliente_id AND u.ativo=true AND u.email=notificacoes_publicacoes.destino)`,[job.id,officeId]);
        if(!changed.rowCount)throw new ErroCadastro('Publicação ou vínculo mudou durante a notificação.',409);});enviadas++;
    }catch(error){
      const message=(error as Error).message||'Falha ao enviar notificação.';
      const code=(error as {code?:string}).code??'';
      const uncertain=acceptedBySmtp||['ETIMEDOUT','ECONNRESET','EPIPE','ESOCKET','ECONNECTION'].includes(code);
      await withPostgresOfficeTransaction(pool,officeId,async client=>{const changed=await client.query(`UPDATE notificacoes_publicacoes SET estado=$1,erro=$2
        WHERE id=$3 AND escritorio_id=$4 AND estado='enviando'`,[uncertain?'incerto':error instanceof ErroCadastro?'cancelado':'falhou',message.slice(0,500),job.id,officeId]);if(changed.rowCount&&error instanceof ErroCadastro)canceladas++;});
      falhas++;
    }
  }
  return {enviadas,falhas,canceladas};
  });
}

export async function recuperarNotificacoesPublicacaoPresasPostgres(pool:Pool,officeId:number,olderThanSeconds=900):Promise<number>{
  if(!Number.isSafeInteger(olderThanSeconds)||olderThanSeconds<60||olderThanSeconds>86400)throw new ErroCadastro('Janela de recuperação inválida.',400);
  return withPostgresOfficeTransaction(pool,officeId,async client=>{const result=await client.query(`UPDATE notificacoes_publicacoes SET estado='incerto',erro='Worker interrompido; confirme a entrega antes de repetir.'
    WHERE escritorio_id=$1 AND estado='enviando' AND iniciado_em<now()-($2::text||' seconds')::interval RETURNING id`,[officeId,olderThanSeconds]);return result.rowCount??0;});
}


