import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import tls from 'node:tls';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {criarPoolPostgres,criarPoolPostgresRuntime} from '../dist/postgres.js';
import {migratePostgres} from '../dist/postgres-migrations.js';
import {criarAutenticacaoPostgres} from '../dist/postgres-autenticacao.js';
import {criarEntregaRecuperacaoPostgres} from '../dist/postgres-recovery-mail.js';
import {criarHashSenha,hashToken,DURACAO_RECUPERACAO_MS} from '../dist/auth-core.js';
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

const database='mediador_recovery_test_'+randomUUID().replaceAll('-','');
const admin=criarPoolPostgres();let setup,runtime,created=false,disconnectAfterData=false;
const messages=[],sockets=new Set();
const smtp=tls.createServer({cert:readFileSync(process.env.MEDIADOR_SMTP_TEST_CERT),key:readFileSync(process.env.MEDIADOR_SMTP_TEST_KEY)},socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  socket.setEncoding('utf8');socket.write('220 localhost ESMTP test\r\n');
  let buffer='',data=false,message='';
  socket.on('data',chunk=>{buffer+=chunk;let index;while((index=buffer.indexOf('\r\n'))!==-1){
    const line=buffer.slice(0,index);buffer=buffer.slice(index+2);
    if(data){if(line==='.'){messages.push(message);message='';data=false;if(disconnectAfterData)socket.destroy();else socket.write('250 queued\r\n');}else message+=line+'\r\n';continue;}
    if(/^(EHLO|HELO)/.test(line))socket.write('250-localhost\r\n250 SIZE 20000000\r\n');
    else if(line==='DATA'){data=true;socket.write('354 End with dot\r\n');}
    else if(line==='QUIT'){socket.end('221 Bye\r\n');}
    else socket.write('250 OK\r\n');
  }});
});

async function until(check){const deadline=Date.now()+10000;while(Date.now()<deadline){if(await check())return;await delay(20);}throw new Error('Tempo esgotado no ensaio de recuperação.');}
function tokenAt(index){const mail=messages[index];const body=mail.slice(mail.indexOf('\r\n\r\n')+4);const decoded=/Content-Transfer-Encoding: base64/i.test(mail)?Buffer.from(body.replace(/\s/g,''),'base64').toString():body.replace(/=\r\n/g,'').replace(/=3D/g,'=');const match=decoded.match(/#recuperar=([A-Za-z0-9_-]{43})/);assert.ok(match,'Link deve chegar no e-mail');return match[1];}
try{
  assert.match(database,/^mediador_recovery_test_[a-f0-9]{32}$/);
  await admin.query(`CREATE DATABASE "${database}"`);created=true;
  setup=criarPoolPostgres({...process.env,PGDATABASE:database});await migratePostgres(setup);
  const role=process.env.PGAPPUSER;assert.match(role??'',/^[a-zA-Z_][a-zA-Z0-9_]*$/);
  const attributes=(await setup.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[role])).rows[0];
  assert.ok(attributes&&!attributes.rolsuper&&!attributes.rolbypassrls);
  await setup.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
  await setup.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`);
  await setup.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
  runtime=criarPoolPostgresRuntime({...process.env,PGDATABASE:database});
  const email='recuperacao@example.invalid',oldPassword='Senha anterior longa 2026!',newPassword='Senha renovada longa 2026!';
  const uid=(await setup.query("INSERT INTO usuarios(nome,email) VALUES('Ensaio recuperação',$1) RETURNING id",[email])).rows[0].id;
  await setup.query('INSERT INTO credenciais_usuarios(usuario_id,senha_hash,atualizado_em) VALUES($1,$2,$3)',[uid,await criarHashSenha(oldPassword),Date.now()]);
  smtp.listen(0,'127.0.0.1');await once(smtp,'listening');
  const send=criarEntregaRecuperacaoPostgres('http://localhost:3000',{AUTH_SMTP_ENABLED:'1',AUTH_SMTP_HOST:'127.0.0.1',AUTH_SMTP_PORT:String(smtp.address().port),AUTH_SMTP_SECURE:'1',AUTH_SMTP_FROM:'conta@example.invalid'});
  let now=Date.now();const auth=criarAutenticacaoPostgres(runtime,{agora:()=>now,enviarRecuperacao:send});
  const previous=await auth.login({email,senha:oldPassword});await auth.exigirSessao(previous.token);
  const response=await auth.solicitarRecuperacao({email});await until(()=>messages.length===1);
  assert.deepEqual(await auth.solicitarRecuperacao({email:'inexistente@example.invalid'}),response);
  const token=tokenAt(0);
  const stored=(await setup.query('SELECT token_hash FROM recuperacoes_acesso WHERE usuario_id=$1',[uid])).rows;
  assert.deepEqual(stored.map(row=>row.token_hash),[hashToken(token)]);assert.notEqual(stored[0].token_hash,token);
  await auth.recuperar({token,senha:newPassword});
  await assert.rejects(auth.exigirSessao(previous.token),{status:401});
  await assert.rejects(auth.recuperar({token,senha:oldPassword}),{status:400});
  await assert.rejects(auth.login({email,senha:oldPassword}),{status:401});
  const renewed=await auth.login({email,senha:newPassword});await auth.exigirSessao(renewed.token);
  await auth.solicitarRecuperacao({email});await until(()=>messages.length===2);
  const expired=tokenAt(1);now+=DURACAO_RECUPERACAO_MS+1;
  await assert.rejects(auth.recuperar({token:expired,senha:oldPassword}),{status:400});
  disconnectAfterData=true;
  await auth.solicitarRecuperacao({email});await until(()=>messages.length===3);
  const failed=tokenAt(2);
  await until(async()=>!!(await setup.query('SELECT usada_em FROM recuperacoes_acesso WHERE token_hash=$1',[hashToken(failed)])).rows[0]?.usada_em);
  await assert.rejects(auth.recuperar({token:failed,senha:oldPassword}),{status:400});
  assert.equal(Number((await setup.query("SELECT count(*) n FROM auditoria_seguranca WHERE acao='SENHA_RECUPERADA' AND ator_id=$1",[uid])).rows[0].n),1);
  console.log('OK: SMTP TLS local, token em fragmento e hash no banco, resposta uniforme, uso único, expiração, revogação de sessões e falha de entrega.');
}finally{
  for(const socket of sockets)socket.destroy();if(smtp.listening)await new Promise(resolve=>smtp.close(resolve));
  if(runtime)await runtime.end();if(setup)await setup.end();
  if(created){assert.match(database,/^mediador_recovery_test_[a-f0-9]{32}$/);await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);}await admin.end();
}
}

