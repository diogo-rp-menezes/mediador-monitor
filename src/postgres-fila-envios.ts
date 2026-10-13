import type { Pool,PoolClient,QueryResultRow } from 'pg';
import {comEscritorArquivosPostgres} from './postgres-backup-gate.js';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {z} from 'zod';
import { ErroCadastro } from './cadastros.js';
import { withPostgresOfficeTransaction } from './postgres-transaction.js';
import {criarTransporteEmail} from './smtp-transporte.js';
import {obterSmtpSecretoPostgres} from './postgres-smtp.js';
import {listarDocumentosClientePostgres} from './postgres-documentos.js';
import {prepararRelatorioPublicacaoPostgres} from './postgres-consolidacao.js';
import {validarTipoDestinatario} from './preferencias-envio.js';
import {arquivoPermitido,hashBytes} from './relatorio-core.js';

export type EnvioReservado={id:number;escritorio_id:number;cliente_id:number;contato_id:number;numero_registro:string;versao:string;snapshot_json:unknown;tentativas:number};
export interface EnvioPostgresVista {id:number;cliente_id:number;contato_id:number;numero_registro:string;versao:string;status:string;motivo:string|null;tentativas:number;erro:string|null;criado_em:Date;atualizado_em:Date;enviado_em:Date|null;cliente:string;contato:string;razao_social:string;nome:string;email:string;aplicabilidade:string;tem_previa:boolean;snapshot_json?:unknown;}
export interface TentativaEnvioPostgresVista {id:number;resultado:string;erro:string|null;criado_em:Date;}
const snapshotSchema=z.object({para:z.string().email(),contato:z.string().min(1),cliente:z.string().min(1),cnpj:z.string().min(1),assunto:z.string().min(1),texto:z.string(),html:z.string(),versao:z.string().min(1),anexos:z.array(z.object({nome:z.string().min(1).max(255),path:z.string().min(1),hash:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().nonnegative()})).min(1)}).passthrough();
type MailInfo={accepted?:unknown[];messageId?:string;response?:string};
type WorkerOptions={sendMail?:(message:Record<string,unknown>,smtp:{host:string;porta:number;secure:boolean;usuario:string;senha:string;remetente:string})=>Promise<MailInfo>;limite?:number;maxTentativas?:number;maxAnexoMb?:number};
export const fingerprintContextoEnvioPostgres=(d:{cliente_id:number;cliente_ativo:boolean;modo_envio:string;cnpj:string;razao_social:string;contato_id:number;contato_ativo:boolean;email:string;nome:string;receber_email:boolean;tipos_json:string|string[];contexto_hash:string;status:string})=>{
  const tipos=z.array(z.string()).parse(typeof d.tipos_json==='string'?JSON.parse(d.tipos_json):d.tipos_json);
  return createHash('sha256').update(JSON.stringify({cliente:{id:d.cliente_id,ativo:d.cliente_ativo,modo:d.modo_envio,cnpj:d.cnpj,nome:d.razao_social},contato:{id:d.contato_id,ativo:d.contato_ativo,email:d.email,nome:d.nome},receber:d.receber_email,tipos,documento:d.contexto_hash,status:d.status})).digest('hex');
};

export async function listarEnviosPostgres(pool:Pool,escritorioId:number):Promise<EnvioPostgresVista[]>{
  return withPostgresOfficeTransaction(pool,escritorioId,async client=>{
    const rows=(await client.query<EnvioPostgresVista&QueryResultRow>(`SELECT e.id,e.cliente_id,e.contato_id,e.numero_registro,e.versao,e.status,e.motivo,e.tentativas,e.erro,e.criado_em,e.atualizado_em,e.enviado_em,e.snapshot_json,
      c.razao_social cliente,c.razao_social,t.nome contato,t.nome,t.email,d.status aplicabilidade,(e.snapshot_json IS NOT NULL) tem_previa
    FROM envios_clientes e JOIN clientes c ON c.id=e.cliente_id AND c.escritorio_id=e.escritorio_id
    JOIN contatos t ON t.id=e.contato_id AND t.escritorio_id=e.escritorio_id
    JOIN clientes_documentos d ON d.cliente_id=e.cliente_id AND d.numero_registro=e.numero_registro AND d.escritorio_id=e.escritorio_id
    WHERE e.escritorio_id=$1 ORDER BY e.id DESC LIMIT 500`,[escritorioId])).rows;
    return rows.map(({snapshot_json,...row})=>{
      const snapshot=snapshot_json?(typeof snapshot_json==='string'?JSON.parse(snapshot_json):snapshot_json):null;
      const preview=snapshot?hashBytes(typeof snapshot_json==='string'?snapshot_json:JSON.stringify(snapshot_json)):null;
      const parsed=snapshotSchema.safeParse(snapshot);
      const safeSnapshot=parsed.success?{
        para:parsed.data.para,contato:parsed.data.contato,cliente:parsed.data.cliente,cnpj:parsed.data.cnpj,
        assunto:parsed.data.assunto,texto:parsed.data.texto,html:parsed.data.html,versao:parsed.data.versao,
        anexos:parsed.data.anexos.map(({nome,bytes,hash})=>({nome,bytes,hash}))
      }:null;
      return {...row,snapshot:safeSnapshot,previsualizacao_hash:preview};
    });
  });
}

