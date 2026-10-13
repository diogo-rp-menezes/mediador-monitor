import type {Pool,QueryResultRow} from 'pg';
import {z} from 'zod';
import {withPostgresOfficeTransaction} from './postgres-transaction.js';
import {prepararRelatorioPublicacaoPostgres} from './postgres-consolidacao.js';
import {gerarPdfRelatorio,hashBytes} from './relatorio-core.js';
import {prepararNotificacoesPublicacaoPostgres} from './postgres-notificacoes-publicacoes.js';
import {ErroCadastro} from './cadastros.js';

const Schema=z.object({cliente_id:z.number().int().positive(),base:z.string().trim().min(1).max(100),versao_interpretacao:z.string().min(1).max(100).optional()}).strict();
export type PublicationEvent={ip?:string;user_agent?:string;request_id?:string};
export type PortalContext={escritorio_id:number;cliente_id:number};
type Options={pdf?:(report:Awaited<ReturnType<typeof prepararRelatorioPublicacaoPostgres>>['relatorio'],client:{razao_social:string;cnpj:string})=>Promise<Buffer>};

export async function listarPublicacoesPostgres(pool:Pool,officeId:number){
  return withPostgresOfficeTransaction(pool,officeId,async client=>(await client.query(`SELECT p.id,p.cliente_id,c.razao_social,p.base,p.versao,p.hash_pdf,p.estado,p.criada_em,p.revogada_em
    FROM publicacoes_documentos p JOIN clientes c ON c.id=p.cliente_id AND c.escritorio_id=p.escritorio_id
    WHERE p.escritorio_id=$1 ORDER BY p.id DESC LIMIT 200`,[officeId])).rows);
}

export async function publicarDocumentoPostgres(pool:Pool,officeId:number,actorId:number,raw:unknown,event:PublicationEvent={},options:Options={}){
  const data=Schema.parse(raw),prepared=await prepararRelatorioPublicacaoPostgres(pool,officeId,data.cliente_id,data.base);
  if(data.versao_interpretacao&&data.versao_interpretacao!==prepared.versao_interpretacao)throw new ErroCadastro('A versão conferida mudou. Atualize antes de publicar.',409);
  const pdf=await (options.pdf??gerarPdfRelatorio)(prepared.relatorio,prepared.cliente);
  if(!Buffer.isBuffer(pdf)||pdf.subarray(0,4).toString('latin1')!=='%PDF')throw new ErroCadastro('A geração do relatório não produziu um PDF válido.',500);
  const current=await prepararRelatorioPublicacaoPostgres(pool,officeId,data.cliente_id,data.base);
  if(current.fingerprint!==prepared.fingerprint)throw new ErroCadastro('O relatório mudou durante a preparação. Atualize antes de publicar.',409);
  const hash=hashBytes(pdf);
  return withPostgresOfficeTransaction(pool,officeId,async client=>{
    await client.query('SELECT pg_advisory_xact_lock($1,hashtext($2))',[817204619,`${officeId}:${data.cliente_id}:${data.base}`]);
    const customer=await client.query('SELECT 1 FROM clientes WHERE id=$1 AND escritorio_id=$2 AND ativo=true FOR UPDATE',[data.cliente_id,officeId]);
    if(!customer.rowCount)throw new ErroCadastro('Cliente inativo ou fora deste escritório.',404);
    const existing=await client.query<{id:number;hash_pdf:string;estado:string}&QueryResultRow>(`SELECT id,hash_pdf,estado FROM publicacoes_documentos
      WHERE escritorio_id=$1 AND cliente_id=$2 AND base=$3 AND versao=$4 FOR UPDATE`,[officeId,data.cliente_id,data.base,prepared.relatorio.versao]);
    let id:number,hashPdf=hash;
    if(existing.rowCount){id=Number(existing.rows[0].id);hashPdf=existing.rows[0].hash_pdf;await client.query("UPDATE publicacoes_documentos SET estado='ativa',revogada_em=NULL WHERE id=$1",[id]);}
    else{
      const inserted=await client.query<{id:number}&QueryResultRow>(`INSERT INTO publicacoes_documentos(escritorio_id,cliente_id,base,versao,hash_pdf,relatorio_json,pdf,ator_id)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8) RETURNING id`,[officeId,data.cliente_id,data.base,prepared.relatorio.versao,hash,JSON.stringify(prepared.relatorio),pdf,actorId]);
      id=Number(inserted.rows[0].id);
    }
    const notices=await prepararNotificacoesPublicacaoPostgres(client,officeId,id);
    await client.query(`INSERT INTO auditoria_acessos_publicacoes(escritorio_id,cliente_id,publicacao_id,versao,ator_id,evento,resultado,ip,user_agent,request_id)
      VALUES($1,$2,$3,$4,$5,'publicada','PDF íntegro publicado; notificações enfileiradas',$6,$7,$8)`,[officeId,data.cliente_id,id,prepared.relatorio.versao,actorId,(event.ip??'').slice(0,96),(event.user_agent??'').slice(0,1000),event.request_id??'']);
    await client.query(`INSERT INTO auditoria_seguranca(ator_id,acao,escritorio_id,cliente_id,criado_em,ip,user_agent,request_id,detalhes_json)
      VALUES($1,'DOCUMENTO_PUBLICADO',$2,$3,$4,$5,$6,$7,$8::jsonb)`,[actorId,officeId,data.cliente_id,Date.now(),(event.ip??'').slice(0,96),(event.user_agent??'').slice(0,1000),event.request_id??'',JSON.stringify({publicacao_id:id,base:data.base,versao:prepared.relatorio.versao,hash,notificacoes_enfileiradas:notices})]);
    return {id,versao:prepared.relatorio.versao,hash_pdf:hashPdf,notificacoes_enfileiradas:notices};
  });
}

