import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {execFileSync,spawnSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {randomUUID,randomBytes,createHash,X509Certificate} from 'node:crypto';
import https from 'node:https';
import {chromium} from 'playwright';
import {criarProxyHttpsLocal} from '../dist/local-https-proxy.js';
import {criarPoolPostgres} from '../dist/postgres.js';
import {migratePostgres} from '../dist/postgres-migrations.js';
import {criarHashSenha} from '../dist/auth-core.js';
import {validarRevisaoPublicacaoNavegador} from './mvp-review-publication-fixture.mjs';
if(!process.env.MEDIADOR_SMTP_TEST_CERT){
  const certDir=mkdtempSync(join(tmpdir(),'mediador-smtp-test-'));
  try{
    const candidates=process.env.OPENSSL_BIN?[process.env.OPENSSL_BIN]:['openssl','C:/Program Files/Git/usr/bin/openssl.exe','C:/Program Files/Git/mingw64/bin/openssl.exe'];
    const openssl=candidates.find(path=>{try{execFileSync(path,['version'],{stdio:'ignore',windowsHide:true});return true;}catch{return false;}});
    assert.ok(openssl,'Defina OPENSSL_BIN ou instale OpenSSL/Git para Windows.');
    const cert=join(certDir,'cert.pem'),key=join(certDir,'key.pem');
    execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-keyout',key,'-out',cert],{stdio:'ignore',windowsHide:true});
    const result=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{stdio:'inherit',windowsHide:true,env:{...process.env,NODE_EXTRA_CA_CERTS:cert,MEDIADOR_SMTP_TEST_CERT:cert,MEDIADOR_SMTP_TEST_KEY:key}});
    if(result.error)throw result.error;
    process.exitCode=result.status??1;
  }finally{assert.equal(resolve(certDir).startsWith(resolve(tmpdir())+sep),true);rmSync(certDir,{recursive:true,force:true});}
}else{



const database='mediador_https_test_'+randomUUID().replaceAll('-','');
process.env.CREDENTIALS_MASTER_KEY ||= randomBytes(32).toString('base64');
const admin=criarPoolPostgres();let setup,created=false,proxy,child,childClosed,browser;
async function freePort(){const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port;}
function request(port,path,headers={},method='GET',body=''){return new Promise((resolve,reject)=>{const req=https.request({hostname:'127.0.0.1',servername:'localhost',port,path,method,headers:{host:`localhost:${port}`,...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));res.on('error',reject);});req.setTimeout(2000,()=>req.destroy());req.on('error',reject);req.end(body);});}
try{
 assert.match(database,/^mediador_https_test_[a-f0-9]{32}$/);await admin.query(`CREATE DATABASE "${database}"`);created=true;
 setup=criarPoolPostgres({...process.env,PGDATABASE:database});await migratePostgres(setup);
 const role=process.env.PGAPPUSER;assert.match(role??'',/^[a-zA-Z_][a-zA-Z0-9_]*$/);
 const attributes=(await setup.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[role])).rows[0];assert.ok(attributes&&!attributes.rolsuper&&!attributes.rolbypassrls);
 await setup.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
 await setup.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`);
 await setup.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
 const office=(await setup.query("INSERT INTO escritorios(nome) VALUES('Escritório HTTPS A') RETURNING id")).rows[0].id;
 const other=(await setup.query("INSERT INTO escritorios(nome) VALUES('Escritório HTTPS B') RETURNING id")).rows[0].id;
 const customer=(await setup.query("INSERT INTO clientes(escritorio_id,razao_social,cnpj) VALUES($1,'Empresa HTTPS A','11222333000181') RETURNING id",[office])).rows[0].id;
 const otherCustomer=(await setup.query("INSERT INTO clientes(escritorio_id,razao_social,cnpj) VALUES($1,'Empresa HTTPS B','11444777000161') RETURNING id",[other])).rows[0].id;
 const email='representante-https@example.invalid',password='Senha de ensaio HTTPS 2026!';
 const user=(await setup.query("INSERT INTO usuarios(nome,email) VALUES('Representante HTTPS',$1) RETURNING id",[email])).rows[0].id;
 await setup.query('INSERT INTO credenciais_usuarios(usuario_id,senha_hash,atualizado_em) VALUES($1,$2,$3)',[user,await criarHashSenha(password),Date.now()]);
 await setup.query('INSERT INTO usuarios_clientes(usuario_id,cliente_id,escritorio_id) VALUES($1,$2,$3)',[user,customer,office]);
 const cert=readFileSync(process.env.MEDIADOR_SMTP_TEST_CERT),key=readFileSync(process.env.MEDIADOR_SMTP_TEST_KEY);
 const spki=createHash('sha256').update(new X509Certificate(cert).publicKey.export({type:'spki',format:'der'})).digest('base64');
 browser=await chromium.launch({headless:true,args:[`--ignore-certificate-errors-spki-list=${spki}`]});
 const pdfPage=await browser.newPage();await pdfPage.setContent('<h1>Publicação sintética HTTPS</h1><p>Documento exclusivo do ensaio local.</p>');const bytes=await pdfPage.pdf();await pdfPage.close();
 const base='DF000001/2026',hash=createHash('sha256').update(bytes).digest('hex');
 await setup.query("INSERT INTO registros(numero_registro,watch,tipo,vigencia) VALUES($1,'teste','Convenção Coletiva de Trabalho','')",[base]);
 async function publication(office,customer){return (await setup.query(`INSERT INTO publicacoes_documentos(escritorio_id,cliente_id,base,versao,hash_pdf,relatorio_json,pdf,ator_id) VALUES($1,$2,$3,'https-v1',$4,'{}'::jsonb,$5,$6) RETURNING id`,[office,customer,base,hash,bytes,user])).rows[0].id;}
 const own=await publication(office,customer),foreign=await publication(other,otherCustomer);
 const upstreamPort=await freePort(),port=await freePort(),origin=`https://localhost:${port}`;
 child=spawn(process.execPath,['--import',new URL('./fixtures/cnpj-fetch.mjs',import.meta.url).href,'dist/server.js'],{windowsHide:true,stdio:'ignore',env:{...process.env,APP_POSTGRES_CONTEXT:'1',PGDATABASE:database,UI_PORT:String(upstreamPort),AUTH_PUBLIC_URL:origin,AUTH_TRUSTED_PROXY_CIDRS:'127.0.0.1',AUTH_SMTP_ENABLED:'0'}});
 childClosed=new Promise(resolve=>{child.once('exit',resolve);child.once('error',resolve);});
 proxy=criarProxyHttpsLocal({cert,key,upstreamPort,publicUrl:origin});proxy.listen(port,'127.0.0.1');await once(proxy,'listening');
 let ready=false;const deadline=Date.now()+15000;
 while(Date.now()<deadline){if(child.exitCode!==null)throw new Error('Servidor PostgreSQL encerrou no ensaio HTTPS.');try{if((await request(port,'/api/auth/estado')).status===200){ready=true;break;}}catch{}await delay(50);}assert.ok(ready,'Servidor deve iniciar pelo HTTPS');
 assert.equal((await request(port,'/api/portal/documentos')).status,401);
 await validarRevisaoPublicacaoNavegador(setup,browser,origin);
 for(const path of ['/data/mediador.db','/data/originais/privado.pdf','/../.env.docker'])assert.notEqual((await request(port,path)).status,200);
 const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage();
 await page.goto(origin+'/login');await page.locator('#login-email').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL(origin+'/');
 const cookies=await context.cookies();const cookie=cookies.find(c=>c.name==='mediador_sessao');assert.ok(cookie,'Cookie real da sessão');assert.equal(cookie.secure,true);assert.equal(cookie.httpOnly,true);assert.equal(cookie.sameSite,'Strict');
 await page.getByLabel('Escritório ou empresa',{exact:true}).selectOption({label:'Empresa · Empresa HTTPS A'});
 await page.getByRole('heading',{name:'Documentos publicados para esta empresa',exact:true}).waitFor();await page.getByRole('button',{name:'Baixar PDF',exact:true}).waitFor();
 const checks=await page.evaluate(async({customer,foreign,otherCustomer})=>{
  const session=await (await fetch('/api/auth/sessao')).json();const headers={'content-type':'application/json','x-context-type':'cliente','x-context-id':String(customer),'x-csrf-token':session.csrf};
  const list=await (await fetch('/api/portal/documentos',{headers})).json();
  const foreignStatus=(await fetch('/api/portal/documentos/'+foreign,{headers})).status;
  const otherContext=(await fetch('/api/portal/documentos',{headers:{...headers,'x-context-id':String(otherCustomer)}})).status;
  const csrf=(await fetch('/api/portal/documentos/'+list[0].id+'/ciencia',{method:'POST',headers:{...headers,'x-csrf-token':'invalido'},body:'{"confirmo":true}'})).status;
  return {ids:list.map(p=>String(p.id)),foreignStatus,otherContext,csrf};
 },{customer,foreign,otherCustomer});
 assert.deepEqual(checks.ids,[String(own)]);assert.equal(checks.foreignStatus,404);assert.equal(checks.otherContext,403);assert.equal(checks.csrf,403);
 await page.goto(origin+'/app/');await page.getByText('Fundação Vue',{exact:true}).waitFor();await page.getByRole('button',{name:'Documentos',exact:true}).click();await page.getByText('Este domínio será migrado para componentes Vue preservando suas APIs, permissões e testes de jornada.',{exact:true}).waitFor();await page.goto(origin+'/');
 const csrfToken=await page.evaluate(async()=>(await (await fetch('/api/auth/sessao')).json()).csrf);
 assert.equal((await request(port,'/api/auth/logout',{'cookie':`${cookie.name}=${cookie.value}`,'origin':'https://example.invalid','content-type':'application/json','x-csrf-token':csrfToken},'POST','{}')).status,403);
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar PDF',exact:true}).click();const download=await downloadEvent;assert.deepEqual(readFileSync(await download.path()),bytes);
 await page.getByRole('button',{name:'Confirmar ciência',exact:true}).click();const scienceDialog=page.getByRole('dialog',{name:'Confirmar ciência',exact:true});await scienceDialog.getByRole('checkbox').check();await scienceDialog.getByRole('button',{name:'Confirmar ciência',exact:true}).click();await page.getByRole('button',{name:'Ciência registrada',exact:true}).waitFor();
 const events=(await setup.query('SELECT evento,ator_id,ip,request_id FROM auditoria_acessos_publicacoes WHERE publicacao_id=$1 ORDER BY id',[own])).rows;
 for(const type of ['abertura_autorizada','download_servido','ciencia_confirmada'])assert.ok(events.some(e=>e.evento===type));
 assert.ok(events.every(e=>e.ator_id===user&&e.ip==='127.0.0.1'&&e.request_id));
 // Forged forwarding headers cannot alter the audited client IP through the proxy.
 const forged=await request(port,'/api/portal/documentos/'+own,{'cookie':`${cookie.name}=${cookie.value}`,'x-context-type':'cliente','x-context-id':String(customer),'x-forwarded-for':'203.0.113.55'});assert.equal(forged.status,200);
 assert.equal((await setup.query('SELECT ip FROM auditoria_acessos_publicacoes WHERE publicacao_id=$1 ORDER BY id DESC LIMIT 1',[own])).rows[0].ip,'127.0.0.1');
 await setup.query('UPDATE usuarios_clientes SET ativo=false WHERE usuario_id=$1',[user]);
 assert.equal((await request(port,'/api/portal/documentos/'+own,{'cookie':`${cookie.name}=${cookie.value}`,'x-context-type':'cliente','x-context-id':String(customer)})).status,403);
 await setup.query('UPDATE usuarios_clientes SET ativo=true WHERE usuario_id=$1',[user]);
 await setup.query("UPDATE publicacoes_documentos SET estado='revogada',revogada_em=now() WHERE id=$1",[own]);
 assert.equal((await request(port,'/api/portal/documentos/'+own,{'cookie':`${cookie.name}=${cookie.value}`,'x-context-type':'cliente','x-context-id':String(customer)})).status,404);
 await page.getByRole('button',{name:'Minha conta',exact:true}).click();await page.locator('#auth-sair').click();await page.waitForURL(origin+'/login');assert.equal((await request(port,'/api/auth/sessao',{cookie:`${cookie.name}=${cookie.value}`})).status,401);
 console.log('OK: servidor PostgreSQL real + HTTPS + Chromium: login, cookie Secure/HttpOnly, contexto isolado, PDF íntegro, ciência/auditoria/IP, CSRF/origem, revogação de vínculo/publicação, logout e caminhos privados recusados.');
}finally{
 await browser?.close();if(proxy){proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}
 if(child){child.kill();await childClosed;}
 if(setup)await setup.end();if(created){assert.match(database,/^mediador_https_test_[a-f0-9]{32}$/);await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);}await admin.end();
}
}