export async function listarTentativasEnvioPostgres(pool:Pool,escritorioId:number,envioId:number):Promise<TentativaEnvioPostgresVista[]>{
  if(!Number.isSafeInteger(envioId)||envioId<1)throw new ErroCadastro('Envio inválido.',400);
  return withPostgresOfficeTransaction(pool,escritorioId,async client=>{
    const owner=await client.query('SELECT 1 FROM envios_clientes WHERE id=$1 AND escritorio_id=$2',[envioId,escritorioId]);
    if(!owner.rowCount)throw new ErroCadastro('Envio não encontrado.',404);
    return (await client.query<TentativaEnvioPostgresVista&QueryResultRow>('SELECT id,resultado,erro,criado_em FROM tentativas_envio WHERE envio_id=$1 AND escritorio_id=$2 ORDER BY id DESC LIMIT 100',[envioId,escritorioId])).rows;
  });
}

export async function aprovarEnvioPostgres(pool:Pool,escritorioId:number,envioId:number,responsavel:string,previsualizacaoHash:string):Promise<void>{
  if(!Number.isSafeInteger(envioId)||envioId<1)throw new ErroCadastro('Envio inválido.',400);
  if(!responsavel.trim())throw new ErroCadastro('Responsável inválido.',400);
  const target=await withPostgresOfficeTransaction(pool,escritorioId,async client=>(await client.query('SELECT cliente_id,numero_registro FROM envios_clientes WHERE id=$1 AND escritorio_id=$2',[envioId,escritorioId])).rows[0]);
  if(!target)throw new ErroCadastro('Envio não encontrado.',404);
  const report=await prepararRelatorioPublicacaoPostgres(pool,escritorioId,target.cliente_id,target.numero_registro);
  const documents=await listarDocumentosClientePostgres(pool,escritorioId,target.cliente_id);
  const decision=documents.find(item=>item.numero_registro===target.numero_registro);
  if(!decision||decision.desatualizado||decision.status!=='confirmado')throw new ErroCadastro('Aplicabilidade desatualizada. Revise antes de aprovar.',409);
  return withPostgresOfficeTransaction(pool,escritorioId,async client=>{
    const result=await client.query(`SELECT e.id,e.cliente_id,e.contato_id,e.numero_registro,e.versao,e.status envio_status,e.snapshot_json,
      c.ativo cliente_ativo,c.modo_envio,c.cnpj,c.razao_social,t.ativo contato_ativo,t.email,t.nome,cc.receber_email,cc.tipos_json,d.status documento_status,d.contexto_hash,d.incluir_envio
      FROM envios_clientes e JOIN clientes c ON c.id=e.cliente_id AND c.escritorio_id=e.escritorio_id
      JOIN contatos t ON t.id=e.contato_id AND t.escritorio_id=e.escritorio_id
      JOIN clientes_contatos cc ON cc.cliente_id=e.cliente_id AND cc.contato_id=e.contato_id AND cc.escritorio_id=e.escritorio_id
      JOIN clientes_documentos d ON d.cliente_id=e.cliente_id AND d.numero_registro=e.numero_registro AND d.escritorio_id=e.escritorio_id
      WHERE e.id=$1 AND e.escritorio_id=$2 FOR UPDATE`,[envioId,escritorioId]);
    const row=result.rows[0];if(!row)throw new ErroCadastro('Envio não encontrado.',404);
    if(row.versao!==report.relatorio.versao)throw new ErroCadastro('O conteúdo mudou. Reprepare e revise o envio.',409);
    if(row.envio_status!=='revisao'||!row.snapshot_json)throw new ErroCadastro('Prepare o conteúdo antes de aprovar este envio.',409);
    const snapshot=typeof row.snapshot_json==='string'?row.snapshot_json:JSON.stringify(row.snapshot_json);
    if(hashBytes(snapshot)!==previsualizacaoHash)throw new ErroCadastro('A prévia mudou. Abra-a novamente antes de aprovar.',409);
    if(!row.cliente_ativo||!row.contato_ativo||!row.receber_email||!row.incluir_envio||row.documento_status!=='confirmado')throw new ErroCadastro('Destinatário ou aplicabilidade mudou. Reprepare o envio.',409);
    const parsed=snapshotSchema.safeParse(typeof row.snapshot_json==='string'?JSON.parse(row.snapshot_json):row.snapshot_json);
    if(!parsed.success||parsed.data.versao!==row.versao||parsed.data.para.toLowerCase()!==String(row.email).toLowerCase()||parsed.data.contato!==row.nome||parsed.data.cliente!==row.razao_social||parsed.data.cnpj!==row.cnpj)
      throw new ErroCadastro('A prévia diverge do destinatário atual. Reprepare o envio.',409);
    validarTipoDestinatario(row.tipos_json,report.relatorio.tipo);
    for(const attachment of parsed.data.anexos){
      const bytes=readFileSync(arquivoPermitido(attachment.path));
      if(hashBytes(bytes)!==attachment.hash||bytes.length!==attachment.bytes)throw new ErroCadastro('Anexo alterado ou corrompido. Reprepare o envio.',409);
    }
    const context=fingerprintContextoEnvioPostgres({cliente_id:row.cliente_id,cliente_ativo:row.cliente_ativo,modo_envio:row.modo_envio,cnpj:row.cnpj,razao_social:row.razao_social,contato_id:row.contato_id,contato_ativo:row.contato_ativo,email:row.email,nome:row.nome,receber_email:row.receber_email,tipos_json:typeof row.tipos_json==='string'?row.tipos_json:JSON.stringify(row.tipos_json),contexto_hash:row.contexto_hash,status:row.documento_status});
    await client.query(`UPDATE envios_clientes SET status='na_fila',motivo=NULL,erro=NULL,aprovado_por=$1,aprovado_em=now(),contexto_aprovacao=$2,atualizado_em=now()
      WHERE id=$3 AND escritorio_id=$4`,[responsavel.trim().slice(0,250),context,envioId,escritorioId]);
  });
}