export async function revogarPublicacaoPostgres(pool:Pool,officeId:number,publicationId:number,actorId:number,event:PublicationEvent={}){
  return withPostgresOfficeTransaction(pool,officeId,async client=>{
    const row=await client.query<{id:number;cliente_id:number;versao:string;estado:string}&QueryResultRow>(`SELECT id,cliente_id,versao,estado FROM publicacoes_documentos
      WHERE id=$1 AND escritorio_id=$2 FOR UPDATE`,[publicationId,officeId]);const publication=row.rows[0];
    if(!publication)throw new ErroCadastro('Publicação não encontrada neste escritório.',404);
    if(publication.estado==='ativa'){
      await client.query("UPDATE publicacoes_documentos SET estado='revogada',revogada_em=now() WHERE id=$1 AND escritorio_id=$2",[publicationId,officeId]);
      await client.query("UPDATE notificacoes_publicacoes SET estado='cancelado',erro='Publicação revogada.' WHERE publicacao_id=$1 AND escritorio_id=$2 AND estado='pendente'",[publicationId,officeId]);
      await client.query(`INSERT INTO auditoria_acessos_publicacoes(escritorio_id,cliente_id,publicacao_id,versao,ator_id,evento,resultado,ip,user_agent,request_id)
        VALUES($1,$2,$3,$4,$5,'revogada','publicação revogada',$6,$7,$8)`,[officeId,publication.cliente_id,publicationId,publication.versao,actorId,(event.ip??'').slice(0,96),(event.user_agent??'').slice(0,1000),event.request_id??'']);
      await client.query(`INSERT INTO auditoria_seguranca(ator_id,acao,escritorio_id,cliente_id,criado_em,ip,user_agent,request_id,detalhes_json)
        VALUES($1,'DOCUMENTO_PUBLICACAO_REVOGADO',$2,$3,$4,$5,$6,$7,$8::jsonb)`,[actorId,officeId,publication.cliente_id,Date.now(),(event.ip??'').slice(0,96),(event.user_agent??'').slice(0,1000),event.request_id??'',JSON.stringify({publicacao_id:publicationId,versao:publication.versao})]);
    }
    return {ok:true};
  });
}

export async function listarPortalDocumentosPostgres(pool:Pool,context:PortalContext,actorId:number){
  return withPostgresOfficeTransaction(pool,context.escritorio_id,async client=>(await client.query(`SELECT p.id,p.base,p.versao,p.hash_pdf,p.criada_em,
    EXISTS(SELECT 1 FROM auditoria_acessos_publicacoes a WHERE a.publicacao_id=p.id AND a.ator_id=$3 AND a.evento='ciencia_confirmada') ciencia_confirmada
    FROM publicacoes_documentos p JOIN usuarios_clientes v ON v.cliente_id=p.cliente_id AND v.escritorio_id=p.escritorio_id
    WHERE p.escritorio_id=$1 AND p.cliente_id=$2 AND p.estado='ativa' AND v.usuario_id=$3 AND v.ativo=true ORDER BY p.id DESC`,[context.escritorio_id,context.cliente_id,actorId])).rows);
}

