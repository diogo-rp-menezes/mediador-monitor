import { randomUUID } from 'node:crypto';
import {exigirSqliteOperacional} from './sqlite-cutover-lock.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Db } from './db.js';
import { criarTransporteEmail } from './notify.js';
import { smtpEscritorio } from './operacoes-escritorio.js';
import { lerNotificacoes } from './settings.js';
import { ErroCadastro, auditarCadastro, contextoDocumentoCliente, descobrirDocumentosClientes, type ClienteRow, type ContatoRow } from './cadastros.js';
import { arquivoPermitido, escaparHtml, gerarPdfRelatorio, hashBytes, obterRelatorio, type Relatorio } from './relatorios.js';

type Estado='bloqueado'|'preparando'|'revisao'|'na_fila'|'enviando'|'enviado'|'falhou'|'cancelado'|'incerto';
export interface SnapshotEnvio {
  para:string; contato:string; cliente:string; cnpj:string; assunto:string; texto:string; html:string; versao:string;
  anexos:{nome:string;path:string;hash:string;bytes:number}[];
}
export interface EnvioRow {
  id:number;escritorio_id:number;cliente_id:number;contato_id:number;numero_registro:string;versao:string;status:Estado;motivo:string|null;
  snapshot_json:string|null;aprovado_por:string|null;aprovado_em:string|null;contexto_aprovacao:string|null;
  tentativas:number;proxima_tentativa:string|null;erro:string|null;message_id:string|null;criado_em:string;enviado_em:string|null;
}
interface Destinatario { cliente:ClienteRow&{escritorio_id:number};contato:ContatoRow;receber_email:number;tipos:string[];status:string;contexto_hash:string;incluir_envio:number }
function destinatario(db:Db,clienteId:number,contatoId:number,numero:string):Destinatario {
  const cliente=db.prepare('SELECT * FROM clientes WHERE id=?').get(clienteId) as (ClienteRow & {escritorio_id:number})|undefined;
  const contato=db.prepare('SELECT * FROM contatos WHERE id=?').get(contatoId) as ContatoRow|undefined;
  const vinculo=db.prepare('SELECT receber_email,tipos_json FROM clientes_contatos WHERE cliente_id=? AND contato_id=?').get(clienteId,contatoId) as {receber_email:number;tipos_json:string}|undefined;
  const doc=db.prepare('SELECT status,contexto_hash,incluir_envio FROM clientes_documentos WHERE cliente_id=? AND numero_registro=?').get(clienteId,numero) as {status:string;contexto_hash:string;incluir_envio:number}|undefined;
  if(!cliente||!contato||!vinculo||!doc)throw new ErroCadastro('O vínculo entre cliente, contato e documento não está mais disponível.',409);
  if(!cliente.ativo||!contato.ativo||!vinculo.receber_email)throw new ErroCadastro('Cliente ou contato inativo, ou recebimento de e-mail desabilitado.',409);
  const tipos=JSON.parse(vinculo.tipos_json) as string[];
  const registro=db.prepare('SELECT tipo FROM registros WHERE numero_registro=?').get(numero) as {tipo:string};
  if(tipos.length&&!tipos.includes('Todos os tipos')&&!tipos.includes(registro.tipo))throw new ErroCadastro('O contato não recebe este tipo de instrumento.',409);
  if(doc.status==='rejeitado')throw new ErroCadastro('Documento rejeitado para este cliente.',409);
  if(doc.contexto_hash!==contextoDocumentoCliente(db,clienteId,numero))throw new ErroCadastro('Os vínculos ou o documento mudaram. Confira novamente a aplicabilidade.',409);
  return {cliente,contato,receber_email:vinculo.receber_email,tipos,...doc};
}
function contexto(d:Destinatario):string {
  return hashBytes(JSON.stringify({cliente:{id:d.cliente.id,ativo:d.cliente.ativo,modo:d.cliente.modo_envio,cnpj:d.cliente.cnpj,nome:d.cliente.razao_social},
    contato:{id:d.contato.id,ativo:d.contato.ativo,email:d.contato.email,nome:d.contato.nome},receber:d.receber_email,tipos:d.tipos,documento:d.contexto_hash,status:d.status}));
}
export function lerEnvio(db:Db,id:number):EnvioRow {
  const row=db.prepare('SELECT * FROM envios_clientes WHERE id=?').get(id) as EnvioRow|undefined;
  if(!row)throw new ErroCadastro('Envio não encontrado.',404);return row;
}
export function vistaEnvio(db:Db,id:number) {
  const row=lerEnvio(db,id), snapshot:SnapshotEnvio|null=row.snapshot_json?JSON.parse(row.snapshot_json):null;
  const dados=db.prepare(`SELECT c.razao_social,c.cnpj,t.nome,t.email,d.status aplicabilidade FROM envios_clientes e
    JOIN clientes c ON c.id=e.cliente_id JOIN contatos t ON t.id=e.contato_id
    LEFT JOIN clientes_documentos d ON d.cliente_id=e.cliente_id AND d.numero_registro=e.numero_registro WHERE e.id=?`).get(id) as Record<string,unknown>;
  return {...row,...dados,snapshot_json:undefined,contexto_aprovacao:undefined,previsualizacao_hash:row.snapshot_json?hashBytes(row.snapshot_json):null,snapshot:snapshot?{...snapshot,anexos:snapshot.anexos.map((a,i)=>({nome:a.nome,bytes:a.bytes,hash:a.hash,url:`/api/envios/${id}/anexos/${i}`}))}:null,
    tentativas_historico:db.prepare('SELECT * FROM tentativas_envio WHERE envio_id=? ORDER BY id DESC').all(id)};
}
export function listarEnvios(db:Db,clienteId?:number) {
  const ids=db.prepare(`SELECT id FROM envios_clientes ${clienteId?'WHERE cliente_id=?':''} ORDER BY id DESC LIMIT 500`).all(...(clienteId?[clienteId]:[])) as {id:number}[];
  return ids.map(e=>vistaEnvio(db,e.id));
}
export function resumoEnvios(db:Db) {
  const rows=db.prepare('SELECT status,COUNT(*) total FROM envios_clientes GROUP BY status').all() as {status:Estado;total:number}[];
  return Object.fromEntries(rows.map(x=>[x.status,x.total]));
}
function atualizar(db:Db,id:number,status:Estado,motivo:string|null=null):void {
  db.prepare(`UPDATE envios_clientes SET status=?,motivo=?,atualizado_em=datetime('now') WHERE id=?`).run(status,motivo,id);
}
export function recuperarEnviosInterrompidos(db:Db):void {
  db.prepare(`UPDATE envios_clientes SET status='incerto',erro='Servidor reiniciado durante o envio. Confira o provedor antes de autorizar nova tentativa.',proxima_tentativa=NULL,atualizado_em=datetime('now') WHERE status='enviando'`).run();
  db.prepare(`UPDATE envios_clientes SET status='falhou',erro='Preparação do PDF interrompida. Reprepare o envio.',atualizado_em=datetime('now') WHERE status='preparando'`).run();
}
export function textoMensagem(r:Relatorio,d:Destinatario,atualizacao=false) {
  const assunto=`[${atualizacao?'Atualização':'Novo documento'}] ${r.tipo} ${r.numero} - ${d.cliente.nome_fantasia||d.cliente.razao_social}`;
  const texto=`Olá, ${d.contato.nome}.\n\n${atualizacao?'Há uma nova versão da análise':'Foi disponibilizado um instrumento coletivo'} relacionado a ${d.cliente.razao_social} (CNPJ ${d.cliente.cnpj}).\n\nTipo: ${r.tipo}\nRegistro: ${r.numero}\nVigência: ${r.vigencia||'Confira no documento original'}\nVersão da análise: ${r.versao.slice(0,16)}\n\nSeguem em anexo os documentos originais e o PDF da análise${r.base?' consolidada com os aditivos':''}, organizado para consulta.\n\nA análise é assistida por IA. Confira as condições e o texto integral dos documentos antes de aplicar as informações.\n\nMediador Monitor`;
  const html=`<div style="font:15px/1.6 Arial,sans-serif;color:#26344b;max-width:640px"><p>Olá, ${escaparHtml(d.contato.nome)}.</p><p>${atualizacao?'Há uma nova versão da análise':'Foi disponibilizado um instrumento coletivo'} relacionado a <strong>${escaparHtml(d.cliente.razao_social)}</strong> (CNPJ ${escaparHtml(d.cliente.cnpj)}).</p><div style="padding:16px;background:#f2f4fb;border-radius:10px"><strong>${escaparHtml(r.tipo)}</strong><br>Registro: ${escaparHtml(r.numero)}<br>Vigência: ${escaparHtml(r.vigencia||'Confira no original')}<br>Versão: ${r.versao.slice(0,16)}</div><p>Os documentos originais e o PDF da análise${r.base?' consolidada com os aditivos':''} estão anexados.</p><p style="font-size:12px;color:#6c7789">Análise assistida por IA. Confira as condições e o texto integral dos documentos antes de aplicar as informações.</p><p>Mediador Monitor</p></div>`;
  return {assunto,texto,html};
}
type OpcoesPreparacao={pdf?:(r:Relatorio,c:{razao_social:string;cnpj:string})=>Promise<Buffer>};
const preparando=new WeakSet<Db>();
/** Cria cópias imutáveis dos anexos; a prévia e o envio usam exatamente estes mesmos bytes. */
export async function prepararEnvios(db:Db,clienteId?:number,numero?:string,opt:OpcoesPreparacao={}):Promise<{preparados:number;bloqueados:number}> {
  exigirSqliteOperacional(db.name);
  if(preparando.has(db))return {preparados:0,bloqueados:0};
  preparando.add(db);
  let preparados=0,bloqueados=0;
  try {
    descobrirDocumentosClientes(db,clienteId);
    const pares=db.prepare(`SELECT d.cliente_id,d.numero_registro,cc.contato_id FROM clientes_documentos d
      JOIN clientes c ON c.id=d.cliente_id JOIN clientes_contatos cc ON cc.cliente_id=d.cliente_id JOIN contatos t ON t.id=cc.contato_id
      WHERE c.ativo=1 AND t.ativo=1 AND cc.receber_email=1 AND d.incluir_envio=1 AND d.status<>'rejeitado'
      ${clienteId?'AND d.cliente_id=?':''} ${numero?'AND d.numero_registro=?':''} ORDER BY d.numero_registro,cc.contato_id`).all(...[...(clienteId?[clienteId]:[]),...(numero?[numero]:[])]) as {cliente_id:number;numero_registro:string;contato_id:number}[];
    const limite=20;let gerados=0;
    for(const p of pares) {
      let d:Destinatario;
      try {d=destinatario(db,p.cliente_id,p.contato_id,p.numero_registro);}catch{continue;}
      // Não cria rascunho para um escritório que ainda não concluiu sua configuração de envio.
      if(d.cliente.escritorio_id!==1&&!smtpEscritorio(db,d.cliente.escritorio_id))continue;
      let r:Relatorio|null=null,erro:string|null=null;
      try {r=obterRelatorio(db,p.numero_registro);}catch(e){erro=(e as Error).message;}
      const versao=r?.versao||'pendente';
      db.prepare(`UPDATE envios_clientes SET status='cancelado',motivo='Conteúdo alterado: prepare e revise a nova versão.',proxima_tentativa=NULL,atualizado_em=datetime('now')
        WHERE cliente_id=? AND contato_id=? AND numero_registro=? AND versao<>? AND status IN ('bloqueado','revisao','na_fila','falhou')`).run(p.cliente_id,p.contato_id,p.numero_registro,versao);
      db.prepare(`INSERT OR IGNORE INTO envios_clientes(escritorio_id,cliente_id,contato_id,numero_registro,versao,status,motivo) VALUES (?,?,?,?,?,'bloqueado',?)`)
        .run(d.cliente.escritorio_id,p.cliente_id,p.contato_id,p.numero_registro,versao,erro);
      const row=db.prepare('SELECT * FROM envios_clientes WHERE cliente_id=? AND contato_id=? AND numero_registro=? AND versao=?').get(p.cliente_id,p.contato_id,p.numero_registro,versao) as EnvioRow;
      if(!r){if(['bloqueado','revisao','na_fila'].includes(row.status))atualizar(db,row.id,'bloqueado',erro);bloqueados++;continue;}
      if(['enviado','enviando','preparando','cancelado','incerto','falhou'].includes(row.status))continue;
      const automatico=d.cliente.modo_envio==='automatico'&&d.status==='confirmado';
      if(row.snapshot_json) {
        // Reconfiguração de destinatários exige nova revisão, mesmo com a mesma análise.
        const snap=JSON.parse(row.snapshot_json) as SnapshotEnvio;
        if(snap.para!==d.contato.email||snap.contato!==d.contato.nome||snap.cliente!==d.cliente.razao_social||snap.cnpj!==d.cliente.cnpj) {
          atualizar(db,row.id,'cancelado','Destinatário ou cliente alterado. Clique em Repreparar para conferir a nova prévia.');continue;
        }
        if(row.contexto_aprovacao&&row.contexto_aprovacao!==contexto(d)) {
          db.prepare('UPDATE envios_clientes SET aprovado_por=NULL,aprovado_em=NULL,contexto_aprovacao=NULL,proxima_tentativa=NULL WHERE id=?').run(row.id);
          atualizar(db,row.id,'revisao','Configuração ou aplicabilidade alterada. Confira novamente.');
        }
        if(automatico&&row.status!=='na_fila') {
          db.prepare(`UPDATE envios_clientes SET status='na_fila',motivo=NULL,aprovado_por='Regra automática configurada',aprovado_em=datetime('now'),contexto_aprovacao=?,atualizado_em=datetime('now') WHERE id=?`).run(contexto(d),row.id);
        }
        continue;
      }
      if(gerados>=limite)continue;
      if(!db.prepare(`UPDATE envios_clientes SET status='preparando' WHERE id=? AND status IN ('bloqueado','revisao')`).run(row.id).changes)continue;
      try {
        const pdf=await (opt.pdf||gerarPdfRelatorio)(r,d.cliente);
        // Não publica um rascunho construído durante uma alteração concorrente.
        const atual=destinatario(db,p.cliente_id,p.contato_id,p.numero_registro);
        if(obterRelatorio(db,p.numero_registro).versao!==r.versao||contexto(atual)!==contexto(d))throw new Error('Conteúdo ou destinatário mudou durante a preparação. Reprepare o envio.');
        const dir=resolve('data','envios',randomUUID());mkdirSync(dir,{recursive:true});
        const anexos:SnapshotEnvio['anexos']=[];
        for(const a of r.arquivos) {
          const bytes=readFileSync(a.path);if(hashBytes(bytes)!==a.hash)throw new Error('Documento mudou durante a preparação.');
          const path=join(dir,a.nome);writeFileSync(path,bytes,{flag:'wx'});anexos.push({nome:a.nome,path,hash:a.hash,bytes:bytes.length});
        }
        const nome=p.numero_registro.replace(/[^A-Z0-9_-]/gi,'_')+'_analise.pdf', path=join(dir,nome);
        writeFileSync(path,pdf,{flag:'wx'});anexos.push({nome,path,hash:hashBytes(pdf),bytes:pdf.length});
        const atualizacao=!!db.prepare(`SELECT id FROM envios_clientes WHERE cliente_id=? AND contato_id=? AND numero_registro=? AND status='enviado' LIMIT 1`).get(p.cliente_id,p.contato_id,p.numero_registro);
        const snap:SnapshotEnvio={para:d.contato.email,contato:d.contato.nome,cliente:d.cliente.razao_social,cnpj:d.cliente.cnpj,versao:r.versao,...textoMensagem(r,d,atualizacao),anexos};
        db.prepare(`UPDATE envios_clientes SET snapshot_json=?,status=?,motivo=?,erro=NULL,aprovado_por=?,aprovado_em=?,contexto_aprovacao=?,atualizado_em=datetime('now') WHERE id=? AND status='preparando'`)
          .run(JSON.stringify(snap),automatico?'na_fila':'revisao',d.status==='confirmado'?null:'Confirme a aplicabilidade deste documento ao cliente.',automatico?'Regra automática configurada':null,automatico?new Date().toISOString():null,automatico?contexto(d):null,row.id);
        preparados++;gerados++;
      } catch(e) {db.prepare(`UPDATE envios_clientes SET status='falhou',erro=?,atualizado_em=datetime('now') WHERE id=? AND status='preparando'`).run((e as Error).message.slice(0,2000),row.id);}
    }
    return {preparados,bloqueados};
  } finally {preparando.delete(db);}
}
export function aprovarEnvio(db:Db,id:number,responsavel:string,previsualizacaoHash?:string):void {
  if(!responsavel.trim())throw new ErroCadastro('Informe o responsável pela aprovação.');
  const r=lerEnvio(db,id);
  if(!['revisao','bloqueado'].includes(r.status)||!r.snapshot_json)throw new ErroCadastro('Prepare o conteúdo antes de aprovar este envio.',409);
  if(previsualizacaoHash&&hashBytes(r.snapshot_json)!==previsualizacaoHash)throw new ErroCadastro('A prévia mudou. Abra-a novamente antes de aprovar.',409);
  const d=destinatario(db,r.cliente_id,r.contato_id,r.numero_registro);
  if(d.status!=='confirmado')throw new ErroCadastro('Confirme a aplicabilidade do documento na ficha do cliente antes de aprovar.',409);
  const relatorio=obterRelatorio(db,r.numero_registro), snap=JSON.parse(r.snapshot_json) as SnapshotEnvio;
  if(relatorio.versao!==r.versao||snap.para!==d.contato.email||snap.cliente!==d.cliente.razao_social||snap.cnpj!==d.cliente.cnpj||snap.contato!==d.contato.nome)throw new ErroCadastro('Conteúdo ou destinatário alterado. Reprepare e confira a nova prévia.',409);
  db.transaction(() => {
    db.prepare(`UPDATE envios_clientes SET status='na_fila',motivo=NULL,erro=NULL,aprovado_por=?,aprovado_em=datetime('now'),contexto_aprovacao=?,atualizado_em=datetime('now') WHERE id=?`)
      .run(responsavel.trim().slice(0,250),contexto(d),id);
    auditarCadastro(db,'envio',id,'aprovar',{responsavel,versao:r.versao,para:snap.para});
  })();
}
export function cancelarEnvio(db:Db,id:number):void {
  const r=lerEnvio(db,id);
  if(['enviando','enviado','preparando'].includes(r.status))throw new ErroCadastro('O envio já começou ou foi concluído.',409);
  atualizar(db,id,'cancelado','Cancelado pelo usuário.');
  db.prepare('UPDATE envios_clientes SET proxima_tentativa=NULL WHERE id=?').run(id);
  auditarCadastro(db,'envio',id,'cancelar',{});
}
export function reprepararEnvio(db:Db,id:number,confirmarRisco=false):void {
  const r=lerEnvio(db,id);
  if(['enviando','enviado','preparando'].includes(r.status))throw new ErroCadastro('Este envio está em andamento ou já foi concluído.',409);
  if(r.status==='incerto'&&!confirmarRisco)throw new ErroCadastro('Confira o provedor e confirme o risco de duplicidade antes de tentar novamente.',409);
  db.prepare(`UPDATE envios_clientes SET status='bloqueado',snapshot_json=NULL,aprovado_por=NULL,aprovado_em=NULL,contexto_aprovacao=NULL,
    erro=NULL,proxima_tentativa=NULL,atualizado_em=datetime('now') WHERE id=?`).run(id);
  auditarCadastro(db,'envio',id,'repreparar',{confirmarRisco});
}
export function anexoEnvio(db:Db,id:number,indice:number) {
  const r=lerEnvio(db,id), s:SnapshotEnvio|null=r.snapshot_json?JSON.parse(r.snapshot_json):null;
  const anexo=s?.anexos[indice];if(!anexo)throw new ErroCadastro('Anexo não encontrado.',404);
  const path=arquivoPermitido(anexo.path), bytes=readFileSync(path);
  if(hashBytes(bytes)!==anexo.hash)throw new ErroCadastro('Anexo foi alterado ou corrompido. Reprepare o envio.',409);
  return {nome:anexo.nome,bytes};
}
interface ResultadoSmtp { accepted?:unknown[]; rejected?:unknown[]; messageId?:string; response?:string }
type OpcoesEnvio={sendMail?:(mensagem:Record<string,unknown>)=>Promise<ResultadoSmtp>};
const enviando=new WeakSet<Db>();
/** Reserva no SQLite antes do primeiro await e nunca interpreta aceitação SMTP como leitura. */
export async function processarFila(db:Db,opt:OpcoesEnvio={}):Promise<{enviados:number;falhas:number}> {
  exigirSqliteOperacional(db.name);
  if(enviando.has(db))return {enviados:0,falhas:0};
  enviando.add(db);
  let enviados=0,falhas=0;
  let transporte:any=null;
  try {
    const rows=db.prepare(`SELECT id FROM envios_clientes WHERE status='na_fila' OR
      (status='falhou' AND proxima_tentativa IS NOT NULL AND proxima_tentativa<=datetime('now') AND tentativas<3) ORDER BY id LIMIT 20`).all() as {id:number}[];
    for(const {id} of rows) {
      const r=lerEnvio(db,id);let d:Destinatario;
      // A instalação anterior continua operando apenas para o escritório inicial até a configuração ser migrada.
      const scoped=smtpEscritorio(db,r.escritorio_id);
      const legacy=r.escritorio_id===1?lerNotificacoes(db).email:null;
      const smtp=scoped||(legacy?.ativo&&legacy.host&&legacy.from?legacy:null);
      if(!smtp){if(r.escritorio_id!==1)atualizar(db,id,'bloqueado','Configure e ative o SMTP deste escritório antes de enviar.');continue;}
      try {
        d=destinatario(db,r.cliente_id,r.contato_id,r.numero_registro);
        if(!d.incluir_envio||d.status!=='confirmado'||!r.aprovado_por||r.contexto_aprovacao!==contexto(d))throw new Error('Aprovação ou aplicabilidade desatualizada. Confira novamente antes de enviar.');
        if(obterRelatorio(db,r.numero_registro).versao!==r.versao)throw new Error('Versão da análise alterada. Confira a nova versão.');
      } catch(e) {atualizar(db,id,'bloqueado',(e as Error).message);continue;}
      if(!r.snapshot_json){atualizar(db,id,'bloqueado','Prepare os anexos antes de enviar.');continue;}
      const snap=JSON.parse(r.snapshot_json) as SnapshotEnvio;
      if(snap.para!==d.contato.email){atualizar(db,id,'bloqueado','Destinatário alterado. Reprepare o envio.');continue;}
      const attachments=[] as {filename:string;content:Buffer}[];
      try {
        snap.anexos.forEach((a,i)=>attachments.push({filename:a.nome,content:anexoEnvio(db,id,i).bytes}));
        const limite=Math.max(1,Number(process.env.MAIL_MAX_ATTACHMENT_MB)||20)*1024*1024;
        // Base64 aumenta o tamanho. A margem inclui codificação e cabeçalhos MIME.
        if(attachments.reduce((n,a)=>n+a.content.length,0)*1.4>limite)throw new Error(`Anexos ultrapassam o limite de ${Math.round(limite/1024/1024)} MB. Ajuste o limite ao seu provedor.`);
      } catch(e) {db.prepare(`UPDATE envios_clientes SET status='falhou',erro=?,proxima_tentativa=NULL WHERE id=?`).run((e as Error).message.slice(0,2000),id);falhas++;continue;}
      const messageId=r.message_id||`<${randomUUID()}@mediador.local>`;
      if(!db.prepare(`UPDATE envios_clientes SET status='enviando',tentativas=tentativas+1,message_id=?,proxima_tentativa=NULL,atualizado_em=datetime('now')
        WHERE id=? AND status IN ('na_fila','falhou')`).run(messageId,id).changes)continue;
      try {
        const msg={from:smtp.from,to:snap.para,subject:snap.assunto,text:snap.texto,html:snap.html,attachments,messageId};
        if(!transporte)transporte=criarTransporteEmail({slack:{ativo:false,webhook:''},email:{ativo:smtp.ativo,host:smtp.host,port:smtp.port,secure:smtp.secure,user:smtp.user,password:smtp.password,from:smtp.from,to:''}});
        exigirSqliteOperacional(db.name);
        const info=opt.sendMail?await opt.sendMail(msg):await transporte.sendMail(msg);
        const accepted=(info.accepted||[]).map((a:unknown)=>typeof a==='string'?a:(a as {address?:string})?.address).some((a:string|undefined)=>a?.toLowerCase()===snap.para.toLowerCase());
        if(!accepted)throw Object.assign(new Error('O servidor SMTP não aceitou o destinatário.'),{responseCode:550});
        db.transaction(() => {
          db.prepare(`UPDATE envios_clientes SET status='enviado',erro=NULL,motivo=NULL,message_id=?,resposta_smtp=?,enviado_em=datetime('now'),atualizado_em=datetime('now') WHERE id=? AND status='enviando'`)
            .run(info.messageId||messageId,String(info.response||'Destinatário aceito pelo servidor SMTP').slice(0,2000),id);
          db.prepare("INSERT INTO tentativas_envio(envio_id,resultado,message_id) VALUES (?,'aceito_smtp',?)").run(id,info.messageId||messageId);
        })();enviados++;
      } catch(e) {
        const error=e as Error&{code?:string;responseCode?:number};
        const incerto=['ETIMEDOUT','ECONNRESET','EPIPE','ESOCKET'].includes(error.code||'');
        const transiente=(!!error.responseCode&&error.responseCode>=400&&error.responseCode<500)||['ECONNECTION','EDNS'].includes(error.code||'');
        const tentativas=lerEnvio(db,id).tentativas;
        const retry=!incerto&&transiente&&tentativas<3;
        db.transaction(() => {
          db.prepare(`UPDATE envios_clientes SET status=?,erro=?,proxima_tentativa=${retry?"datetime('now','+5 minutes')":'NULL'},atualizado_em=datetime('now') WHERE id=?`)
            .run(incerto?'incerto':'falhou',error.message.slice(0,2000),id);
          db.prepare('INSERT INTO tentativas_envio(envio_id,resultado,erro,message_id) VALUES (?,?,?,?)').run(id,incerto?'incerto':'falhou',error.message.slice(0,2000),messageId);
        })();falhas++;
      }
    }
    return {enviados,falhas};
  } finally {transporte?.close();enviando.delete(db);}
}