export async function anexoEnvioPostgres(pool:Pool,escritorioId:number,envioId:number,index:number):Promise<{nome:string;bytes:Buffer}>{
  if(!Number.isSafeInteger(envioId)||envioId<1||!Number.isSafeInteger(index)||index<0)throw new ErroCadastro('Anexo inválido.',400);
  return withPostgresOfficeTransaction(pool,escritorioId,async client=>{
    const result=await client.query<{snapshot_json:unknown}&QueryResultRow>('SELECT snapshot_json FROM envios_clientes WHERE id=$1 AND escritorio_id=$2',[envioId,escritorioId]);
    const raw=result.rows[0]?.snapshot_json;if(!raw)throw new ErroCadastro('Anexo não encontrado.',404);
    const parsed=snapshotSchema.safeParse(typeof raw==='string'?JSON.parse(raw):raw);const attachment=parsed.success?parsed.data.anexos[index]:undefined;
    if(!attachment)throw new ErroCadastro('Anexo não encontrado.',404);
    const bytes=readFileSync(arquivoPermitido(attachment.path));if(hashBytes(bytes)!==attachment.hash||bytes.length!==attachment.bytes)throw new ErroCadastro('Anexo alterado ou corrompido. Reprepare o envio.',409);
    return {nome:attachment.nome,bytes};
  });
}

export async function cancelarEnvioPostgres(pool:Pool,escritorioId:number,envioId:number):Promise<void>{
  return withPostgresOfficeTransaction(pool,escritorioId,async client=>{
    const result=await client.query(`UPDATE envios_clientes SET status='cancelado',motivo='Cancelado pelo usuário.',proxima_tentativa=NULL,atualizado_em=now()
      WHERE id=$1 AND escritorio_id=$2 AND status NOT IN ('enviando','enviado','preparando')`,[envioId,escritorioId]);
    if(!result.rowCount)throw new ErroCadastro('Envio não pode ser cancelado neste estado.',409);
  });
}

