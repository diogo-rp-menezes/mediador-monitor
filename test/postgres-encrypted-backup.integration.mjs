import assert from 'node:assert/strict';
import {prepararIaBackup} from './backup-ia-fixture.mjs';
import {prepararMonitoramentoBackup} from './backup-monitoring-fixture.mjs';
import {validarConcorrenciaContextos} from './backup-adversarial-fixture.mjs';
import {spawn,execFileSync,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import tls from 'node:tls';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {executarCicloFilasPostgres} from '../dist/postgres-worker.js';
import {prepararNotificacoesPublicacaoPostgres,recuperarNotificacoesPublicacaoPresasPostgres,processarNotificacoesPublicacaoPostgres} from '../dist/postgres-notificacoes-publicacoes.js';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,unlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {criarPoolPostgres,criarPoolPostgresRuntime} from '../dist/postgres.js';
import {migratePostgres} from '../dist/postgres-migrations.js';
import {bootstrapAdministradorPostgres} from '../dist/postgres-papeis.js';
import {criarBackupPostgres,comBackupRestauradoIsolado,backupPostgresConfig} from '../dist/postgres-backup.js';
import {lerReferenciasBackupPostgres,inventariarArquivosBackup} from '../dist/postgres-backup-inventory.js';
import {criarPacoteBackup,recuperarPacoteBackup} from '../dist/backup-package.js';
import {referenciasOriginaisBackupCifrado} from '../dist/encrypted-backup-original-references.js';
import {remapearArquivosBackupIsolado} from '../dist/postgres-backup-remap.js';
import {comSnapshotBackupIsolado} from '../dist/postgres-backup-snapshot.js';
import {BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY} from '../dist/postgres-backup-gate.js';
import {comExclusividadeMonitoramentoPostgres} from '../dist/postgres-monitoring-lock.js';
import {executarSolicitacaoIaPostgres} from '../dist/postgres-ia-worker.js';
import {executarAnalisePostgres} from '../dist/postgres-ia-executor.js';
import {transformarBackup} from '../dist/backup-envelope.js';
import {criarCopiaChavesBackup,recuperarCopiaChavesBackup} from '../dist/backup-key-custody.js';
import {withPostgresOfficeTransaction as scoped} from '../dist/postgres-transaction.js';
import {validarPapelRuntimePostgres} from '../dist/postgres-runtime-safety.js';
import {salvarSmtpPostgres,obterSmtpSecretoPostgres} from '../dist/postgres-smtp.js';
import {criarHashSenha} from '../dist/auth-core.js';
import {criarAutenticacaoPostgres} from '../dist/postgres-autenticacao.js';
import {prepararEnviosPostgres} from '../dist/postgres-preparacao-envios.js';
import {listarEnviosPostgres,aprovarEnvioPostgres,processarFilaPostgres} from '../dist/postgres-fila-envios.js';
import {CAMPOS_CCT,NAO_CONSTA_CCT} from '../dist/cct-template.js';
import {abrirPortalDocumentoPostgres} from '../dist/postgres-publicacoes.js';


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


async function validarHttpRestaurado(database,fixture){
  const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const origin=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['dist/server.js'],{windowsHide:true,stdio:'ignore',env:{...process.env,PGDATABASE:database,APP_POSTGRES_CONTEXT:'1',UI_PORT:String(port),AUTH_PUBLIC_URL:origin,AUTH_SMTP_ENABLED:'1',AUTH_SMTP_HOST:'localhost',AUTH_SMTP_PORT:String(fixture.smtpPort),AUTH_SMTP_SECURE:'1',AUTH_SMTP_FROM:'contas@example.invalid',AUTH_SMTP_USER:'',AUTH_SMTP_PASS:'',AUTH_TRUSTED_PROXY_CIDRS:''}});
  const closed=new Promise(resolve=>{child.once('exit',resolve);child.once('error',resolve);});
  try{
    let ready=false;const deadline=Date.now()+15000;
    while(Date.now()<deadline){if(child.exitCode!==null)throw new Error('Servidor restaurado encerrou.');try{if((await fetch(origin+'/api/auth/estado',{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await delay(50);}assert.ok(ready);
    const pausePool=criarPoolPostgres({...process.env,PGDATABASE:database}),pause=await pausePool.connect();
    try{
      const before=(await pause.query('SELECT (SELECT count(*) FROM sessoes_usuarios) AS sessoes,(SELECT count(*) FROM auditoria_seguranca) AS auditoria')).rows;
      await pause.query('BEGIN');await pause.query('SELECT pg_advisory_xact_lock($1,$2)',[BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY]);
      for(const path of ['/api/auth/estado','/api/auth/sessao','/api/portal/documentos','/acesso'])assert.equal((await fetch(origin+path,{redirect:'manual'})).status,409);
      for(const path of ['/api/auth/login','/api/auth/recuperacao'])assert.equal((await fetch(origin+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:fixture.email,senha:fixture.password})})).status,409);
      assert.equal((await fetch(origin+'/login')).status,200);
      assert.deepEqual((await pause.query('SELECT (SELECT count(*) FROM sessoes_usuarios) AS sessoes,(SELECT count(*) FROM auditoria_seguranca) AS auditoria')).rows,before);
    }finally{await pause.query('ROLLBACK');pause.release();await pausePool.end();}
    const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:fixture.email,senha:fixture.password})});assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie').split(';')[0];const headers={cookie,'x-context-type':'cliente','x-context-id':String(fixture.customer)};
    assert.equal((await fetch(origin+'/api/auth/sessao',{headers})).status,200);
    const list=await fetch(origin+'/api/portal/documentos',{headers});assert.equal(list.status,200);assert.deepEqual((await list.json()).map(row=>String(row.id)),[String(fixture.publication)]);
    const download=await fetch(origin+'/api/portal/documentos/'+fixture.publication+'?download=1',{headers});assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),fixture.bytes);
  }finally{child.kill();await closed;}
}

