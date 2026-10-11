import { afterEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdirSync,mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { resolve,join,sep } from 'node:path';
import { z } from 'zod';
import { openDb,type Db } from '../src/db.js';
import { criarAcessoHttp } from '../src/auth-http.js';
import { hashToken,tokenCsrf } from '../src/autenticacao.js';
import { salvarUsuario,salvarEscritorio,vincularUsuarioEscritorio,vincularUsuarioCliente } from '../src/organizacoes.js';
import { salvarCliente,salvarContato,ErroCadastro } from '../src/cadastros.js';
import { tratarGestaoContexto } from '../src/gestao-contexto-api.js';
import { tratarInterpretacoesContexto } from '../src/interpretacoes-contexto-api.js';
import { tratarCadastrosContexto } from '../src/cadastros-contexto-api.js';
import { CAMPOS_CCT,validarExtracaoCct } from '../src/cct-template.js';
import { hashBytes } from '../src/relatorios.js';
import { migrarInterpretacoes } from '../src/migracao-interpretacoes.js';
import { prepararConsolidacaoContexto } from '../src/interpretacoes-contexto.js';

const recursos:{db:Db;server:Server;pasta:string}[]=[];
afterEach(async()=>{for(const r of recursos.splice(0)){r.server.closeAllConnections();await new Promise<void>(done=>r.server.close(()=>done()));r.db.close();if(!r.pasta.startsWith(resolve('data')+sep))throw new Error('Pasta inválida');rmSync(r.pasta,{recursive:true,force:true});}});
const baseDoc='DF000100/2026',aditivo='DF000101/2026',privado='DF000102/2026',campo=CAMPOS_CCT.find(c=>!c.id.startsWith('s01_'))!.id;
async function fixture(){
  const db=openDb(':memory:'),b=salvarEscritorio(db,null,{nome:'Escritório B',cnpj:'04252011000110'}),uid=salvarUsuario(db,null,{nome:'Revisor real',email:'real@example.test'});
  vincularUsuarioEscritorio(db,uid,1,'administrador');vincularUsuarioEscritorio(db,uid,b,'administrador');
  const ca=salvarCliente(db,null,{razao_social:'Cliente A',cnpj:'11222333000181'},1),cb=salvarCliente(db,null,{razao_social:'Cliente B',cnpj:'11444777000161'},b);
  mkdirSync('data',{recursive:true});const pasta=mkdtempSync(join(resolve('data'),'sprint3-test-'));
  for(const n of [baseDoc,aditivo,privado]){
    const bytes=Buffer.from('<html><body>Regra original com evidencia literal do aditivo.</body></html>'),path=join(pasta,n.replace(/\W/g,'_')+'.doc');writeFileSync(path,bytes);
    const extracao=n===aditivo?{topicos:{},aditivo:{versao:'1',alteracoes:[{campo,acao:'revisar',valor:'Nova regra',clausula:'Cláusula 1',citacao:'evidencia literal do aditivo'}]}}:{topicos:{},padrao:validarExtracaoCct({campos:Object.fromEntries(CAMPOS_CCT.map(c=>[c.id,'Regra original']))})};
    db.prepare(`INSERT INTO registros(numero_registro,watch,tipo,arquivo_path,arquivo_hash,extracao_json,analise_status) VALUES (?,?,?,?,?,?,'analisado')`).run(n,'Filtro GLOBAL SECRETO',n===aditivo?'Termo Aditivo de Convenção Coletiva':'Convenção Coletiva',path,hashBytes(bytes),JSON.stringify(extracao));
    for(const cliente of n===privado?[cb]:[ca,cb])db.prepare("INSERT INTO clientes_documentos(cliente_id,numero_registro,motivo,contexto_hash) VALUES (?,?,'fixture','fixture')").run(cliente,n);
  }
  const token=randomBytes(32).toString('base64url'),agora=Date.now();db.prepare('INSERT INTO sessoes_usuarios(token_hash,usuario_id,criada_em,ultimo_acesso_em,expira_em) VALUES (?,?,?,?,?)').run(hashToken(token),uid,agora,agora,agora+3600000);
  let acesso:ReturnType<typeof criarAcessoHttp>,durante:(()=>void)|undefined;
  const server=createServer(async(req,res)=>{try{const url=new URL(req.url!,'http://localhost'),corpo=async()=>{let s='';for await(const c of req)s+=c;durante?.();return JSON.parse(s||'{}');};
    for(const tratar of [tratarGestaoContexto,tratarInterpretacoesContexto,tratarCadastrosContexto])if(await tratar(req,res,db,url,acesso,corpo))return;
    acesso.protegerLegado(req);res.writeHead(404);res.end();
  }catch(e){res.writeHead(e instanceof ErroCadastro?e.status:e instanceof z.ZodError?400:500,{'content-type':'application/json'});res.end(JSON.stringify({erro:(e as Error).message}));}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;acesso=criarAcessoHttp(db,{publicUrl:origin});recursos.push({db,server,pasta});
  const req=(path:string,method='GET',body?:unknown,office=1,extra:Record<string,string>={})=>fetch(origin+path,{method,headers:{cookie:`mediador_sessao=${token}`,'x-csrf-token':tokenCsrf(token),'content-type':'application/json','x-context-type':'escritorio','x-context-id':String(office),...extra},body:body===undefined?undefined:JSON.stringify(body)});
  const cons=(office=1)=>req('/api/contexto/interpretacoes/consolidar','POST',{base:baseDoc},office);
  const link=(office=1,base:string|null=baseDoc,revisao=0)=>req('/api/contexto/vinculos','POST',{aditivo,base,justificativa:'Conferido pelo escritório '+office,revisao},office);
  return {db,b,uid,ca,cb,pasta,req,cons,link,durante:(fn:()=>void)=>{durante=fn;}};
}
it('isola vínculos, revisões, versões e Markdown da mesma CCT; repetir consolidação preserva decisão',async()=>{
  const f=await fixture();expect((await f.link()).status).toBe(200);expect((await f.link(f.b)).status).toBe(200);
  const a=await (await f.cons()).json(),b=await (await f.cons(f.b)).json();expect(a.versao).not.toBe(b.versao);
  for(const [office,versao,valor] of [[1,a.versao,'Regra privada A'],[f.b,b.versao,'Regra privada B']] as const){
    const r=await f.req('/api/contexto/revisoes','POST',{base:baseDoc,campo,aditivo,acao:'manual',valor,justificativa:'Decisão interna independente',versao},office);expect(r.status).toBe(200);
  }
  expect((await f.cons()).status).toBe(200);
  for(const [office,cliente,esperado,negado] of [[1,f.ca,'Regra privada A','Regra privada B'],[f.b,f.cb,'Regra privada B','Regra privada A']] as const){
    const r=await f.req(`/api/contexto/relatorio?base=${baseDoc}&cliente=${cliente}&formato=md`,'GET',undefined,office);expect(r.status).toBe(200);const text=await r.text();expect(text).toContain(esperado);expect(text).not.toContain(negado);expect(text).not.toContain('GLOBAL SECRETO');
  }
  const pdf=await f.req(`/api/contexto/relatorio?base=${baseDoc}&cliente=${f.ca}&formato=pdf`);expect(pdf.status).toBe(200);
  expect(Buffer.from(await pdf.arrayBuffer()).subarray(0,4).toString('latin1')).toBe('%PDF');
  expect(f.db.prepare('SELECT COUNT(*) n FROM revisoes_pendencias').get()).toEqual({n:0});
  expect((await f.req('/api/contexto/revisoes','POST',{base:baseDoc,campo,aditivo,acao:'manter',justificativa:'Versão já substituída',versao:a.versao})).status).toBe(409);
  const audit=f.db.prepare("SELECT ator_id,escritorio_id,detalhes_json FROM auditoria_seguranca WHERE acao='INTERPRETACAO_REVISADA'").all() as {ator_id:number;escritorio_id:number;detalhes_json:string}[];expect(audit.map(a=>a.escritorio_id)).toEqual([1,f.b]);expect(audit.every(a=>a.ator_id===f.uid)).toBe(true);
});
it('bloqueia documento, vínculo e exportações cruzados antes de acessar arquivos ou gerar PDF',async()=>{
  const f=await fixture();
  for(const path of [`/api/contexto/interpretacoes?base=${privado}`,`/api/contexto/relatorio?base=${baseDoc}&cliente=${f.cb}&formato=pdf`,`/api/contexto/relatorio?base=${baseDoc}&cliente=${f.cb}&formato=md`,`/api/contexto/clientes/${f.cb}/documentos/original?numero=${baseDoc}`])expect((await f.req(path)).status).toBe(404);
  expect((await f.link(1,privado)).status).toBe(404);
  expect((await f.req('/api/contexto/interpretacoes','GET',undefined,1,{cookie:''})).status).toBe(401);
  expect((await f.req('/api/contexto/interpretacoes/consolidar','POST',{base:baseDoc},1,{'x-csrf-token':''})).status).toBe(403);
  vincularUsuarioCliente(f.db,f.uid,f.ca);expect((await f.req('/api/contexto/interpretacoes','GET',undefined,f.ca,{'x-context-type':'cliente'})).status).toBe(403);
  expect((await f.req('/api/contexto/vinculos','POST',{aditivo,base:baseDoc,justificativa:'Forjado para teste',revisao:0,escritorio_id:f.b})).status).toBe(400);
});
it('invalida só o escritório cujo vínculo mudou, detecta originais alterados e concorrência',async()=>{
  const f=await fixture();await f.link();await f.link(f.b);await f.cons();await f.cons(f.b);
  expect((await f.link(1,null,0)).status).toBe(409);expect((await f.link(1,null,1)).status).toBe(200);
  expect((await (await f.req('/api/contexto/interpretacoes?base='+baseDoc)).json()).desatualizado).toBe(true);
  expect((await (await f.req('/api/contexto/interpretacoes?base='+baseDoc,'GET',undefined,f.b)).json()).desatualizado).toBe(false);
  const preparado=await prepararConsolidacaoContexto(f.db,1,baseDoc);await f.link(1,baseDoc,2);expect(()=>preparado.gravar(f.uid)).toThrow('alteradas');
  writeFileSync(join(f.pasta,baseDoc.replace(/\W/g,'_')+'.doc'),'corrompido');expect((await f.cons()).status).toBe(409);
});
it('revalida revogação durante leitura e faz rollback da decisão se a auditoria falhar',async()=>{
  const f=await fixture();f.db.exec("CREATE TRIGGER falha_audit BEFORE INSERT ON auditoria_seguranca BEGIN SELECT RAISE(ABORT,'Falha audit teste'); END");
  expect((await f.link()).status).toBe(500);expect(f.db.prepare('SELECT COUNT(*) n FROM vinculos_escritorio').get()).toEqual({n:0});
  f.db.exec('DROP TRIGGER falha_audit');f.durante(()=>f.db.prepare('UPDATE usuarios_escritorios SET ativo=0 WHERE usuario_id=? AND escritorio_id=1').run(f.uid));
  expect((await f.cons()).status).toBe(403);
});
it('autoriza anexos pelo cliente do envio e verifica hash sem expor snapshot ou caminho',async()=>{
  const f=await fixture(),contato=salvarContato(f.db,null,{nome:'Contato B',email:'b@example.test'},f.b),path=join(f.pasta,'anexo.pdf'),bytes=Buffer.from('%PDF-test');writeFileSync(path,bytes);
  const id=Number(f.db.prepare("INSERT INTO envios_clientes(cliente_id,contato_id,numero_registro,versao,status,snapshot_json) VALUES (?,?,?,'1','revisao',?)").run(f.cb,contato,baseDoc,JSON.stringify({anexos:[{path,hash:hashBytes(bytes),nome:'relatorio.pdf'}]})).lastInsertRowid);
  expect((await f.req(`/api/contexto/anexo?envio=${id}&indice=0`)).status).toBe(404);
  const r=await f.req(`/api/contexto/anexo?envio=${id}&indice=0`,'GET',undefined,f.b);expect(r.status).toBe(200);expect(Buffer.from(await r.arrayBuffer())).toEqual(bytes);
  writeFileSync(path,'corrompido');expect((await f.req(`/api/contexto/anexo?envio=${id}&indice=0`,'GET',undefined,f.b)).status).toBe(409);
});
it('mantém resumos e histórico no escopo e nunca reaproveita logs de jobs globais',async()=>{
  const f=await fixture();await f.link();f.db.prepare("INSERT INTO execucoes(watch,erro) VALUES ('SEGREDO B','TOKEN SECRETO')").run();
  const a=await (await f.req('/api/contexto/resumo')).json(),b=await (await f.req('/api/contexto/resumo','GET',undefined,f.b)).json();expect(a.documentos).toBe(2);expect(b.documentos).toBe(3);
  expect((await (await f.req('/api/contexto/logs','GET',undefined,f.b)).json()).length).toBe(0);
  expect(await (await f.req('/api/contexto/execucoes')).text()).not.toContain('SEGREDO');
  f.db.prepare("UPDATE usuarios_escritorios SET papel='operador' WHERE usuario_id=?").run(f.uid);
  expect((await f.req('/api/contexto/logs')).status).toBe(403);expect((await f.req('/api/contexto/usuarios')).status).toBe(403);
});
it('CRUD de escritório distingue plataforma de administrador local e preserva dependências',async()=>{
  const f=await fixture();expect((await f.req('/api/plataforma/escritorios')).status).toBe(403);
  expect((await f.req('/api/contexto/escritorio','PUT',{nome:'Meu escritório',email:'',telefone:''})).status).toBe(200);
  expect((await f.req('/api/contexto/escritorio','PUT',{nome:'Nome',email:'',telefone:'',ativo:false})).status).toBe(400);
  f.db.prepare("INSERT INTO papeis_plataforma VALUES (?,'administrador_plataforma',1)").run(f.uid);
  const r=await f.req('/api/plataforma/escritorios','POST',{nome:'Novo vazio',cnpj:'19131243000197'});expect(r.status).toBe(201);const novo=await r.json();
  expect((await f.req('/api/plataforma/escritorios/'+novo.id,'DELETE')).status).toBe(200);
  expect((await f.req('/api/plataforma/escritorios/'+f.b,'DELETE')).status).toBe(409);
  expect((await f.req('/api/plataforma/escritorios/'+f.b,'PUT',{nome:'Inativo B',cnpj:'04252011000110',ativo:false})).status).toBe(200);
  expect((await f.req('/api/contexto/resumo','GET',undefined,f.b)).status).toBe(403);
});
it('cadastro com senha e vínculo de conta existente preservam identidade global, papéis e último administrador',async()=>{
  const f=await fixture();const r=await f.req('/api/contexto/usuarios','POST',{modo:'cadastrar',nome:'Nova Pessoa',email:'nova@example.test',senha:'Uma senha longa de teste',papel:'operador'});expect(r.status).toBe(201);const u=await r.json();
  expect((f.db.prepare('SELECT senha_hash FROM credenciais_usuarios WHERE usuario_id=?').get(u.id) as {senha_hash:string}).senha_hash).toMatch(/^scrypt\$/);
  expect(await (await f.req('/api/contexto/usuarios')).text()).not.toContain('senha_hash');
  expect((await f.req('/api/contexto/usuarios','POST',{modo:'vincular',email:'nova@example.test',papel:'administrador'},f.b)).status).toBe(201);
  expect((await f.req('/api/contexto/usuarios/'+u.id,'PUT',{ativo:false})).status).toBe(200);
  expect(f.db.prepare('SELECT ativo FROM usuarios_escritorios WHERE usuario_id=? AND escritorio_id=?').get(u.id,f.b)).toEqual({ativo:1});
  expect((await f.req('/api/contexto/usuarios/'+f.uid,'PUT',{ativo:false})).status).toBe(409);
  expect((await f.req('/api/contexto/usuarios','POST',{modo:'vincular',email:'nova@example.test',papel:'cliente',cliente_id:f.cb})).status).toBe(404);
  expect((await f.req('/api/contexto/usuarios','POST',{modo:'vincular',email:'nova@example.test',papel:'operador',senha:'Nao substituir outra senha'})).status).toBe(400);
  const alheio=salvarUsuario(f.db,null,{nome:'Alheio',email:'alheio@example.test'});vincularUsuarioEscritorio(f.db,alheio,f.b,'operador');
  expect((await f.req('/api/contexto/usuarios/'+alheio,'PUT',{ativo:false})).status).toBe(404);
  expect(await (await f.req('/api/contexto/logs')).text()).not.toContain('Uma senha longa');
});
it('migração é idempotente e conserva histórico anterior somente no escritório inicial',async()=>{
  const f=await fixture();
  f.db.prepare("INSERT INTO auditoria_revisoes(base_registro,campo,aditivo_registro,contexto_hash,decisao_json,revisor) VALUES (?,?,?,'abc','{}','Revisor legado')").run(baseDoc,campo,aditivo);
  for(const t of ['vinculos_escritorio','interpretacoes_escritorio','versoes_interpretacao','historico_interpretacoes_legado'])f.db.exec('DROP TABLE '+t);
  f.db.exec("DROP INDEX idx_auditoria_seguranca_escritorio;DELETE FROM migracoes_aplicadas WHERE chave='005-interpretacoes-escritorio'");
  migrarInterpretacoes(f.db);migrarInterpretacoes(f.db);
  expect(f.db.prepare('SELECT COUNT(*) n FROM historico_interpretacoes_legado').get()).toEqual({n:1});
  expect(await (await f.req('/api/contexto/interpretacoes/legado')).text()).toContain('Revisor legado');
  expect(await (await f.req('/api/contexto/interpretacoes/legado','GET',undefined,f.b)).text()).not.toContain('Revisor legado');
  expect(f.db.pragma('foreign_key_check')).toEqual([]);
});