export async function reprepararEnvioPostgres(pool:Pool,escritorioId:number,envioId:number,confirmarRisco:boolean):Promise<{cliente_id:number;contato_id:number;numero_registro:string}>{
  return withPostgresOfficeTransaction(pool,escritorioId,async client=>{
    const current=await client.query<{status:string;cliente_id:number;contato_id:number;numero_registro:string}&QueryResultRow>('SELECT status,cliente_id,contato_id,numero_registro FROM envios_clientes WHERE id=$1 AND escritorio_id=$2 FOR UPDATE',[envioId,escritorioId]);
    const status=current.rows[0]?.status;if(!status)throw new ErroCadastro('Envio não encontrado.',404);
    if(['enviando','enviado','preparando'].includes(status))throw new ErroCadastro('Envio em andamento ou concluído.',409);
    if(status==='incerto'&&!confirmarRisco)throw new ErroCadastro('Confira o provedor e confirme o risco antes de repreparar.',409);
    await client.query(`UPDATE envios_clientes SET status='bloqueado',snapshot_json=NULL,aprovado_por=NULL,aprovado_em=NULL,contexto_aprovacao=NULL,erro=NULL,proxima_tentativa=NULL,atualizado_em=now()
      WHERE id=$1 AND escritorio_id=$2`,[envioId,escritorioId]);
    const {cliente_id,contato_id,numero_registro}=current.rows[0];
    return {cliente_id,contato_id,numero_registro};
  });
}

/** Atomically leases due messages; SKIP LOCKED allows independent workers. */
export async function reservarEnviosPostgres(pool:Pool,escritorioId:number,limite=10):Promise<EnvioReservado[]>{
  if(!Number.isSafeInteger(limite)||limite<1||limite>100)throw new ErroCadastro('Limite de reserva inválido.',400);
  return withPostgresOfficeTransaction(pool,escritorioId,async client=>{
    const result=await client.query<EnvioReservado&QueryResultRow>(`WITH selecionados AS (
      SELECT id FROM envios_clientes WHERE escritorio_id=$1 AND status='na_fila'
        AND (proxima_tentativa IS NULL OR proxima_tentativa<=now())
      ORDER BY COALESCE(proxima_tentativa,criado_em),id FOR UPDATE SKIP LOCKED LIMIT $2
    ) UPDATE envios_clientes e SET status='enviando',tentativas=e.tentativas+1,atualizado_em=now()
      FROM selecionados s WHERE e.id=s.id RETURNING e.id,e.escritorio_id,e.cliente_id,e.contato_id,e.numero_registro,e.versao,e.snapshot_json,e.tentativas`,[escritorioId,limite]);
    return result.rows;
  });
}

export async function concluirEnvioPostgres(client:PoolClient,escritorioId:number,envioId:number,result:{messageId:string;resposta?:string}):Promise<void>{
  const updated=await client.query(`UPDATE envios_clientes SET status='enviado',message_id=$1,resposta_smtp=$2,enviado_em=now(),atualizado_em=now(),erro=NULL
    WHERE id=$3 AND escritorio_id=$4 AND status='enviando'`,[result.messageId.slice(0,998),result.resposta?.slice(0,2000)??null,envioId,escritorioId]);
  if(!updated.rowCount)throw new ErroCadastro('Envio não está reservado neste escritório.',409);
  await client.query(`INSERT INTO tentativas_envio(envio_id,escritorio_id,resultado,message_id) VALUES($1,$2,'enviado',$3)`,[envioId,escritorioId,result.messageId.slice(0,998)]);
}

export async function falharEnvioPostgres(client:PoolClient,escritorioId:number,envioId:number,result:{erro:string;incerto?:boolean;maxTentativas?:number}):Promise<void>{
  const current=await client.query<{tentativas:number}&QueryResultRow>(`SELECT tentativas FROM envios_clientes WHERE id=$1 AND escritorio_id=$2 AND status='enviando' FOR UPDATE`,[envioId,escritorioId]);
  if(!current.rowCount)throw new ErroCadastro('Envio não está reservado neste escritório.',409);
  const count=Number(current.rows[0].tentativas),max=Math.max(1,Math.min(20,result.maxTentativas??5));
  const status=result.incerto?'incerto':count>=max?'falhou':'na_fila';
  const delay=Math.min(86400,30*2**Math.min(count-1,11));
  await client.query(`UPDATE envios_clientes SET status=$1,erro=$2,proxima_tentativa=CASE WHEN $1='na_fila' THEN now()+($3::text||' seconds')::interval ELSE NULL END,atualizado_em=now()
    WHERE id=$4 AND escritorio_id=$5`,[status,result.erro.slice(0,4000),delay,envioId,escritorioId]);
  await client.query(`INSERT INTO tentativas_envio(envio_id,escritorio_id,resultado,erro) VALUES($1,$2,$3,$4)`,[envioId,escritorioId,status,result.erro.slice(0,4000)]);
}

