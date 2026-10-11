import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {chromium} from 'playwright';
import {criarHashSenha} from './auth-core.js';
import {criarAcessoHttpPostgres} from './postgres-auth-http.js';
import {tratarGestaoPostgres} from './postgres-gestao-http.js';
import {ErroCadastro} from './cadastros.js';
/** Real browser, HTTP/session and RLS against disposable imported data only. */
export async function validarRevisaoImportadaUi(admin:Pool,runtime:Pool,fixture:{office:number;other:number;base:string;field:string}){
  const database=(await admin.query('SELECT current_database() nome')).rows[0].nome;
  assert.match(database,/^mediador_import_test_[a-f0-9]{32}$/);assert.equal((await runtime.query('SELECT current_database() nome')).rows[0].nome,database);
  const role=(await runtime.query('SELECT current_user nome')).rows[0].nome as string;
  if(!/^[a-z][a-z0-9_]{2,62}$/.test(role))throw new Error('Papel runtime inválido.');
  await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${role}"`);
  await admin.query(`GRANT INSERT,UPDATE ON sessoes_usuarios,limites_autenticacao TO "${role}"`);
  await admin.query(`GRANT DELETE ON limites_autenticacao TO "${role}"`);
  await admin.query(`GRANT UPDATE ON usuarios,credenciais_usuarios TO "${role}"`);
  const email=`revisao-ui-${randomUUID()}@example.invalid`,password=`Teste-A1!-${randomUUID()}`;
  const user=(await admin.query("INSERT INTO usuarios(nome,email) VALUES('Revisor do navegador',$1) RETURNING id",[email])).rows[0].id;
  await admin.query('INSERT INTO credenciais_usuarios(usuario_id,senha_hash,atualizado_em) VALUES($1,$2,$3)',[user,await criarHashSenha(password),Date.now()]);
  for(const office of [fixture.office,fixture.other])await admin.query("INSERT INTO usuarios_escritorios(usuario_id,escritorio_id,papel) VALUES($1,$2,'administrador')",[user,office]);
  let access:ReturnType<typeof criarAcessoHttpPostgres>,origin='';
  const server=createServer((req,res)=>{void(async()=>{
    try{
      const url=new URL(req.url??'/',origin);
      if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<p id="auth-mensagem" role="status"></p><div id="gestao-plataforma"></div><div id="gestao-local"></div><div id="interpretacoes-local"></div><script src="/gestao-ui.js"></script>');return;}
      if(url.pathname==='/gestao-ui.js'){res.writeHead(200,{'content-type':'application/javascript; charset=utf-8'});res.end(readFileSync('web/gestao-ui.js'));return;}
      const body=async()=>{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1024*1024)throw new Error('Corpo excessivo.');}return JSON.parse(raw||'{}');};
      if(await access.tratar(req,res,url,body))return;
      if(await tratarGestaoPostgres(req,res,runtime,url,access,body))return;
      // Unrelated summary section is not part of this focused review harness.
      if(url.pathname==='/api/contexto/resumo'){res.writeHead(200,{'content-type':'application/json'});res.end('{"clientes":0,"documentos":0,"consolidacoes":0}');return;}
      res.writeHead(404);res.end('{}');
    }catch(error){res.writeHead(error instanceof ErroCadastro?error.status:500,{'content-type':'application/json'});res.end(JSON.stringify({erro:error instanceof ErroCadastro?error.message:'Falha no ensaio.'}));}
  })();});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;access=criarAcessoHttpPostgres(runtime,{publicUrl:origin});
  let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
  try{
    browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(origin);
    const session=await page.evaluate(async({email,password})=>{
      const login=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,senha:password})});if(!login.ok)throw new Error('Login falhou.');return (await fetch('/api/auth/sessao')).json();
    },{email,password});
    const context=async(office:number)=>page.evaluate(({office,session})=>{
      window.dispatchEvent(new Event('mediador:limpar'));window.dispatchEvent(new CustomEvent('mediador:contexto',{detail:{contexto:{tipo:'escritorio',escritorio_id:office,papel:'administrador'},sessao:session}}));
    },{office,session});
    await context(fixture.office);await page.getByLabel('CCT original',{exact:true}).selectOption(fixture.base);
    await page.getByLabel('Decisão para '+fixture.field,{exact:true}).selectOption('manual');
    await page.getByLabel('Texto da regra revisada',{exact:true}).fill('R$ 1.850,00');
    await page.getByLabel('Justificativa da revisão',{exact:true}).fill('Revisão feita no navegador após importação');
    const before=(await admin.query('SELECT count(*)::integer n FROM versoes_interpretacao WHERE escritorio_id=$1 AND base=$2',[fixture.office,fixture.base])).rows[0].n;
    const written=page.waitForResponse(r=>r.url().endsWith('/api/contexto/revisoes')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Registrar revisão',exact:true}).click();assert.equal((await written).status(),200);
    await page.locator('.interpretacao-texto').filter({hasText:'R$ 1.850,00'}).waitFor();
    const record=(await admin.query('SELECT revisoes_json FROM interpretacoes_escritorio WHERE escritorio_id=$1 AND base=$2',[fixture.office,fixture.base])).rows[0];
    assert.equal(record.revisoes_json[0].ator_id,user);assert.equal(record.revisoes_json[0].revisor,'Revisor do navegador');
    assert.equal((await admin.query('SELECT count(*)::integer n FROM versoes_interpretacao WHERE escritorio_id=$1 AND base=$2',[fixture.office,fixture.base])).rows[0].n,before+1);
    assert.equal((await admin.query("SELECT * FROM auditoria_seguranca WHERE ator_id=$1 AND acao='INTERPRETACAO_REVISADA'",[user])).rowCount,1);
    await context(fixture.other);await page.getByLabel('CCT original',{exact:true}).waitFor();
    assert.equal(await page.locator('#interpretacao-base option').evaluateAll((nodes,base)=>nodes.some(node=>(node as HTMLOptionElement).value===base),fixture.base),false);
    assert.equal(await page.getByRole('button',{name:'Registrar revisão',exact:true}).count(),0);
    return {chromium_http_sessao_real:true,revisao_manual_gravada:true,ator_auditado:true,troca_contexto_isolada:true};
  }finally{await browser?.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}

