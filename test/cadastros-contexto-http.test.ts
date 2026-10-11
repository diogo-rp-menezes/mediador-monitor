import { afterEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { z } from 'zod';
import { criarSindicato, openDb, type Db } from '../src/db.js';
import { criarAcessoHttp } from '../src/auth-http.js';
import { hashToken, tokenCsrf } from '../src/autenticacao.js';
import { tratarCadastrosContexto } from '../src/cadastros-contexto-api.js';
import { ErroCadastro, salvarCliente, salvarContato } from '../src/cadastros.js';
import { salvarEscritorio, salvarUsuario, vincularUsuarioEscritorio, vincularUsuarioCliente } from '../src/organizacoes.js';
import { hashBytes } from '../src/relatorios.js';
import { prepararEnvios, processarFila } from '../src/envios.js';
import { salvarNotificacoes } from '../src/settings.js';

const recursos: {db:Db; server:Server}[]=[];
const pastas:string[]=[];
afterEach(async()=>{for(const r of recursos.splice(0)){r.server.closeAllConnections();await new Promise<void>(resolve=>r.server.close(()=>resolve()));r.db.close();}for(const pasta of pastas.splice(0)){if(!pasta.startsWith(resolve('data')+sep))throw new Error('Pasta de teste inválida');rmSync(pasta,{recursive:true,force:true});}});
async function fixture(){
  const db=openDb(':memory:'), b=salvarEscritorio(db,null,{nome:'Escritório B',cnpj:'04252011000110'});
  const uid=salvarUsuario(db,null,{nome:'Operador A',email:'a@example.test'});
  vincularUsuarioEscritorio(db,uid,1,'operador');vincularUsuarioEscritorio(db,uid,b,'administrador');
  const ca=salvarCliente(db,null,{razao_social:'Empresa A',cnpj:'11222333000181'},1);
  const cb=salvarCliente(db,null,{razao_social:'Empresa B',cnpj:'11444777000161'},b);
  const ta=salvarContato(db,null,{nome:'Contato A',email:'a@example.test'},1);
  const tb=salvarContato(db,null,{nome:'Contato B',email:'b@example.test'},b);
  const token=randomBytes(32).toString('base64url'), agora=Date.now();
  db.prepare('INSERT INTO sessoes_usuarios(token_hash,usuario_id,criada_em,ultimo_acesso_em,expira_em) VALUES (?,?,?,?,?)').run(hashToken(token),uid,agora,agora,agora+3600000);
  let acesso:ReturnType<typeof criarAcessoHttp>, antesCorpo:(()=>void)|undefined;
  const server=createServer(async(req,res)=>{try{
    acesso.validarRequisicao(req);
    const corpo=async()=>{let texto='';for await(const chunk of req)texto+=chunk;antesCorpo?.();return JSON.parse(texto||'{}');};
    if(await tratarCadastrosContexto(req,res,db,new URL(req.url!,'http://localhost'),acesso,corpo))return;
    acesso.protegerLegado(req);res.writeHead(404);res.end();
  }catch(e){res.writeHead(e instanceof ErroCadastro?e.status:e instanceof z.ZodError?400:500,{'content-type':'application/json'});res.end(JSON.stringify({erro:(e as Error).message}));}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;acesso=criarAcessoHttp(db,{publicUrl:base});recursos.push({db,server});
  const req=(path:string,method='GET',body?:unknown,office:number|string=1,extra:Record<string,string>={})=>fetch(base+path,{method,headers:{cookie:`mediador_sessao=${token}`,'content-type':'application/json','x-csrf-token':tokenCsrf(token),'x-context-type':'escritorio','x-context-id':String(office),...extra},body:body===undefined?undefined:JSON.stringify(body)});
  return {db,b,uid,ca,cb,ta,tb,req,revogarDuranteCorpo:()=>{antesCorpo=()=>db.prepare('UPDATE usuarios_escritorios SET ativo=0 WHERE usuario_id=? AND escritorio_id=1').run(uid);}};
}
it('isola listagens simultâneas e detalhes mesmo para usuário membro de dois escritórios',async()=>{
  const f=await fixture();const [a,b]=await Promise.all([f.req('/api/contexto/clientes'),f.req('/api/contexto/clientes','GET',undefined,f.b)]);
  expect((await a.json()).map((c:{id:number})=>c.id)).toEqual([f.ca]);expect((await b.json()).map((c:{id:number})=>c.id)).toEqual([f.cb]);
  expect((await f.req(`/api/contexto/clientes/${f.cb}`)).status).toBe(404);
  expect((await f.req(`/api/contexto/contatos/${f.tb}`)).status).toBe(404);
  expect((await (await f.req('/api/contexto/contatos')).json()).map((c:{id:number})=>c.id)).toEqual([f.ta]);
});
it('rejeita alteração/exclusão cruzadas e vínculos de contato de outro escritório atomicamente',async()=>{
  const f=await fixture(), dados={razao_social:'Nome alterado',cnpj:'11444777000161'};
  expect((await f.req(`/api/contexto/clientes/${f.cb}`,'PUT',dados)).status).toBe(404);
  expect((await f.req(`/api/contexto/clientes/${f.cb}`,'DELETE')).status).toBe(404);
  expect((await f.req(`/api/contexto/contatos/${f.tb}`,'PUT',{nome:'Alterado',email:'b@example.test'})).status).toBe(404);
  expect((await f.req(`/api/contexto/contatos/${f.tb}`,'DELETE')).status).toBe(404);
  expect((await f.req(`/api/contexto/clientes/${f.ca}`,'PUT',{razao_social:'Não gravar',cnpj:'11222333000181',contatos:[{contato_id:f.tb}]})).status).toBe(404);
  expect(f.db.prepare('SELECT razao_social FROM clientes WHERE id=?').get(f.ca)).toEqual({razao_social:'Empresa A'});
  expect(f.db.prepare('SELECT COUNT(*) n FROM auditoria_seguranca').get()).toEqual({n:0});
});
it('cria no escritório selecionado e audita o ator real; rejeita atribuições pelo corpo',async()=>{
  const f=await fixture(), dados={nome:'Novo contato',email:'novo@example.test'};
  const resposta=await f.req('/api/contexto/contatos','POST',dados,f.b);expect(resposta.status).toBe(201);const {id}=await resposta.json();
  expect(f.db.prepare('SELECT escritorio_id FROM contatos WHERE id=?').get(id)).toEqual({escritorio_id:f.b});
  expect(f.db.prepare('SELECT ator_id,escritorio_id FROM auditoria_seguranca').get()).toEqual({ator_id:f.uid,escritorio_id:f.b});
  expect((await f.req('/api/contexto/contatos','POST',{...dados,escritorio_id:1},f.b)).status).toBe(400);
  expect((await f.req('/api/contexto/clientes','POST',{razao_social:'Nova empresa',cnpj:'19131243000197'},f.b)).status).toBe(201);
  expect((await f.req(`/api/contexto/contatos/${id}`,'DELETE',undefined,f.b)).status).toBe(200);
});
it('exige contexto válido, CSRF, vínculos ativos e revalida depois de ler o corpo',async()=>{
  const f=await fixture();
  expect((await f.req('/api/contexto/clientes','GET',undefined,'')).status).toBe(400);
  expect((await f.req('/api/contexto/clientes','GET',undefined,999)).status).toBe(403);
  expect((await f.req('/api/contexto/contatos','POST',{nome:'Contato',email:'novo@example.test'},1,{'x-csrf-token':''})).status).toBe(403);
  f.revogarDuranteCorpo();expect((await f.req('/api/contexto/contatos','POST',{nome:'Contato',email:'novo@example.test'})).status).toBe(403);
  expect((await f.req('/api/contexto/clientes')).status).toBe(403);
});
it('permite e-mail igual em escritórios distintos sem compartilhar contato ou vínculo',async()=>{
  const f=await fixture();const novo=await f.req('/api/contexto/contatos','POST',{nome:'Mesmo e-mail em B',email:'a@example.test'},f.b);
  expect(novo.status).toBe(201);const {id}=await novo.json();expect(id).not.toBe(f.ta);
  expect((await f.req('/api/contexto/contatos','POST',{nome:'Duplicado B',email:'A@example.test'},f.b)).status).toBe(409);
  expect((await f.req(`/api/contexto/clientes/${f.cb}`,'PUT',{razao_social:'Empresa B',cnpj:'11444777000161',contatos:[{contato_id:id}]},f.b)).status).toBe(200);
  const detalhe=await (await f.req(`/api/contexto/clientes/${f.cb}`,'GET',undefined,f.b)).json();
  expect(detalhe.contatos.map((c:{contato_id:number})=>c.contato_id)).toEqual([id]);
  expect((await f.req(`/api/contexto/contatos/${id}`)).status).toBe(404);
});
it('cliente não acessa cadastro interno; suporte justificado lê mas não escreve',async()=>{
  const f=await fixture();vincularUsuarioCliente(f.db,f.uid,f.ca);
  expect((await f.req(`/api/contexto/clientes/${f.ca}`,'DELETE')).status).toBe(409);
  expect((await f.req('/api/contexto/clientes','GET',undefined,f.ca,{'x-context-type':'cliente'})).status).toBe(403);
  f.db.prepare('UPDATE usuarios_escritorios SET ativo=0 WHERE usuario_id=?').run(f.uid);
  f.db.prepare("INSERT INTO papeis_plataforma(usuario_id,papel) VALUES (?,'suporte')").run(f.uid);
  // Concessão sintética vinculada à sessão; o fluxo de emissão tem testes próprios.
  const contexto=await f.req('/api/contexto/clientes');expect(contexto.status).toBe(403);
  const sessao=f.db.prepare('SELECT token_hash FROM sessoes_usuarios').get() as {token_hash:string};
  const concessao='ba4e5292-56e2-4e37-a554-83644a33ed94';
  f.db.prepare('INSERT INTO concessoes_suporte(id,sessao_hash,escritorio_id,justificativa,criada_em,expira_em) VALUES (?,?,?,?,?,?)').run(concessao,sessao.token_hash,1,'Suporte autorizado',Date.now(),Date.now()+60000);
  expect((await f.req('/api/contexto/clientes','GET',undefined,1,{'x-support-grant':concessao})).status).toBe(200);
  expect((await f.req('/api/contexto/contatos','POST',{nome:'Contato',email:'novo@example.test'},1,{'x-support-grant':concessao})).status).toBe(403);
  expect((await f.req('/api/clientes')).status).toBe(403);
  expect((await f.req('/api/contexto/monitoramentos','GET',undefined,1,{'x-support-grant':concessao})).status).toBe(200);
  expect((await f.req('/api/contexto/monitoramentos','POST',{},1,{'x-support-grant':concessao})).status).toBe(403);
});
it('separa filtros privados do mesmo sindicato e limita contadores do catálogo ao escritório',async()=>{
  const f=await fixture(),sid=criarSindicato(f.db,{nome:'Sindicato comum',cnpj:'',categoria:'Segredo legado',titulo:'Filtro legado privado',uf:'DF',tipo:'Convenção Coletiva',vigencia:'Vigentes',ativo:true});
  const dados={sindicato_id:sid,nome:'Consulta privada A',categoria:'Categoria A',titulo:'Segredo A',uf:'DF',tipos:['Convenção Coletiva'],ativo:true};
  const a=await f.req('/api/contexto/monitoramentos','POST',dados);expect(a.status).toBe(201);const aid=(await a.json()).id;
  const b=await f.req('/api/contexto/monitoramentos','POST',{...dados,nome:'Consulta privada B',categoria:'Categoria B',titulo:'Segredo B'},f.b);expect(b.status).toBe(201);const bid=(await b.json()).id;
  expect((await f.req(`/api/contexto/clientes/${f.ca}`,'PUT',{razao_social:'Empresa A',cnpj:'11222333000181',sindicatos:[{sindicato_id:sid}]})).status).toBe(200);
  const catalogoA=await(await f.req('/api/contexto/sindicatos')).json(),catalogoB=await(await f.req('/api/contexto/sindicatos','GET',undefined,f.b)).json();
  expect(catalogoA).toEqual([{id:sid,nome:'Sindicato comum',cnpj:'',clientes_total:1}]);expect(catalogoB[0].clientes_total).toBe(0);
  const listaA=await(await f.req('/api/contexto/monitoramentos')).json(),listaB=await(await f.req('/api/contexto/monitoramentos','GET',undefined,f.b)).json();
  expect(listaA.map((m:{titulo:string})=>m.titulo)).toEqual(['Segredo A']);expect(listaB.map((m:{titulo:string})=>m.titulo)).toEqual(['Segredo B']);
  expect((await f.req(`/api/contexto/monitoramentos/${bid}`)).status).toBe(404);
  expect((await f.req(`/api/contexto/monitoramentos/${bid}`,'PUT',dados)).status).toBe(404);
  expect((await f.req(`/api/contexto/monitoramentos/${bid}`,'DELETE')).status).toBe(404);
  expect((await f.req(`/api/contexto/monitoramentos/${aid}`,'DELETE')).status).toBe(409);
  expect((await f.req(`/api/contexto/monitoramentos/${aid}`,'PUT',{...dados,ativo:false})).status).toBe(200);
  expect((await f.req(`/api/contexto/monitoramentos/${bid}`,'DELETE',undefined,f.b)).status).toBe(200);
  expect(f.db.prepare('SELECT titulo FROM sindicatos WHERE id=?').get(sid)).toEqual({titulo:'Filtro legado privado'});
});
it('nega sindicato não configurado no escritório e payload de monitoramento com propriedade forjada',async()=>{
  const f=await fixture(),sid=criarSindicato(f.db,{nome:'Sindicato somente A',cnpj:'',categoria:'Categoria',titulo:'',uf:'DF',tipo:'Convenção Coletiva',vigencia:'Vigentes',ativo:true});
  const dados={sindicato_id:sid,nome:'Consulta A',categoria:'Categoria A',tipos:['Convenção Coletiva']};
  expect((await f.req('/api/contexto/monitoramentos','POST',{...dados,escritorio_id:f.b})).status).toBe(400);
  expect((await f.req('/api/contexto/monitoramentos','POST',dados)).status).toBe(201);
  expect((await f.req('/api/contexto/monitoramentos','POST',dados)).status).toBe(409);
  expect((await f.req(`/api/contexto/clientes/${f.cb}`,'PUT',{razao_social:'Empresa B',cnpj:'11444777000161',sindicatos:[{sindicato_id:sid}]},f.b)).status).toBe(404);
  expect(f.db.prepare('SELECT * FROM clientes_sindicatos WHERE cliente_id=?').all(f.cb)).toEqual([]);
  expect((await f.req('/api/contexto/sindicatos','PUT',{})).status).toBe(405);
  f.revogarDuranteCorpo();expect((await f.req('/api/contexto/monitoramentos','POST',dados)).status).toBe(403);
});
it('preserva vínculo legado do próprio cliente sem exigir configuração nova ou permitir outro cliente herdá-lo',async()=>{
  const f=await fixture(),sid=criarSindicato(f.db,{nome:'Sindicato legado tardio',cnpj:'',categoria:'Categoria',titulo:'',uf:'DF',tipo:'Convenção Coletiva',vigencia:'Vigentes',ativo:true});
  f.db.prepare('INSERT INTO clientes_sindicatos(cliente_id,sindicato_id,enquadramento_confirmado) VALUES (?,?,1)').run(f.ca,sid);
  expect((await f.req(`/api/contexto/clientes/${f.ca}`,'PUT',{razao_social:'Empresa A editada',cnpj:'11222333000181',sindicatos:[{sindicato_id:sid,enquadramento_confirmado:true}]})).status).toBe(200);
  expect(f.db.prepare('SELECT enquadramento_confirmado FROM clientes_sindicatos WHERE cliente_id=?').get(f.ca)).toEqual({enquadramento_confirmado:1});
  expect((await f.req(`/api/contexto/clientes/${f.cb}`,'PUT',{razao_social:'Empresa B',cnpj:'11444777000161',sindicatos:[{sindicato_id:sid}]},f.b)).status).toBe(404);
});
async function documentosFixture(){
  const f=await fixture(),numero='DF000001/2026';
  const sid=criarSindicato(f.db,{nome:'Sindicato documento público',cnpj:'',categoria:'Categoria',titulo:'',uf:'DF',tipo:'Convenção Coletiva',vigencia:'Vigentes',ativo:true});
  for(const cid of [f.ca,f.cb])f.db.prepare('INSERT INTO clientes_sindicatos(cliente_id,sindicato_id) VALUES (?,?)').run(cid,sid);
  mkdirSync('data',{recursive:true});const pasta=mkdtempSync(resolve('data','documentos-contexto-'));pastas.push(pasta);
  const path=join(pasta,'original.pdf'),bytes=Buffer.from('%PDF-1.4\nOriginal sintético');writeFileSync(path,bytes);
  f.db.prepare('INSERT INTO registros(numero_registro,watch,tipo,vigencia,arquivo_path,arquivo_hash,extracao_json) VALUES (?,?,?,?,?,?,?)')
    .run(numero,'Consulta global privada','Convenção Coletiva','2026',path,hashBytes(bytes),' {"revisao":"Não expor revisão global"}');
  f.db.prepare('INSERT INTO registros_sindicatos(numero_registro,sindicato_id) VALUES (?,?)').run(numero,sid);
  return {...f,numero,sid,path,bytes,baseA:`/api/contexto/clientes/${f.ca}/documentos`,baseB:`/api/contexto/clientes/${f.cb}/documentos`};
}
it('descobre apenas documentos do cliente autorizado e mantém decisões independentes para o mesmo original',async()=>{
  const f=await documentosFixture();expect(await(await f.req(f.baseA)).json()).toEqual([]);
  const lista=await(await f.req(f.baseA+'/atualizar','POST',{})).json();expect(lista).toHaveLength(1);
  expect(f.db.prepare('SELECT * FROM clientes_documentos WHERE cliente_id=?').all(f.cb)).toEqual([]);
  expect(JSON.stringify(lista)).not.toMatch(/arquivo_path|extracao_json|Consulta global privada|Não expor/);
  expect((await f.req(f.baseB)).status).toBe(404);expect((await f.req(f.baseB+'/atualizar','POST',{})).status).toBe(404);
  const a=await f.req(f.baseA+'/decidir','POST',{numero:f.numero,versao:lista[0].versao,status:'confirmado',justificativa:'Conferido pelo escritório A'});expect(a.status).toBe(200);
  const listaB=await(await f.req(f.baseB+'/atualizar','POST',{},f.b)).json();
  expect(listaB[0]).toMatchObject({status:'candidato',responsavel:null});
  expect((await f.req(f.baseB+'/decidir','POST',{numero:f.numero,versao:listaB[0].versao,status:'rejeitado',justificativa:'Não se aplica em B'},f.b)).status).toBe(200);
  expect((await(await f.req(f.baseA)).json())[0]).toMatchObject({status:'confirmado',responsavel:'Operador A',justificativa:'Conferido pelo escritório A'});
  expect(f.db.prepare("SELECT ator_id,escritorio_id,cliente_id FROM auditoria_seguranca WHERE acao='APLICABILIDADE_DECIDIDA' ORDER BY id").all()).toEqual([
    {ator_id:f.uid,escritorio_id:1,cliente_id:f.ca},{ator_id:f.uid,escritorio_id:f.b,cliente_id:f.cb}]);
  expect(f.db.prepare('SELECT incluir_envio FROM clientes_documentos').all()).toEqual([{incluir_envio:0},{incluir_envio:0}]);
});
it('recusa decisão obsoleta, identidade forjada e versão alterada; pausa da consulta não muda aplicabilidade',async()=>{
  const f=await documentosFixture(),lista=await(await f.req(f.baseA+'/atualizar','POST',{})).json();
  const dados={numero:f.numero,versao:lista[0].versao,status:'confirmado',justificativa:'Conferido'};
  expect((await f.req(f.baseA+'/decidir','POST',{...dados,responsavel:'Outra pessoa'})).status).toBe(400);
  expect((await f.req(f.baseA+'/decidir','POST',dados)).status).toBe(200);
  expect((await f.req(f.baseA+'/decidir','POST',dados)).status).toBe(409);
  f.db.prepare('UPDATE sindicatos SET ativo=0 WHERE id=?').run(f.sid);
  const atual=(await(await f.req(f.baseA)).json())[0];expect(atual).toMatchObject({status:'confirmado',desatualizado:false});
  f.db.prepare("UPDATE registros SET arquivo_hash='novo' WHERE numero_registro=?").run(f.numero);
  expect((await(await f.req(f.baseA)).json())[0]).toMatchObject({status:'candidato',desatualizado:true,responsavel:null});
  expect((await f.req(f.baseA+'/decidir','POST',{...dados,versao:atual.versao})).status).toBe(409);
  expect((await f.req(f.baseA+'/atualizar','POST',{historico:true})).status).toBe(400);
  f.revogarDuranteCorpo();expect((await f.req(f.baseA+'/atualizar','POST',{})).status).toBe(403);
});
it('autoriza bytes apenas por vínculo e contexto, verifica hash e rejeita caminho externo',async()=>{
  const f=await documentosFixture();await f.req(f.baseA+'/atualizar','POST',{});
  const rota=f.baseA+'/original?numero='+encodeURIComponent(f.numero);
  expect((await f.req(rota,'GET',undefined,f.b)).status).toBe(404);
  expect((await f.req(f.baseB+'/original?numero='+encodeURIComponent(f.numero),'GET',undefined,f.b)).status).toBe(404);
  expect((await f.req(rota,'GET',undefined,1,{cookie:''})).status).toBe(401);
  const resposta=await f.req(rota);expect(resposta.status).toBe(200);expect(Buffer.from(await resposta.arrayBuffer())).toEqual(f.bytes);
  expect(resposta.headers.get('cache-control')).toBe('no-store');
  writeFileSync(f.path,'Alterado');expect((await f.req(rota)).status).toBe(409);
  const documento=(await(await f.req(f.baseA)).json())[0];
  expect((await f.req(f.baseA+'/decidir','POST',{numero:f.numero,versao:documento.versao,status:'confirmado',justificativa:'Original deve conferir'})).status).toBe(409);
  const externo=resolve('package.json');f.db.prepare('UPDATE registros SET arquivo_path=?,arquivo_hash=? WHERE numero_registro=?').run(externo,hashBytes(readFileSync(externo)),f.numero);
  expect((await f.req(rota)).status).toBe(403);
  vincularUsuarioCliente(f.db,f.uid,f.ca);
  expect((await f.req(f.baseA,'GET',undefined,f.ca,{'x-context-type':'cliente'})).status).toBe(403);
});
it('reverte a decisão se a auditoria falhar e impede que o SMTP global processe outro escritório',async()=>{
  const f=await documentosFixture(),lista=await(await f.req(f.baseA+'/atualizar','POST',{})).json();
  f.db.exec("CREATE TRIGGER falha_auditoria BEFORE INSERT ON auditoria_seguranca WHEN NEW.acao='APLICABILIDADE_DECIDIDA' BEGIN SELECT RAISE(ABORT,'Falha simulada');END;");
  expect((await f.req(f.baseA+'/decidir','POST',{numero:f.numero,versao:lista[0].versao,status:'confirmado',justificativa:'Conferido'})).status).toBe(500);
  expect((await(await f.req(f.baseA)).json())[0].status).toBe('candidato');
  await f.req(f.baseB+'/atualizar','POST',{},f.b);
  f.db.prepare('INSERT INTO clientes_contatos(cliente_id,contato_id) VALUES (?,?)').run(f.cb,f.tb);
  f.db.prepare("UPDATE clientes_documentos SET status='confirmado',incluir_envio=1 WHERE cliente_id=?").run(f.cb);
  expect(await prepararEnvios(f.db,f.cb)).toEqual({preparados:0,bloqueados:0});
  f.db.prepare("INSERT INTO envios_clientes(cliente_id,contato_id,numero_registro,versao,status) VALUES (?,?,?,'teste','na_fila')").run(f.cb,f.tb,f.numero);
  salvarNotificacoes(f.db,{slack:{ativo:false},email:{ativo:true,host:'smtp.example.test',port:587,secure:false,user:'',from:'a@example.test',to:''}});
  let envios=0;await processarFila(f.db,{sendMail:async()=>{envios++;return {accepted:['b@example.test']};}});expect(envios).toBe(0);
  expect(f.db.prepare('SELECT status FROM envios_clientes WHERE cliente_id=?').get(f.cb)).toEqual({status:'bloqueado'});
});