/** A worker crash after SMTP may have delivered; mark uncertain to prevent duplicates. */
export async function recuperarEnviosPresosPostgres(pool:Pool,escritorioId:number,maisAntigoQueSegundos=900):Promise<number>{
  if(!Number.isSafeInteger(maisAntigoQueSegundos)||maisAntigoQueSegundos<60||maisAntigoQueSegundos>86400)throw new ErroCadastro('Janela de recuperação inválida.',400);
  return withPostgresOfficeTransaction(pool,escritorioId,async client=>{
    const stuck=await client.query<{id:number}&QueryResultRow>(`SELECT id FROM envios_clientes WHERE escritorio_id=$1 AND status='enviando'
      AND atualizado_em<now()-($2::text||' seconds')::interval FOR UPDATE SKIP LOCKED`,[escritorioId,maisAntigoQueSegundos]);
    for(const row of stuck.rows){
      await client.query(`UPDATE envios_clientes SET status='incerto',erro='Worker interrompido durante o envio; verificar com o destinatário antes de reenviar.',atualizado_em=now() WHERE id=$1 AND escritorio_id=$2`,[row.id,escritorioId]);
      await client.query(`INSERT INTO tentativas_envio(envio_id,escritorio_id,resultado,erro) VALUES($1,$2,'incerto','Worker interrompido; entrega SMTP pode ter ocorrido.')`,[row.id,escritorioId]);
    }
    return stuck.rowCount??0;
  });
}

