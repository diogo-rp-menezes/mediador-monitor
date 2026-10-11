// Fluxo real de UI, API, SQLite, PDF e SMTP TLS local. CNPJ usa fixture, sem serviços externos.
// npm run build && npm run test:clientes-ui (Node 22 + Chromium + OpenSSL)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import tls from 'node:tls';
import { chromium } from 'playwright';
import { openDb, upsertRegistro, salvarArquivo, registrarExecucao, atualizarArquivoEExtracao } from '../dist-historico/db.js';
import { indexarMetaDocumento, registrarSindicatoDocumento } from '../dist-historico/cadastros.js';
import { hashBytes } from '../dist-historico/relatorios.js';
import { CAMPOS_CCT, NAO_CONSTA_CCT } from '../dist-historico/cct-template.js';
import { bootstrapAdministrador } from '../dist-historico/autenticacao.js';

// Validar antes de criar dados temporários. OPENSSL_BIN explícito tem prioridade.
function localizarOpenSsl() {
  const candidatos=process.env.OPENSSL_BIN?[process.env.OPENSSL_BIN]:[
    'openssl',
    ...(process.platform==='win32'?[
      join(process.env.ProgramFiles||'C:\\Program Files','Git','usr','bin','openssl.exe'),
      join(process.env.ProgramFiles||'C:\\Program Files','Git','mingw64','bin','openssl.exe'),
      join(process.env.ProgramFiles||'C:\\Program Files','OpenSSL-Win64','bin','openssl.exe'),
      ...(process.env.LOCALAPPDATA?[join(process.env.LOCALAPPDATA,'Programs','Git','usr','bin','openssl.exe')]:[]),
    ]:[]),
  ];
  for(const candidato of candidatos){
    try{execFileSync(candidato,['version'],{stdio:'ignore',windowsHide:true});return candidato;}catch{}
  }
  throw new Error('OpenSSL não encontrado. Instale OpenSSL ou Git para Windows, ou defina OPENSSL_BIN com o caminho do executável openssl.exe antes de executar npm run test:clientes-ui.');
}
const openssl=localizarOpenSsl();
mkdirSync('data',{recursive:true});
const directory=mkdtempSync(resolve('data','clientes-e2e-'));
const qa=process.env.CCT_QA_OUTPUT?resolve(process.env.CCT_QA_OUTPUT):null;if(qa)mkdirSync(qa,{recursive:true});
const dbPath=join(directory,'test.db'),keyPath=join(directory,'key.pem'),certPath=join(directory,'cert.pem');
try{
  execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-keyout',keyPath,'-out',certPath],{stdio:'ignore',windowsHide:true});
}catch(erro){
  rmSync(directory,{recursive:true,force:true});
  throw new Error('OpenSSL foi encontrado, mas não conseguiu gerar o certificado TLS de teste.',{cause:erro});
}
const messages=[];
const smtp=tls.createServer({key:readFileSync(keyPath),cert:readFileSync(certPath)},socket=>{
  socket.on('error',()=>{});socket.setEncoding('utf8');socket.write('220 localhost ESMTP test\r\n');
  let buffer='',data=false,message='';
  socket.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\r\n'))!==-1){const line=buffer.slice(0,i);buffer=buffer.slice(i+2);
    if(data){if(line==='.'){messages.push(message);message='';data=false;socket.write('250 queued\r\n');}else message+=line+'\r\n';continue;}
    if(/^(EHLO|HELO)/.test(line))socket.write('250-localhost\r\n250 SIZE 20000000\r\n');
    else if(/^DATA$/.test(line)){data=true;socket.write('354 End with dot\r\n');}
    else if(/^QUIT$/.test(line))socket.end('221 Bye\r\n');else socket.write('250 OK\r\n');
  }});
});
await new Promise(resolve=>smtp.listen(0,'127.0.0.1',resolve));
const smtpPort=smtp.address().port;
const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
let server,browser;const errors=[];
let cookie='',csrf='';const senhaTeste='Senha longa e sintética para teste';
const api=async(path,method='GET',body)=>{const r=await fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;};
const aguardar=async(fn)=>{const deadline=Date.now()+20000;let error;while(Date.now()<deadline){try{return await fn();}catch(e){error=e;await new Promise(resolve=>setTimeout(resolve,100));}}throw error;};
const shot=async(page,name)=>{if(qa)await page.screenshot({path:join(qa,name+'.png'),fullPage:true});};
try {
  const inicial=openDb(dbPath);try{await bootstrapAdministrador(inicial,{nome:'Diogo',email:'admin@example.test',senha:senhaTeste});}finally{inicial.close();}
  server=spawn(process.execPath,['--import',new URL('./fixtures/cnpj-fetch.mjs',import.meta.url).href,'dist-historico/server-sqlite-dev.js'],{env:{...process.env,DB_PATH:dbPath,UI_PORT:String(port),AUTH_PUBLIC_URL:'',SMTP_HOST:'',SMTP_USER:'',SMTP_PASS:'',MAIL_FROM:'',MAIL_TO:'',SLACK_WEBHOOK_URL:'',LLM_API_KEY:'',NODE_EXTRA_CA_CERTS:certPath},stdio:['ignore','pipe','pipe'],windowsHide:true});
  server.stderr.on('data',d=>errors.push(String(d)));
  await aguardar(()=>api('/api/auth/estado'));
  const login=await fetch(`http://127.0.0.1:${port}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@example.test',senha:senhaTeste})});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await api('/api/auth/sessao')).csrf;
  const sid=(await api('/api/sindicatos','POST',{nome:'Sindicato do Comércio',cnpj:'04.252.011/0001-10',categoria:'empregados do comércio',uf:'DF',tipo:'Convenção Coletiva',ativo:true})).id;
  await api('/api/notificacoes','PUT',{slack:{ativo:false},email:{ativo:false,host:'127.0.0.1',port:smtpPort,secure:true,user:'',password:'',from:'monitor@example.test',to:''}});
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  const page=await browser.newPage({viewport:{width:1320,height:980},colorScheme:'light'});const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator('#login-email').fill('admin@example.test');await page.locator('#login-senha').fill(senhaTeste);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.locator('nav').waitFor();
  await page.locator('nav').getByRole('tab',{name:'Contatos',exact:true}).click();await page.getByRole('button',{name:'+ Novo contato',exact:true}).click();
  await page.locator('#ct-nome').fill('Maria RH');await page.locator('#ct-email').fill('maria@example.test');await page.locator('#ct-cargo').fill('Gerente de RH');await page.locator('#ct-telefone').fill('(61) 99999-0000');
  await page.locator('#cl-form button[type=submit]').click();await page.locator('#cl-modal').waitFor({state:'hidden'});
  const tid=(await api('/api/contatos'))[0].id;
  await page.locator('nav').getByRole('tab',{name:'Clientes',exact:true}).click();await page.getByRole('button',{name:'+ Novo cliente',exact:true}).click();
  await page.locator('#cl-cnpj').fill('11.222.333/0001-82');await page.locator('#cl-consultar-cnpj').click();
  await page.locator('#cl-cnpj-resultado').filter({hasText:'CNPJ inválido'}).waitFor();assert.equal(await page.locator('#cl-razao').inputValue(),'');
  await page.locator('#cl-cnpj').fill('11.444.777/0001-61');await page.locator('#cl-consultar-cnpj').click();
  await page.locator('#cl-cnpj-resultado').filter({hasText:'não encontrado'}).waitFor();
  await page.locator('#cl-razao').fill('Nome digitado manualmente');
  let liberarConsulta;const bloqueio=new Promise(resolve=>liberarConsulta=resolve);
  await page.route('**/api/clientes/consulta-cnpj/11444777000161',async route=>{await bloqueio;await route.continue();});
  await page.locator('#cl-consultar-cnpj').click();await page.locator('#cl-cnpj').fill('11.222.333/0001-81');liberarConsulta();
  await aguardar(async()=>{assert.equal(await page.locator('#cl-consultar-cnpj').isEnabled(),true);});
  assert.equal(await page.locator('#cl-cnpj-resultado').isVisible(),false,'Resultado de CNPJ alterado é descartado');
  assert.equal(await page.locator('#cl-razao').inputValue(),'Nome digitado manualmente');
  await page.unroute('**/api/clientes/consulta-cnpj/11444777000161');
  await page.locator('#cl-cnpj').fill('11.222.333/0001-81');await page.locator('#cl-consultar-cnpj').click();
  await page.locator('#cl-aplicar-cnpj').waitFor();assert.equal(await page.locator('#cl-razao').inputValue(),'Nome digitado manualmente');
  assert.equal((await api('/api/clientes')).length,0,'Consultar não grava o cliente');
  assert.ok(!(await page.locator('#cl-cnpj-resultado').innerText()).includes('Invalid Date'),'Data da consulta legível');
  await shot(page,'consulta-cnpj');await page.setViewportSize({width:390,height:844});await shot(page,'consulta-cnpj-mobile');
  assert.equal(await page.locator('#cl-modal').evaluate(el=>el.scrollWidth>el.clientWidth),false,'Consulta cabe no celular');
  await page.setViewportSize({width:1320,height:980});await page.locator('#cl-aplicar-cnpj').click();
  assert.equal(await page.locator('#cl-razao').inputValue(),'Empresa Alfa Comércio Ltda');assert.equal(await page.locator('#cl-municipio').inputValue(),'Brasília');
  assert.equal(await page.locator('#cl-fantasia').inputValue(),'Alfa Comércio');assert.equal(await page.locator('#cl-uf').inputValue(),'DF');
  await page.locator('#cl-principal').selectOption(String(sid));await page.locator('#cl-primeiro-contato').selectOption(String(tid));await page.locator('#cl-form button[type=submit]').click();await page.locator('#cl-modal').waitFor({state:'hidden'});
  const cid=(await api('/api/clientes'))[0].id;
  const cadastro=await api(`/api/clientes/${cid}`);assert.equal(cadastro.dados_cnpj.fonte,'BrasilAPI / Minha Receita');assert.equal(cadastro.dados_cnpj.endereco.cep,'70000000');assert.equal((await api('/api/contatos')).length,1,'A consulta não cria destinatários');
  await shot(page,'clientes');
  const year=new Date().getUTCFullYear(),num=`DF000001/${year}`;
  const original=`CONVENÇÃO COLETIVA DE TRABALHO\nNÚMERO DE REGISTRO NO MTE: ${num}\nCNPJ: 04.252.011/0001-10\nCLÁUSULA PRIMEIRA - VIGÊNCIA\nAs partes fixam a vigência da presente Convenção Coletiva de Trabalho no período de 01/01/${year} a 31/12/${year}.\nCLÁUSULA SEGUNDA - ABRANGÊNCIA\nO presente instrumento abrangerá a(s) categoria(s) empregados do comércio, com abrangência territorial em Brasília/DF.\nCLÁUSULA TERCEIRA - PISO\nO piso salarial geral será de R$ 2.500,00.\nCLÁUSULA QUARTA - REAJUSTE\nOs salários serão reajustados em 6%.`;
  const path=join(directory,'original.doc');writeFileSync(path,original);
  const db=openDb(dbPath);upsertRegistro(db,'Sindicato do Comércio',{numeroRegistro:num,numeroSolicitacao:'MR000001/'+year,tipo:'Convenção Coletiva',vigencia:`01/01/${year} - 31/12/${year}`,partes:'Sindicato do Comércio',indice:0});
  salvarArquivo(db,num,{path,hash:hashBytes(original),bytes:Buffer.byteLength(original),original:'original.doc'});registrarSindicatoDocumento(db,num,sid);indexarMetaDocumento(db,num,original);
  const campos=Object.fromEntries(CAMPOS_CCT.map(c=>[c.id,NAO_CONSTA_CCT]));Object.assign(campos,{s01_numero_do_registro_no_mte:num,s01_codigo_da_solicitacao_mediador:'MR000001/'+year,s01_vigencia:`01/01/${year} a 31/12/${year}`,s01_abrangencia_territorial:'Brasília/DF',s01_categoria_profissional:'empregados do comércio',s02_piso_geral:'R$ 2.500,00',s02_percentual_de_reajuste:'6%'});
  atualizarArquivoEExtracao(db,num,path,{padrao:{versao:'1.0.0',campos,evidencias:{s02_piso_geral:{clausula:'Cláusula terceira',citacao:'O piso salarial geral será de R$ 2.500,00.'},s02_percentual_de_reajuste:{clausula:'Cláusula quarta',citacao:'Os salários serão reajustados em 6%.'}}},topicos:{}});registrarExecucao(db,'Teste offline',1,1);db.close();
  await page.locator('nav').getByRole('tab',{name:'Clientes',exact:true}).click();await page.locator('[data-cl="aba-cliente"][data-aba="documentos"]').click();
  await page.getByRole('button',{name:'Confirmar aplicabilidade',exact:true}).click();assert.equal(await page.locator('#dc-responsavel').inputValue(),'Diogo');await page.locator('#dc-justificativa').fill('Categoria, município e vigência conferidos no documento original.');await page.locator('#cl-form button[type=submit]').click();await page.locator('#cl-modal').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Preparar e-mails',exact:true}).click();await page.getByRole('button',{name:'Ver prévia',exact:true}).waitFor({timeout:25000});
  const envios=await api('/api/envios');assert.equal(envios.length,1);const envio=envios[0];assert.equal(envio.status,'revisao');assert.equal(envio.snapshot.anexos.length,2);
  const pdfResponse=await fetch(`http://127.0.0.1:${port}${envio.snapshot.anexos[1].url}`,{headers:{cookie}}),pdf=Buffer.from(await pdfResponse.arrayBuffer());assert.equal(pdf.subarray(0,4).toString(),'%PDF');assert.ok(pdf.length>10000);if(qa)writeFileSync(join(qa,'analise-validacao.pdf'),pdf);
  await page.getByRole('button',{name:'Ver prévia',exact:true}).click();await page.locator('#cl-modal').waitFor({state:'visible'});await shot(page,'previa-email');
  assert.equal(await page.locator('#ev-responsavel').inputValue(),'Diogo');await page.locator('#ev-conferido').check();await page.getByRole('button',{name:'Aprovar e colocar na fila',exact:true}).click();
  await aguardar(async()=>{const e=await api(`/api/envios/${envio.id}`);assert.equal(e.status,'na_fila');return e;});
  await page.locator('#cl-modal [data-cl="fechar-modal"]').first().click();
  await api('/api/notificacoes','PUT',{slack:{ativo:false},email:{ativo:true,host:'127.0.0.1',port:smtpPort,secure:true,user:'',password:'',from:'monitor@example.test',to:''}});
  await page.locator('nav').getByRole('tab',{name:'Envios',exact:true}).click();await page.getByRole('button',{name:'Processar fila aprovada',exact:true}).click();
  await aguardar(async()=>{const e=await api(`/api/envios/${envio.id}`);assert.equal(e.status,'enviado');return e;});assert.equal(messages.length,1);assert.match(messages[0],/To: maria@example\.test/);assert.match(messages[0],/application\/pdf/);assert.match(messages[0],/analise\.pdf/);
  await api('/api/envios/processar','POST',{});assert.equal(messages.length,1);await shot(page,'envios');
  await page.locator('nav').getByRole('tab',{name:'Clientes',exact:true}).click();await page.locator('[data-cl="aba-cliente"][data-aba="contatos"]').click();await page.getByRole('button',{name:'Preferências do vínculo',exact:true}).click();await page.locator('#vc-receber').uncheck();await page.locator('#cl-form button[type=submit]').click();await page.locator('#cl-modal').waitFor({state:'hidden'});
  assert.equal((await api(`/api/clientes/${cid}`)).contatos[0].receber_email,false);
  await page.locator('nav').getByRole('tab',{name:'Contatos',exact:true}).click();await shot(page,'contatos');
  await page.setViewportSize({width:390,height:844});await page.locator('nav').getByRole('tab',{name:'Clientes',exact:true}).click();await page.getByRole('heading',{name:'Clientes',exact:true}).waitFor();await shot(page,'clientes-mobile');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Sem transbordamento no celular');
  assert.deepEqual(pageErrors,[],'Nenhum erro JavaScript na UI');
  console.log(JSON.stringify({ok:true,fluxo:'Consulta CNPJ -> conferência -> CRUD e vínculos -> documento -> decisão -> PDF real -> prévia -> aprovação -> SMTP TLS local -> sem duplicatas',cliente:cid,envio:envio.id,pdf_bytes:pdf.length,mensagens_smtp:messages.length,erros_ui:pageErrors}));
} finally {
  await browser?.close();
  if(server&&server.exitCode===null){const encerrado=once(server,'exit');server.kill();await encerrado;}
  smtp.close();
  // O histórico de teste é isolado; PDFs de QA só são preservados quando solicitados.
  if(process.env.CCT_KEEP_TEST_DATA!=='true')rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  if(errors.some(x=>/Error|erro/i.test(x)))console.error(errors.join('\n'));
}