const database='mediador_backup_test_'+randomUUID().replaceAll('-','');
const admin=criarPoolPostgres(),directory=await mkdtemp(resolve('data','mediador-encrypted-restore-'));
const keyDirectory=await mkdtemp(join(tmpdir(),'mediador-key-recovery-'));
const recoveryKey=randomBytes(32);let backupKey=randomBytes(32),appKey=randomBytes(32);const previousKey=process.env.CREDENTIALS_MASTER_KEY;
let source,iaFixture,monitoringFixture,created=false,disconnectAfterData=false;const snapshotPaths=[];
const messages=[],sockets=new Set();
const smtp=tls.createServer({cert:readFileSync(process.env.MEDIADOR_SMTP_TEST_CERT),key:readFileSync(process.env.MEDIADOR_SMTP_TEST_KEY)},socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  socket.setEncoding('utf8');socket.write('220 localhost ESMTP test\r\n');
  let buffer='',data=false,message='';
  socket.on('data',chunk=>{buffer+=chunk;let index;while((index=buffer.indexOf('\r\n'))!==-1){
    const line=buffer.slice(0,index);buffer=buffer.slice(index+2);
    if(data){if(line==='.'){messages.push(message);message='';data=false;if(disconnectAfterData)socket.destroy();else socket.write('250 queued\r\n');}else message+=line+'\r\n';continue;}
    if(/^(EHLO|HELO)/.test(line))socket.write('250-localhost\r\n250-AUTH PLAIN\r\n250 SIZE 20000000\r\n');
    else if(line.startsWith('AUTH '))socket.write('235 Authenticated\r\n');
    else if(line==='DATA'){data=true;socket.write('354 End with dot\r\n');}
    else if(line==='QUIT'){socket.end('221 Bye\r\n');}
    else socket.write('250 OK\r\n');
  }});
});

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
let pilotMetrics;
try{
  smtp.listen(0,'127.0.0.1');await once(smtp,'listening');
  assert.match(database,/^mediador_backup_test_[a-f0-9]{32}$/);
  await admin.query(`CREATE DATABASE "${database}"`);created=true;
  source=criarPoolPostgres({...process.env,PGDATABASE:database});
  const sourceErrors=[];source.on('error',error=>{sourceErrors.push(error.code??'unknown');});
  await migratePostgres(source);
  // Fresh installations must be recoverable before any original or delivery exists.
  const emptyEnv={...process.env,POSTGRES_DB:database,PGDATABASE:database,BACKUP_ENCRYPTION_KEY:backupKey.toString('base64')};
  const emptyPackage=join(directory,'empty-package'),emptyCreation=join(directory,'empty-creation.json'),emptyRecovery=join(directory,'empty-recovery.json');
  execFileSync(process.execPath,['dist/postgres-package-creation-cli.js','--root',directory,'--output',emptyPackage,'--report',emptyCreation],{windowsHide:true,stdio:'pipe',timeout:120000,env:emptyEnv});
  const emptyCreated=JSON.parse(await readFile(emptyCreation,'utf8'));
  assert.equal(emptyCreated.arquivos_pacote,1);assert.equal(emptyCreated.arquivos_referenciados,0);
  execFileSync(process.execPath,['dist/postgres-package-recovery-cli.js','--input',emptyPackage,'--output',join(directory,'empty-restored'),'--report',emptyRecovery],{windowsHide:true,stdio:'pipe',timeout:120000,env:emptyEnv});
  const emptyRecovered=JSON.parse(await readFile(emptyRecovery,'utf8'));
  assert.equal(emptyRecovered.validado,true);assert.equal(emptyRecovered.arquivos_pacote,1);
  assert.equal(emptyRecovered.arquivos_referenciados,0);assert.equal(emptyRecovered.originais_remapeados,0);assert.equal(emptyRecovered.envios_remapeados,0);
  assert.equal((await referenciasOriginaisBackupCifrado(emptyPackage,backupKey)).size,0);
  const unsafeReport=spawnSync(process.execPath,['dist/postgres-package-recovery-cli.js','--input',emptyPackage,'--output',join(directory,'unsafe-recovery'),'--report',join(emptyPackage,'report.json')],{windowsHide:true,stdio:'pipe',timeout:30000,env:emptyEnv});
  assert.equal(unsafeReport.status,1);await assert.rejects(readFile(join(emptyPackage,'report.json')),{code:'ENOENT'});
  await assert.rejects(readFile(join(directory,'unsafe-recovery','database','main.dump')),{code:'ENOENT'});
  let lostSnapshotWorkFinished=false;
  await assert.rejects(comSnapshotBackupIsolado(source,database,async()=>{
    const holders=(await admin.query(`SELECT pid FROM pg_locks WHERE locktype='advisory'
      AND database=(SELECT oid FROM pg_database WHERE datname=$1)
      AND classid=$2::oid AND objid=$3::oid AND mode='ExclusiveLock' AND granted`,
      [database,BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY])).rows;
    assert.equal(holders.length,1);
    // Only terminate the unique backup holder inside this generated disposable database.
    assert.match(database,/^mediador_backup_test_[a-f0-9]{32}$/);
    assert.equal((await admin.query('SELECT pg_terminate_backend($1) terminated',[holders[0].pid])).rows[0].terminated,true);
    await delay(100);lostSnapshotWorkFinished=true;
  }),error=>error.code==='57P01'||/conexão|connection|terminat/i.test(error.message));
  assert.equal(lostSnapshotWorkFinished,true);
  assert.equal((await source.query('SELECT 1 ok')).rows[0].ok,1);
  await comSnapshotBackupIsolado(source,database,async()=>{});
  process.env.CREDENTIALS_MASTER_KEY=appKey.toString('base64');
  const office=(await source.query("INSERT INTO escritorios(nome) VALUES('Backup A') RETURNING id")).rows[0].id;
  const other=(await source.query("INSERT INTO escritorios(nome) VALUES('Backup B') RETURNING id")).rows[0].id;
  const customer=(await source.query("INSERT INTO clientes(escritorio_id,razao_social,cnpj) VALUES($1,'Empresa do backup','11222333000181') RETURNING id",[office])).rows[0].id;
  await source.query("INSERT INTO clientes(escritorio_id,razao_social,cnpj) VALUES($1,'Outra empresa','11444777000161')",[other]);
  const email='backup@example.invalid',password='Senha longa do backup 2026!';
  const user=(await source.query("INSERT INTO usuarios(nome,email) VALUES('Representante do backup',$1) RETURNING id",[email])).rows[0].id;
  await source.query('INSERT INTO credenciais_usuarios(usuario_id,senha_hash,atualizado_em) VALUES($1,$2,$3)',[user,await criarHashSenha(password),Date.now()]);
  await source.query('INSERT INTO usuarios_clientes(usuario_id,cliente_id,escritorio_id) VALUES($1,$2,$3)',[user,customer,office]);
  const bytes=Buffer.from('%PDF-1.7\nOriginal sintético do ensaio de recuperação\n%%EOF'),original=join(directory,'original.pdf'),base='DF000001/2026';
  await writeFile(original,bytes);
  await source.query("INSERT INTO registros(numero_registro,watch,tipo,vigencia,arquivo_path,arquivo_hash) VALUES($1,'teste','Convenção Coletiva de Trabalho','',$2,$3)",[base,original,digest(bytes)]);
  const publication=(await source.query(`INSERT INTO publicacoes_documentos(escritorio_id,cliente_id,base,versao,hash_pdf,relatorio_json,pdf,ator_id)
    VALUES($1,$2,$3,'backup-v1',$4,'{}'::jsonb,$5,$6) RETURNING id`,[office,customer,base,digest(bytes),bytes,user])).rows[0].id;
  await source.query(`INSERT INTO auditoria_seguranca(ator_id,acao,escritorio_id,cliente_id,criado_em,ip,user_agent,request_id,detalhes_json)
    VALUES($1,'ENSAIO_BACKUP',$2,$3,$4,'127.0.0.1','teste','backup-test','{}'::jsonb)`,[user,office,customer,Date.now()]);
  await scoped(source,office,tx=>salvarSmtpPostgres(tx,office,{ativo:true,host:'127.0.0.1',porta:smtp.address().port,secure:true,usuario:'ensaio',remetente:'backup@example.invalid',senha:'Segredo SMTP sintético'}));
  assert.equal(await scoped(source,office,tx=>prepararNotificacoesPublicacaoPostgres(tx,office,Number(publication))),1);
  const historical=[];
  for(const state of ['enviado','incerto','enviando']){
    const record=(await source.query(`INSERT INTO notificacoes_publicacoes(publicacao_id,escritorio_id,cliente_id,usuario_id,destino,estado,tentativas,iniciado_em,enviada_em)
      VALUES($1,$2,$3,$4,$5,$6,1,now()-interval '2 hours',CASE WHEN $6='enviado' THEN now() ELSE NULL END) RETURNING id`,[publication,office,customer,user,state+'@example.invalid',state])).rows[0];historical.push({id:record.id,estado:state});
  }
  const analysis={padrao:{campos:Object.fromEntries(CAMPOS_CCT.map(field=>[field.id,NAO_CONSTA_CCT]))}};
  await source.query("UPDATE registros SET extracao_json=$1::jsonb,analise_status='analisado' WHERE numero_registro=$2",[JSON.stringify(analysis),base]);
  const contact=(await source.query("INSERT INTO contatos(escritorio_id,nome,email) VALUES($1,'Contato da recuperação','anexos@example.invalid') RETURNING id",[office])).rows[0].id;
  await source.query('INSERT INTO clientes_contatos(escritorio_id,cliente_id,contato_id) VALUES($1,$2,$3)',[office,customer,contact]);
  const customerContext=(await source.query('SELECT cnpj,uf,municipio FROM clientes WHERE id=$1',[customer])).rows[0];
  const docContext=(await source.query('SELECT arquivo_hash,documento_meta_json,tipo,vigencia FROM registros WHERE numero_registro=$1',[base])).rows[0];
  await source.query(`INSERT INTO clientes_documentos(escritorio_id,cliente_id,numero_registro,status,motivo,contexto_hash,incluir_envio)
    VALUES($1,$2,$3,'confirmado','Ensaio de recuperação',$4,true)`,[office,customer,base,digest(JSON.stringify({cliente:customerContext,doc:docContext,vinculos:[]}))]);
  assert.deepEqual(await prepararEnviosPostgres(source,office),{preparados:1,bloqueados:0});
  const [preview]=await listarEnviosPostgres(source,office);await aprovarEnvioPostgres(source,office,Number(preview.id),'Ensaio de backup',preview.previsualizacao_hash);
  const snapshot=(await source.query('SELECT snapshot_json FROM envios_clientes WHERE id=$1',[preview.id])).rows[0].snapshot_json;
  for(const attachment of snapshot.anexos){snapshotPaths.push(attachment.path);await transformarBackup(attachment.path,join(directory,'attachment-'+snapshotPaths.length+'.enc'),backupKey,'cifrar');}
  monitoringFixture=await prepararMonitoramentoBackup(source,office,other,user);
  iaFixture=await prepararIaBackup(source,directory,user);
  for(let i=0;i<iaFixture.files.length;i++)await transformarBackup(iaFixture.files[i],join(directory,'ia-'+i+'.enc'),backupKey,'cifrar');
  const migrations=(await source.query('SELECT * FROM mediador_schema_migrations ORDER BY 1')).rows;
  const offices=(await source.query('SELECT * FROM escritorios ORDER BY id')).rows;
  const config=backupPostgresConfig(process.env,join(directory,'source.dump'));config.database=database;
  let finishCollection,collectionStarted;const collectionReady=new Promise(resolve=>{collectionStarted=resolve;}),collectionPending=new Promise(resolve=>{finishCollection=resolve;});
  const collecting=comExclusividadeMonitoramentoPostgres(source,office,async()=>{collectionStarted();await collectionPending;});
  await collectionReady;
  let pauseEntered=false;
  const pausing=comSnapshotBackupIsolado(source,database,async()=>{pauseEntered=true;assert.deepEqual(await comExclusividadeMonitoramentoPostgres(source,other,async()=>{throw new Error('Coleta não pode iniciar durante backup');}),{adquirido:false});});
  try{await delay(50);assert.equal(pauseEntered,false);}finally{finishCollection();}
  assert.equal((await collecting).adquirido,true);await pausing;assert.equal(pauseEntered,true);
  assert.equal((await comExclusividadeMonitoramentoPostgres(source,other,async()=>7)).result,7);
  const packageHashes=new Map();
  const inventory=await comSnapshotBackupIsolado(source,database,async snapshot=>{
  await assert.rejects(prepararEnviosPostgres(source,office,customer),{status:409});
  await assert.rejects(migratePostgres(source),{status:409});
  await assert.rejects(bootstrapAdministradorPostgres(source,{nome:'Teste pausa',email:'pausa@example.invalid',senha:'Senha sintética suficientemente longa 123!'}),{status:409});
  assert.equal((await source.query("SELECT 1 FROM usuarios WHERE email='pausa@example.invalid'")).rowCount,0);
  if(process.env.MEDIADOR_CLEAN_RESTORE==='1'){
    const roleProbe='mediador_backup_probe_'+randomUUID().replaceAll('-','');
    const probe=spawnSync(process.execPath,['dist/postgres-runtime-role-cli.js'],{windowsHide:true,encoding:'utf8',env:{...process.env,PGDATABASE:database,PGAPPUSER:roleProbe,PGAPPASSWORD:randomBytes(32).toString('base64')}});
    assert.equal(probe.status,1);assert.match(probe.stderr,/Backup em andamento/);assert.equal((await source.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[roleProbe])).rowCount,0);
  }
  const beforePaused=(await source.query('SELECT id,status,tentativas FROM envios_clientes ORDER BY id')).rows;
  const beforeIaPaused=(await source.query('SELECT id,status,reserva_token FROM solicitacoes_analise ORDER BY id')).rows;
  const beforeNoticesPaused=(await source.query('SELECT id,estado,tentativas FROM notificacoes_publicacoes ORDER BY id')).rows;
  await assert.rejects(processarFilaPostgres(source,office),{status:409});
  await assert.rejects(processarNotificacoesPublicacaoPostgres(source,office),{status:409});
  assert.deepEqual(await executarSolicitacaoIaPostgres(source),{reservada:false});
  assert.deepEqual(await executarAnalisePostgres(source,base),{status:'ocupada'});
  assert.deepEqual((await source.query('SELECT id,status,tentativas FROM envios_clientes ORDER BY id')).rows,beforePaused);
  assert.deepEqual((await source.query('SELECT id,status,reserva_token FROM solicitacoes_analise ORDER BY id')).rows,beforeIaPaused);
  assert.deepEqual((await source.query('SELECT id,estado,tentativas FROM notificacoes_publicacoes ORDER BY id')).rows,beforeNoticesPaused);
  const writer=await source.connect();try{await writer.query("SET lock_timeout='200ms'");await assert.rejects(writer.query('UPDATE escritorios SET nome=nome WHERE id=$1',[office]),{code:'55P03'});}finally{writer.release(true);}
  await criarBackupPostgres({...config,snapshot});
  const inventory=await inventariarArquivosBackup(await lerReferenciasBackupPostgres(source,snapshot),[resolve('data')]);
  assert.deepEqual(new Set(inventory.files.map(file=>file.source)),new Set([original,...snapshotPaths,...iaFixture.files].map(path=>resolve(path))));
  for(const file of inventory.files)packageHashes.set(file.path,digest(await readFile(file.source)));
  await criarPacoteBackup([{source:config.output,path:'database/main.dump'},...inventory.files],join(directory,'package'),backupKey);
  return inventory;
  });
  await source.query('UPDATE escritorios SET nome=nome WHERE id=$1',[office]);
  const creationReport=join(directory,'creation-report.json');
  const creationArgs=['dist/postgres-package-creation-cli.js','--root',resolve('data'),'--output',join(directory,'coordinated-package'),'--report',creationReport];
  const creationEnv={...process.env,POSTGRES_DB:database,PGDATABASE:database,BACKUP_ENCRYPTION_KEY:backupKey.toString('base64')};
  const refusedReport=join(directory,'refused-creation.json');
  const refusedArgs=['dist/postgres-package-creation-cli.js','--root',resolve('data'),'--output',join(directory,'refused-package'),'--report',refusedReport];
  const refused=spawnSync(process.execPath,refusedArgs,{windowsHide:true,encoding:'utf8',timeout:30000,env:{...creationEnv,POSTGRES_DB:'mediador'}});
  assert.equal(refused.status,1);assert.equal((refused.stdout+refused.stderr).includes(backupKey.toString('base64')),false);
  await assert.rejects(readFile(refusedReport),{code:'ENOENT'});
  await assert.rejects(readFile(join(directory,'refused-package','manifest.enc')),{code:'ENOENT'});
  const creationOutput=execFileSync(process.execPath,creationArgs,{windowsHide:true,encoding:'utf8',stdio:'pipe',timeout:120000,env:creationEnv});
  assert.equal(creationOutput.includes(backupKey.toString('base64')),false);
  const coordinated=JSON.parse(await readFile(creationReport,'utf8'));
  assert.equal(coordinated.validado,true);assert.equal(coordinated.arquivos_referenciados,inventory.files.length);
  const manifestBefore=await readFile(join(directory,'coordinated-package','manifest.enc'));
  execFileSync(process.execPath,['dist/backup-package-cli.js','copiar','--input',join(directory,'coordinated-package'),'--output',join(directory,'replica-package')],{windowsHide:true,stdio:'pipe',timeout:120000,env:creationEnv});
  assert.deepEqual(await readFile(join(directory,'replica-package','manifest.enc')),manifestBefore);
  const reportBefore=await readFile(creationReport);
  const repeat=spawnSync(process.execPath,creationArgs,{windowsHide:true,encoding:'utf8',timeout:30000,env:creationEnv});
  assert.equal(repeat.status,1);
  assert.deepEqual(await readFile(join(directory,'coordinated-package','manifest.enc')),manifestBefore);
  assert.deepEqual(await readFile(creationReport),reportBefore);
  const dumpHash=digest(await readFile(config.output));
  await transformarBackup(config.output,join(directory,'database.enc'),backupKey,'cifrar');
  await transformarBackup(original,join(directory,'original.enc'),backupKey,'cifrar');
  const keyCopy=join(keyDirectory,'keys.enc');await writeFile(keyCopy,criarCopiaChavesBackup({backupKey,credentialsKey:appKey},recoveryKey),{flag:'wx',mode:0o600});
  // Simulated loss applies only to fixtures created above, never operational files.
  await unlink(config.output);await unlink(original);for(const path of [...snapshotPaths,...iaFixture.files])await unlink(path);await source.end();source=undefined;
  assert.deepEqual(sourceErrors,[],'Origem de ensaio deve encerrar sem erro de conexão');
  await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);created=false;
  backupKey.fill(0);appKey.fill(0);delete process.env.CREDENTIALS_MASTER_KEY;
  const recoveredKeys=recuperarCopiaChavesBackup(await readFile(keyCopy,'utf8'),recoveryKey);backupKey=recoveredKeys.backupKey;appKey=recoveredKeys.credentialsKey;process.env.CREDENTIALS_MASTER_KEY=appKey.toString('base64');
  const protectedReferences=await referenciasOriginaisBackupCifrado(join(directory,'coordinated-package'),backupKey);
  for(const file of inventory.files){
    assert.ok(protectedReferences.has('hash:'+file.sha256));
    for(const origin of file.references)assert.ok(protectedReferences.has(resolve(origin).toLowerCase()));
  }
  const packageRestored=join(directory,'package-restored');
  const commandReport=join(directory,'command-report.json');
  execFileSync(process.execPath,['dist/postgres-package-recovery-cli.js','--input',join(directory,'replica-package'),'--output',join(directory,'command-restored'),'--report',commandReport],{windowsHide:true,stdio:'pipe',env:{...process.env,BACKUP_ENCRYPTION_KEY:backupKey.toString('base64')}});
  const commandResult=JSON.parse(await readFile(commandReport,'utf8'));
  assert.equal(commandResult.validado,true);assert.equal(commandResult.servicos_ativados,false);assert.equal(commandResult.originais_remapeados,5);assert.equal(commandResult.arquivos_referenciados,inventory.files.length);
  assert.equal(JSON.stringify(commandResult).includes(backupKey.toString('base64')),false);
  const restoredPackage=await recuperarPacoteBackup(join(directory,'package'),packageRestored,backupKey);
  assert.ok(restoredPackage.references);
  assert.equal(digest(await readFile(join(packageRestored,'database/main.dump'))),dumpHash);
  for(const file of inventory.files)assert.equal(digest(await readFile(join(packageRestored,...file.path.split('/')))),packageHashes.get(file.path));
  const recovered=join(directory,'recovered.dump');
  await transformarBackup(join(directory,'database.enc'),recovered,backupKey,'decifrar');
  assert.equal(digest(await readFile(recovered)),dumpHash);
  const remapMode=process.env.MEDIADOR_REMAP_RESTORE==='1';
  if(remapMode)for(const path of [original,...snapshotPaths,...iaFixture.files])await assert.rejects(readFile(path),{code:'ENOENT'});
  if(!remapMode){await transformarBackup(join(directory,'original.enc'),original,backupKey,'decifrar');for(let i=0;i<snapshotPaths.length;i++)await transformarBackup(join(directory,'attachment-'+(i+1)+'.enc'),snapshotPaths[i],backupKey,'decifrar');for(let i=0;i<iaFixture.files.length;i++)await transformarBackup(join(directory,'ia-'+i+'.enc'),iaFixture.files[i],backupKey,'decifrar');}
  const mappedPath=old=>join(packageRestored,...inventory.files.find(file=>file.source===resolve(old)).path.split('/'));
  const remappedSnapshot=remapMode?{...snapshot,anexos:snapshot.anexos.map(file=>({...file,path:mappedPath(file.path)}))}:snapshot;
  await comBackupRestauradoIsolado({...config,backup:join(packageRestored,'database/main.dump')},async restored=>{
    assert.match(restored,/^mediador_import_test_[a-f0-9]{32}$/);
    const target=criarPoolPostgres({...process.env,PGDATABASE:restored});let runtime;
    try{
      if(remapMode){await assert.rejects(remapearArquivosBackupIsolado(target,'mediador',packageRestored,restoredPackage.references));
      await assert.rejects(remapearArquivosBackupIsolado(target,'mediador_import_test_'+'0'.repeat(32),packageRestored,restoredPackage.references));
      await assert.rejects(remapearArquivosBackupIsolado(target,restored,directory,restoredPackage.references));
      await assert.rejects(remapearArquivosBackupIsolado(target,restored,packageRestored,[]));
      assert.equal((await target.query('SELECT arquivo_path FROM registros WHERE numero_registro=$1',[base])).rows[0].arquivo_path,original);
      assert.deepEqual(await remapearArquivosBackupIsolado(target,restored,packageRestored,restoredPackage.references),{originais:5,envios:1,arquivos:inventory.files.length});}
      assert.deepEqual((await target.query('SELECT * FROM mediador_schema_migrations ORDER BY 1')).rows,migrations);
      assert.deepEqual((await target.query('SELECT * FROM escritorios ORDER BY id')).rows,offices);
      const doc=(await target.query('SELECT arquivo_path,arquivo_hash FROM registros WHERE numero_registro=$1',[base])).rows[0];
      assert.equal(digest(await readFile(doc.arquivo_path)),doc.arquivo_hash);
      const role=process.env.PGAPPUSER;assert.match(role??'',/^[a-zA-Z_][a-zA-Z0-9_]*$/);
      // Dumps deliberately omit grants: provision only the disposable restored database.
      if(process.env.MEDIADOR_CLEAN_RESTORE==='1'){
        assert.match(process.env.POSTGRES_CONTAINER??'',/^mediador-clean-recovery-[a-f0-9-]{36}$/);
        execFileSync(process.execPath,['dist/postgres-runtime-role-cli.js'],{windowsHide:true,stdio:'inherit',env:{...process.env,PGDATABASE:restored}});
      }else{
      await target.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
      await target.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${role}"`);
      await target.query(`GRANT UPDATE ON usuarios,credenciais_usuarios,publicacoes_documentos,clientes TO "${role}"`);
      await target.query(`GRANT INSERT,UPDATE ON sessoes_usuarios,limites_autenticacao TO "${role}"`);
      await target.query(`GRANT DELETE ON limites_autenticacao TO "${role}"`);
      await target.query(`GRANT INSERT,UPDATE ON notificacoes_publicacoes TO "${role}"`);
      await target.query(`GRANT INSERT,UPDATE ON solicitacoes_analise,tentativas_analise TO "${role}"`);
      await target.query(`GRANT INSERT,UPDATE ON execucoes_escritorio,registros TO "${role}"`);
      await target.query(`GRANT INSERT ON registros_sindicatos TO "${role}"`);
      await target.query(`GRANT UPDATE ON escritorios,monitoramentos_escritorios TO "${role}"`);
      await target.query(`GRANT UPDATE ON registros TO "${role}"`);
      await target.query(`GRANT INSERT ON tentativas_envio TO "${role}"`);
      await target.query(`GRANT INSERT,UPDATE ON envios_clientes TO "${role}"`);
      await target.query(`GRANT INSERT ON auditoria_seguranca,auditoria_acessos_publicacoes TO "${role}"`);
      await target.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
      }
      runtime=criarPoolPostgresRuntime({...process.env,PGDATABASE:restored,PGPOOL_MAX:'3'});await validarPapelRuntimePostgres(runtime);
      const retentionCatalog=join(directory,'retention-catalog.json'),retentionReport=join(directory,'retention-report.json');
      await writeFile(retentionCatalog,JSON.stringify({formato:'catalogo-backups-retencao-v1',pacotes:[{pasta:'coordinated-package',chave_env:'BACKUP_ENCRYPTION_KEY_REHEARSAL'}]}),{flag:'wx'});
      const retentionEnv={...process.env,PGDATABASE:restored,DOWNLOAD_DIR:directory,BACKUP_ENCRYPTION_KEY_REHEARSAL:backupKey.toString('base64')};
      execFileSync(process.execPath,['dist/postgres-original-inventory-cli.js','--output',retentionReport,'--backup-catalog',retentionCatalog,'--min-age-days','30'],{windowsHide:true,stdio:'pipe',timeout:120000,env:retentionEnv});
      const retention=JSON.parse(await readFile(retentionReport,'utf8'));
      assert.equal(retention.fontes.backups_cifrados,1);assert.equal(retention.autoriza_exclusao,false);
      assert.equal(retention.min_age_days,30);
      assert.equal(JSON.stringify(retention).includes(backupKey.toString('base64')),false);
      const coverageRoot=join(directory,'coverage-root');await mkdir(coverageRoot);
      execFileSync(process.execPath,['dist/backup-package-cli.js','copiar','--input',join(directory,'coordinated-package'),'--output',join(coverageRoot,'copy')],{windowsHide:true,stdio:'pipe',timeout:120000,env:{...retentionEnv,BACKUP_ENCRYPTION_KEY:backupKey.toString('base64')}});
      const omittedReport=join(directory,'omitted-report.json');
      const omitted=spawnSync(process.execPath,['dist/postgres-original-inventory-cli.js','--output',omittedReport,'--backup-catalog',retentionCatalog,'--backup-root',coverageRoot],{windowsHide:true,stdio:'pipe',timeout:30000,env:retentionEnv});
      assert.equal(omitted.status,1);await assert.rejects(readFile(omittedReport),{code:'ENOENT'});
      const coverageCatalog=join(directory,'coverage-catalog.json'),coverageReport=join(directory,'coverage-report.json');
      await writeFile(coverageCatalog,JSON.stringify({formato:'catalogo-backups-retencao-v1',pacotes:[{pasta:'coverage-root/copy',chave_env:'BACKUP_ENCRYPTION_KEY_REHEARSAL'}]}));
      execFileSync(process.execPath,['dist/postgres-original-inventory-cli.js','--output',coverageReport,'--backup-catalog',coverageCatalog,'--backup-root',coverageRoot],{windowsHide:true,stdio:'pipe',timeout:120000,env:retentionEnv});
      assert.deepEqual(JSON.parse(await readFile(coverageReport,'utf8')).cobertura_backups,{conferida:true,raizes:1,pacotes_descobertos:1,limitada_as_raizes_informadas:true});
      const revalidationReport=join(directory,'retention-revalidated.json');
      execFileSync(process.execPath,['dist/postgres-original-inventory-cli.js','--output',revalidationReport,'--backup-catalog',retentionCatalog,'--revalidate-report',retentionReport],{windowsHide:true,stdio:'pipe',timeout:120000,env:retentionEnv});
      const revalidated=JSON.parse(await readFile(revalidationReport,'utf8'));
      assert.equal(revalidated.formato,'revalidacao-inventario-originais-v1');
      assert.equal(revalidated.min_age_days,30);
      const changedAgeReport=join(directory,'changed-age.json');
      const changedAge=spawnSync(process.execPath,['dist/postgres-original-inventory-cli.js','--output',changedAgeReport,'--backup-catalog',retentionCatalog,'--revalidate-report',retentionReport,'--min-age-days','7'],{windowsHide:true,stdio:'pipe',timeout:120000,env:retentionEnv});
      assert.equal(changedAge.status,1);await assert.rejects(readFile(changedAgeReport),{code:'ENOENT'});
      assert.equal(revalidated.fontes_anteriores_conferidas,true);
      assert.match(retention.evidencia_fontes.postgres,/^[a-f0-9]{64}$/);
      const wrongDatabaseReport=join(directory,'wrong-database-retention.json');
      const wrongDatabase=spawnSync(process.execPath,['dist/postgres-original-inventory-cli.js','--output',wrongDatabaseReport,'--backup-catalog',retentionCatalog,'--revalidate-report',retentionReport],{windowsHide:true,stdio:'pipe',timeout:120000,env:{...retentionEnv,PGDATABASE:process.env.PGDATABASE}});
      assert.equal(wrongDatabase.status,1);await assert.rejects(readFile(wrongDatabaseReport),{code:'ENOENT'});
      const reducedReport=join(directory,'reduced-sources.json');
      const reduced=spawnSync(process.execPath,['dist/postgres-original-inventory-cli.js','--output',reducedReport,'--revalidate-report',retentionReport],{windowsHide:true,stdio:'pipe',timeout:30000,env:retentionEnv});
      assert.equal(reduced.status,1);await assert.rejects(readFile(reducedReport),{code:'ENOENT'});
      assert.equal(revalidated.candidatos_anteriores,retention.candidatos.length);
      assert.equal(revalidated.autoriza_exclusao,false);assert.equal(revalidated.fontes.backups_cifrados,1);
      const failedRetention=join(directory,'retention-failed.json');
      const missingKey=spawnSync(process.execPath,['dist/postgres-original-inventory-cli.js','--output',failedRetention,'--backup-catalog',retentionCatalog],{windowsHide:true,stdio:'pipe',timeout:30000,env:{...retentionEnv,BACKUP_ENCRYPTION_KEY_REHEARSAL:''}});
      assert.equal(missingKey.status,1);await assert.rejects(readFile(failedRetention),{code:'ENOENT'});
      assert.equal((await runtime.query('SELECT * FROM clientes')).rowCount,0);
      assert.equal((await scoped(runtime,office,tx=>tx.query('SELECT * FROM clientes'))).rowCount,1);
      assert.equal((await scoped(runtime,other,tx=>tx.query('SELECT * FROM clientes WHERE id=$1',[customer]))).rowCount,0);
      assert.equal((await runtime.query('SELECT * FROM clientes')).rowCount,0);
      const auth=criarAutenticacaoPostgres(runtime),session=await auth.login({email,senha:password});assert.equal((await auth.exigirSessao(session.token)).usuario_id,user);
      const adversarialSession=await auth.login({email,senha:password});
      pilotMetrics=await validarConcorrenciaContextos(target,runtime,await auth.exigirSessao(adversarialSession.token),office,other,
        {auth,token:adversarialSession.token,otherToken:session.token});
      assert.equal(pilotMetrics.rodadas,120);assert.equal(pilotMetrics.rollbacks,60);
      assert.ok(pilotMetrics.latencia_rodada_ms.min<=pilotMetrics.latencia_rodada_ms.p50);
      assert.ok(pilotMetrics.latencia_rodada_ms.p50<=pilotMetrics.latencia_rodada_ms.p95);
      assert.ok(pilotMetrics.latencia_rodada_ms.p95<=pilotMetrics.latencia_rodada_ms.max);
      const file=await abrirPortalDocumentoPostgres(runtime,{escritorio_id:office,cliente_id:customer},user,Number(publication),true,{ip:'127.0.0.1',request_id:'restored-portal'});assert.deepEqual(file.bytes,bytes);
      assert.equal((await obterSmtpSecretoPostgres(runtime,office)).senha,'Segredo SMTP sintético');
      process.env.CREDENTIALS_MASTER_KEY=randomBytes(32).toString('base64');
      await assert.rejects(obterSmtpSecretoPostgres(runtime,office),{status:503});process.env.CREDENTIALS_MASTER_KEY=appKey.toString('base64');
      const audit=(await target.query("SELECT id FROM auditoria_seguranca WHERE acao='ENSAIO_BACKUP'")).rows[0];assert.ok(audit);
      await assert.rejects(target.query('DELETE FROM auditoria_seguranca WHERE id=$1',[audit.id]),{code:'23514'});
      await assert.rejects(target.query("UPDATE auditoria_seguranca SET ip='203.0.113.55' WHERE id=$1",[audit.id]),{code:'23514'});
      await assert.rejects(target.query('TRUNCATE auditoria_seguranca'),{code:'23514'});
      assert.equal((await target.query('SELECT ip FROM auditoria_seguranca WHERE id=$1',[audit.id])).rows[0].ip,'127.0.0.1');
      const next=(await target.query("INSERT INTO escritorios(nome) VALUES('Após restauração') RETURNING id")).rows[0].id;assert.ok(next>Math.max(office,other));
      if(process.env.MEDIADOR_CLEAN_RESTORE==='1')await validarHttpRestaurado(restored,{email,password,customer,publication,bytes,smtpPort:smtp.address().port});
      assert.deepEqual((await target.query('SELECT snapshot_json FROM envios_clientes WHERE id=$1',[preview.id])).rows[0].snapshot_json,remappedSnapshot);
      for(const attachment of remappedSnapshot.anexos)assert.equal(digest(await readFile(attachment.path)),attachment.hash);
      assert.deepEqual(await processarFilaPostgres(runtime,other),{enviados:0,falhas:0,ignorados:0});assert.equal(messages.length,0);
      if(remapMode){
      assert.deepEqual((await target.query('SELECT status,aprovado_por,contexto_aprovacao FROM envios_clientes WHERE id=$1',[preview.id])).rows[0],{status:'revisao',aprovado_por:null,contexto_aprovacao:null});
      assert.deepEqual(await processarFilaPostgres(runtime,office),{enviados:0,falhas:0,ignorados:0});assert.equal(messages.length,0);
      assert.equal(Number((await target.query('SELECT count(*) n FROM tentativas_envio WHERE envio_id=$1',[preview.id])).rows[0].n),0);
      await assert.rejects(aprovarEnvioPostgres(runtime,office,Number(preview.id),'Revisão antiga',preview.previsualizacao_hash),{status:409});
      assert.deepEqual(await prepararEnviosPostgres(runtime,other,customer),{preparados:0,bloqueados:0});
      assert.deepEqual(await prepararEnviosPostgres(runtime,office,customer),{preparados:1,bloqueados:0});
      const views=await listarEnviosPostgres(runtime,office);
      const fresh=views.find(item=>item.id!==preview.id&&item.status==='revisao');assert.ok(fresh);
      const freshSnapshot=(await target.query('SELECT snapshot_json FROM envios_clientes WHERE id=$1',[fresh.id])).rows[0].snapshot_json;
      for(const attachment of freshSnapshot.anexos)snapshotPaths.push(attachment.path);
      assert.ok(freshSnapshot.anexos.every(file=>file.nome.endsWith('.pdf')));
      assert.equal((await target.query('SELECT status FROM envios_clientes WHERE id=$1',[preview.id])).rows[0].status,'cancelado');
      assert.deepEqual((await target.query('SELECT snapshot_json FROM envios_clientes WHERE id=$1',[preview.id])).rows[0].snapshot_json,remappedSnapshot);
      assert.deepEqual(await prepararEnviosPostgres(runtime,office,customer),{preparados:0,bloqueados:0});
      assert.deepEqual(await processarFilaPostgres(runtime,office),{enviados:0,falhas:0,ignorados:0});assert.equal(messages.length,0);
      await assert.rejects(aprovarEnvioPostgres(runtime,office,Number(fresh.id),'Revisão obsoleta',preview.previsualizacao_hash),{status:409});
      await aprovarEnvioPostgres(runtime,office,Number(fresh.id),'Nova revisão após recuperação',fresh.previsualizacao_hash);
      assert.deepEqual(await processarFilaPostgres(runtime,office),{enviados:1,falhas:0,ignorados:0});assert.equal(messages.length,1);
      const recoveredParts=messages[0].split(/\r\n--[^\r\n]+\r\n/).filter(part=>/Content-Disposition: attachment/i.test(part));
      const receivedHashes=recoveredParts.map(part=>digest(Buffer.from(part.slice(part.indexOf('\r\n\r\n')+4).split('\r\n--')[0].replace(/\s/g,''),'base64')));
      for(const attachment of freshSnapshot.anexos)assert.ok(receivedHashes.includes(attachment.hash));
      assert.deepEqual(await processarFilaPostgres(runtime,office),{enviados:0,falhas:0,ignorados:0});assert.equal(messages.length,1);
      assert.equal(Number((await target.query('SELECT count(*) n FROM tentativas_envio WHERE envio_id=$1',[fresh.id])).rows[0].n),1);
      }else{
      const deliveryResult=await processarFilaPostgres(runtime,office);assert.deepEqual(deliveryResult,{enviados:1,falhas:0,ignorados:0},JSON.stringify((await target.query('SELECT erro FROM envios_clientes WHERE id=$1',[preview.id])).rows));assert.equal(messages.length,1);
      assert.match(messages[0],/anexos@example.invalid/);assert.match(messages[0],/original\.pdf/);assert.match(messages[0],/analise\.pdf/);
      const mimeParts=messages[0].split(/\r\n--[^\r\n]+\r\n/).filter(part=>/Content-Disposition: attachment/i.test(part));
      const attachmentHashes=mimeParts.map(part=>digest(Buffer.from(part.slice(part.indexOf('\r\n\r\n')+4).split('\r\n--')[0].replace(/\s/g,''),'base64')));
      for(const attachment of snapshot.anexos)assert.ok(attachmentHashes.includes(attachment.hash),'Anexo recebido deve corresponder ao snapshot recuperado');
      assert.deepEqual(await processarFilaPostgres(runtime,office),{enviados:0,falhas:0,ignorados:0});assert.equal(messages.length,1);
      assert.equal(Number((await target.query('SELECT count(*) n FROM tentativas_envio WHERE envio_id=$1',[preview.id])).rows[0].n),1);
      }
      messages.length=0;
      assert.deepEqual(await executarCicloFilasPostgres(runtime,{publicUrl:'https://localhost:3443'}),{escritorios:1,envios:0,notificacoes:1,falhas:0});
      assert.equal(messages.length,1);assert.match(messages[0],/backup@example.invalid/);assert.doesNotMatch(messages[0],/Content-Disposition: attachment/i);
      const states=(await target.query('SELECT id,estado FROM notificacoes_publicacoes WHERE id=ANY($1::bigint[]) ORDER BY id',[historical.map(row=>row.id)])).rows;
      assert.deepEqual(states,historical);
      assert.deepEqual(await executarCicloFilasPostgres(runtime),{escritorios:0,envios:0,notificacoes:0,falhas:0});assert.equal(messages.length,1);
      assert.equal(await recuperarNotificacoesPublicacaoPresasPostgres(runtime,other),0);
      assert.equal(await recuperarNotificacoesPublicacaoPresasPostgres(runtime,office),1);
      assert.deepEqual(await executarCicloFilasPostgres(runtime),{escritorios:0,envios:0,notificacoes:0,falhas:0});assert.equal(messages.length,1);
      const ambiguous=(await target.query(`INSERT INTO publicacoes_documentos(escritorio_id,cliente_id,base,versao,hash_pdf,relatorio_json,pdf,ator_id)
        VALUES($1,$2,$3,'backup-v2',$4,'{}'::jsonb,$5,$6) RETURNING id`,[office,customer,base,digest(bytes),bytes,user])).rows[0].id;
      await scoped(runtime,office,tx=>prepararNotificacoesPublicacaoPostgres(tx,office,Number(ambiguous)));
      disconnectAfterData=true;
      assert.deepEqual(await executarCicloFilasPostgres(runtime),{escritorios:1,envios:0,notificacoes:0,falhas:1});assert.equal(messages.length,2);
      assert.equal((await target.query('SELECT estado FROM notificacoes_publicacoes WHERE publicacao_id=$1',[ambiguous])).rows[0].estado,'incerto');disconnectAfterData=false;
      assert.deepEqual(await executarCicloFilasPostgres(runtime),{escritorios:0,envios:0,notificacoes:0,falhas:0});assert.equal(messages.length,2);

      await iaFixture.validar(target,runtime);
      await monitoringFixture.validar(target,runtime);
    }finally{await runtime?.end();await target.end();}
  });
  assert.ok(pilotMetrics?.validado);
  if(process.env.MEDIADOR_PILOT_REPORT_PATH)await writeFile(process.env.MEDIADOR_PILOT_REPORT_PATH,JSON.stringify(pilotMetrics,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('Métricas de concorrência: '+JSON.stringify(pilotMetrics));
  console.log(process.env.MEDIADOR_REMAP_RESTORE==='1'?'OK: recuperação remapeada com origens removidas, hashes conferidos, destino isolado, rollback por arquivo ausente, HTTP, IA e monitoramento; nova preparação sem duplicação, histórico preservado, aprovação explícita e anexos SMTP TLS íntegros sem reenvio; notificações sem repetição de estados incertos.':'OK: dump real cifrado/recuperado/restaurado, originais e PDF íntegros, migrações/identidades/auditoria preservadas, login, RLS, segredo com chave compatível e workers SMTP TLS, anexos recebidos com hashes conferidos e sem reenvio automático de estados incertos; fila IA restaurada e recuperada com provedor HTTP local; monitoramento/agendas restaurados com scraper controlado; chaves recuperadas de cópia cifrada separada.');
}finally{
  if(previousKey===undefined)delete process.env.CREDENTIALS_MASTER_KEY;else process.env.CREDENTIALS_MASTER_KEY=previousKey;
  await iaFixture?.close();
  for(const socket of sockets)socket.destroy();if(smtp.listening)await new Promise(resolve=>smtp.close(resolve));
  backupKey.fill(0);appKey.fill(0);recoveryKey.fill(0);await source?.end();
  if(created){assert.match(database,/^mediador_backup_test_[a-f0-9]{32}$/);await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);}await admin.end();
  const snapshotDirectories=new Set(snapshotPaths.map(path=>resolve(path,'..')));
  for(const dir of snapshotDirectories){assert.ok(dir.startsWith(resolve('data','envios')+sep));assert.match(dir.slice(resolve('data','envios').length+1),/^[a-f0-9-]{36}$/);await rm(dir,{recursive:true,force:true});}
  assert.ok(resolve(directory).startsWith(resolve('data')+sep));await rm(directory,{recursive:true,force:true});
  assert.ok(resolve(keyDirectory).startsWith(resolve(tmpdir())+sep));await rm(keyDirectory,{recursive:true,force:true});
}

}