/** Delivers only already-approved, tenant-owned immutable snapshots. SMTP failures with an ambiguous outcome become incerto. */
export async function processarFilaPostgres(pool:Pool,escritorioId:number,options:WorkerOptions={}):Promise<{enviados:number;falhas:number;ignorados:number}>{
  return comEscritorArquivosPostgres(pool,async signal=>{
  const jobs=await reservarEnviosPostgres(pool,escritorioId,options.limite??10);let enviados=0,falhas=0,ignorados=0;
  for(const job of jobs){
    signal.throwIfAborted();
    let messageId=`<${randomUUID()}@mediador.local>`,acceptedBySmtp=false;
    try{
      const details=await withPostgresOfficeTransaction(pool,escritorioId,client=>client.query(`SELECT e.aprovado_por,e.aprovado_em,e.contexto_aprovacao,e.message_id,e.snapshot_json,
        c.ativo cliente_ativo,c.modo_envio,c.cnpj,c.razao_social,t.ativo contato_ativo,t.email,t.nome,
        cc.receber_email,cc.tipos_json,d.status,d.contexto_hash,d.incluir_envio,r.tipo,r.analise_status
        FROM envios_clientes e JOIN clientes c ON c.id=e.cliente_id AND c.escritorio_id=e.escritorio_id
        JOIN contatos t ON t.id=e.contato_id AND t.escritorio_id=e.escritorio_id
        JOIN clientes_contatos cc ON cc.cliente_id=e.cliente_id AND cc.contato_id=e.contato_id AND cc.escritorio_id=e.escritorio_id
        JOIN clientes_documentos d ON d.cliente_id=e.cliente_id AND d.numero_registro=e.numero_registro AND d.escritorio_id=e.escritorio_id
        JOIN registros r ON r.numero_registro=e.numero_registro WHERE e.id=$1 AND e.escritorio_id=$2`,[job.id,escritorioId]));
      const d=details.rows[0];
      if(d)validarTipoDestinatario(d.tipos_json,d.tipo);
      if(!d||!d.cliente_ativo||!d.contato_ativo||!d.receber_email||!d.incluir_envio||d.status!=='confirmado'||d.analise_status!=='analisado'||!d.aprovado_por||!d.aprovado_em||d.contexto_aprovacao!==fingerprintContextoEnvioPostgres({cliente_id:job.cliente_id,...d,contato_id:job.contato_id}))throw new ErroCadastro('Aprovação, destinatário ou aplicabilidade mudou; revise o envio.',409);
      const docs=await listarDocumentosClientePostgres(pool,escritorioId,job.cliente_id),decision=docs.find(item=>item.numero_registro===job.numero_registro);
      if(!decision||decision.desatualizado||decision.status!=='confirmado')throw new ErroCadastro('Aplicabilidade desatualizada. Revise o documento antes de enviar.',409);
      const parsed=snapshotSchema.safeParse(typeof job.snapshot_json==='string'?JSON.parse(job.snapshot_json):job.snapshot_json);
      if(!parsed.success)throw new ErroCadastro('Prévia de envio inválida. Prepare e revise novamente.',409);
      const snapshot=parsed.data;
      const report=await prepararRelatorioPublicacaoPostgres(pool,escritorioId,job.cliente_id,job.numero_registro);
      if(report.relatorio.versao!==job.versao)throw new ErroCadastro('O conteúdo mudou desde a aprovação. Reprepare o envio.',409);
      if(snapshot.para.toLowerCase()!==String(d.email).toLowerCase()||snapshot.contato!==d.nome||snapshot.cliente!==d.razao_social||snapshot.cnpj!==d.cnpj||snapshot.versao!==job.versao)throw new ErroCadastro('A prévia diverge do destinatário ou da versão aprovada.',409);
      const attachments=snapshot.anexos.map(item=>{const path=arquivoPermitido(item.path),bytes=readFileSync(path);if(hashBytes(bytes)!==item.hash||bytes.length!==item.bytes)throw new ErroCadastro(`Anexo ${item.nome} foi alterado ou corrompido.`,409);return {filename:item.nome,content:bytes};});
      const maxBytes=Math.max(1,Math.min(100,options.maxAnexoMb??(Number(process.env.MAIL_MAX_ATTACHMENT_MB)||20)))*1024*1024;
      if(attachments.reduce((total,item)=>total+item.content.length,0)*1.4>maxBytes)throw new ErroCadastro('Anexos excedem o limite configurado para envio.',413);
      const smtp=await obterSmtpSecretoPostgres(pool,escritorioId);if(!smtp)throw new ErroCadastro('Configure e ative o SMTP deste escritório.',409);
      messageId=typeof d.message_id==='string'&&d.message_id?d.message_id:messageId;
      const message={from:smtp.remetente,to:snapshot.para,subject:snapshot.assunto,text:snapshot.texto,html:snapshot.html,attachments,messageId};
      signal.throwIfAborted();let info:MailInfo;
      if(options.sendMail)info=await options.sendMail(message,smtp);
      else{const transport=criarTransporteEmail({slack:{ativo:false,webhook:''},email:{ativo:true,host:smtp.host,port:smtp.porta,secure:smtp.secure,user:smtp.usuario,password:smtp.senha,from:smtp.remetente,to:''}});try{info=await transport.sendMail(message);}finally{transport.close();}}
      const accepted=(info.accepted??[]).map(value=>typeof value==='string'?value:(value as {address?:string})?.address).some(value=>value?.toLowerCase()===snapshot.para.toLowerCase());
      if(!accepted)throw Object.assign(new Error('O servidor SMTP não aceitou o destinatário.'),{responseCode:550});
      acceptedBySmtp=true;
      await withPostgresOfficeTransaction(pool,escritorioId,client=>concluirEnvioPostgres(client,escritorioId,job.id,{messageId:info.messageId||messageId,resposta:info.response||'Destinatário aceito pelo servidor SMTP'}));enviados++;
    }catch(error){
      const failure=error as Error&{code?:string;responseCode?:number};const uncertain=acceptedBySmtp||['ETIMEDOUT','ECONNRESET','EPIPE','ESOCKET','ECONNECTION'].includes(failure.code??'');
      const retry=!uncertain&&((failure.responseCode!==undefined&&failure.responseCode>=400&&failure.responseCode<500)||failure.code==='EDNS');
      await withPostgresOfficeTransaction(pool,escritorioId,client=>falharEnvioPostgres(client,escritorioId,job.id,{erro:failure.message||'Falha no envio SMTP.',incerto:uncertain,maxTentativas:retry?(options.maxTentativas??3):1}));
      falhas++;if(error instanceof ErroCadastro)ignorados++;
    }
  }
  return {enviados,falhas,ignorados};
  });
}