export async function abrirPortalDocumentoPostgres(pool:Pool,context:PortalContext,actorId:number,publicationId:number,download:boolean,event:PublicationEvent={}){
  const outcome=await withPostgresOfficeTransaction(pool,context.escritorio_id,async client=>{
    const result=await client.query<{id:number;base:string;versao:string;hash_pdf:string;pdf:Buffer}&QueryResultRow>(`SELECT p.id,p.base,p.versao,p.hash_pdf,p.pdf
      FROM publicacoes_documentos p JOIN usuarios_clientes v ON v.cliente_id=p.cliente_id AND v.escritorio_id=p.escritorio_id
      JOIN usuarios u ON u.id=v.usuario_id WHERE p.id=$1 AND p.escritorio_id=$2 AND p.cliente_id=$3 AND p.estado='ativa'
      AND v.usuario_id=$4 AND v.ativo=true AND u.ativo=true FOR SHARE OF p`,[publicationId,context.escritorio_id,context.cliente_id,actorId]);
    const row=result.rows[0];
    const audit=async(publicationId:number|null,version:string,kind:'abertura_autorizada'|'download_servido'|'acesso_negado',message:string)=>client.query(`INSERT INTO auditoria_acessos_publicacoes
      (escritorio_id,cliente_id,publicacao_id,versao,ator_id,evento,resultado,ip,user_agent,request_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[context.escritorio_id,context.cliente_id,publicationId,version,actorId,kind,message,(event.ip??'').slice(0,96),(event.user_agent??'').slice(0,1000),event.request_id??'']);
    if(!row){await audit(null,'','acesso_negado','publicação não encontrada, revogada ou fora do escopo');return {error:404 as const};}
    if(hashBytes(row.pdf)!==row.hash_pdf){await audit(row.id,row.versao,'acesso_negado','hash do PDF não confere');return {error:409 as const};}
    await audit(row.id,row.versao,'abertura_autorizada','PDF disponibilizado ao usuário autenticado');
    await audit(row.id,row.versao,'download_servido',download?'download autorizado':'PDF disponibilizado inline');
    return {file:{nome:`${row.base.replace(/[^a-z0-9_-]/gi,'_')}.pdf`,bytes:row.pdf}};
  });
  if('error'in outcome)throw new ErroCadastro(outcome.error===404?'Documento não encontrado.':'O arquivo publicado falhou na verificação de integridade.',outcome.error);
  return outcome.file;
}

export async function confirmarCienciaPortalPostgres(pool:Pool,context:PortalContext,actorId:number,publicationId:number,event:PublicationEvent={}){
  return withPostgresOfficeTransaction(pool,context.escritorio_id,async client=>{
    const row=await client.query<{versao:string}&QueryResultRow>(`SELECT p.versao FROM publicacoes_documentos p JOIN usuarios_clientes v
      ON v.cliente_id=p.cliente_id AND v.escritorio_id=p.escritorio_id JOIN usuarios u ON u.id=v.usuario_id
      WHERE p.id=$1 AND p.escritorio_id=$2 AND p.cliente_id=$3 AND p.estado='ativa' AND v.usuario_id=$4 AND v.ativo=true AND u.ativo=true FOR SHARE OF p`,
    [publicationId,context.escritorio_id,context.cliente_id,actorId]);
    if(!row.rowCount)throw new ErroCadastro('Documento não encontrado.',404);
    await client.query(`INSERT INTO auditoria_acessos_publicacoes(escritorio_id,cliente_id,publicacao_id,versao,ator_id,evento,resultado,ip,user_agent,request_id)
      VALUES($1,$2,$3,$4,$5,'ciencia_confirmada','ciência explícita registrada pelo cliente',$6,$7,$8)`,[context.escritorio_id,context.cliente_id,publicationId,row.rows[0].versao,actorId,
      (event.ip??'').slice(0,96),(event.user_agent??'').slice(0,1000),event.request_id??'']);
    await client.query(`INSERT INTO auditoria_seguranca(ator_id,acao,escritorio_id,cliente_id,criado_em,ip,user_agent,request_id,detalhes_json)
      VALUES($1,'CIENCIA_PUBLICACAO_CLIENTE',$2,$3,$4,$5,$6,$7,$8::jsonb)`,[actorId,context.escritorio_id,context.cliente_id,Date.now(),(event.ip??'').slice(0,96),
      (event.user_agent??'').slice(0,1000),event.request_id??'',JSON.stringify({publicacao_id:publicationId,versao:row.rows[0].versao})]);
    return {ok:true};
  });
}


