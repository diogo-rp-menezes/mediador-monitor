// Isolated real PostgreSQL + local SMTP. Run after npm run build.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import tls from 'node:tls';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {criarPoolPostgres,criarPoolPostgresRuntime} from '../dist/postgres.js';
import {migratePostgres} from '../dist/postgres-migrations.js';
import {withPostgresOfficeTransaction as scoped} from '../dist/postgres-transaction.js';
import {prepararEnviosPostgres} from '../dist/postgres-preparacao-envios.js';
import {listarEnviosPostgres,aprovarEnvioPostgres,processarFilaPostgres,recuperarEnviosPresosPostgres,reservarEnviosPostgres} from '../dist/postgres-fila-envios.js';
import {CAMPOS_CCT,NAO_CONSTA_CCT} from '../dist/cct-template.js';
import {hashBytes} from '../dist/relatorio-core.js';
import {executarCicloFilasPostgres} from '../dist/postgres-worker.js';
import {prepararNotificacoesPublicacaoPostgres} from '../dist/postgres-notificacoes-publicacoes.js';

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
  }finally{rmSync(certDir,{recursive:true,force:true});}
}else{

const database='mediador_delivery_test_'+randomUUID().replaceAll('-','');
const admin=criarPoolPostgres();let setup,runtime,secondRuntime,created=false,directory,disconnectAfterData=false;
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
try{
  await admin.query(`CREATE DATABASE "${database}"`);created=true;
  setup=criarPoolPostgres({...process.env,PGDATABASE:database});
  await migratePostgres(setup);
  const role=process.env.PGAPPUSER;
  assert.match(role??'',/^[a-zA-Z_][a-zA-Z0-9_]*$/);
  const attributes=(await setup.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[role])).rows[0];
  assert.ok(attributes&&!attributes.rolsuper&&!attributes.rolbypassrls,'Runtime must enforce RLS');
  await setup.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
  await setup.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`);
  await setup.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
  runtime=criarPoolPostgresRuntime({...process.env,PGDATABASE:database,PGPOOL_MAX:'1'});
  directory=mkdtempSync(resolve('data','pg-delivery-test-'));
  const path=join(directory,'original.pdf'),bytes=Buffer.from('%PDF-1.7\nTest original');writeFileSync(path,bytes);
  const office=(await setup.query("INSERT INTO escritorios(nome) VALUES('Teste A') RETURNING id")).rows[0].id;
  const other=(await setup.query("INSERT INTO escritorios(nome) VALUES('Teste B') RETURNING id")).rows[0].id;
  const customer=(await setup.query("INSERT INTO clientes(escritorio_id,razao_social,cnpj) VALUES($1,'Cliente teste','11222333000181') RETURNING id",[office])).rows[0].id;
  const contact=(await setup.query("INSERT INTO contatos(escritorio_id,nome,email) VALUES($1,'Contato teste','destino@example.test') RETURNING id",[office])).rows[0].id;
  await setup.query('INSERT INTO clientes_contatos(escritorio_id,cliente_id,contato_id) VALUES($1,$2,$3)',[office,customer,contact]);
  const number='DF000001/2026',type='Convenção Coletiva de Trabalho';
  const analysis={padrao:{campos:Object.fromEntries(CAMPOS_CCT.map(field=>[field.id,NAO_CONSTA_CCT]))}};
  await setup.query(`INSERT INTO registros(numero_registro,watch,tipo,vigencia,arquivo_path,arquivo_hash,extracao_json,analise_status)
    VALUES($1,'teste',$2,'',$3,$4,$5::jsonb,'analisado')`,[number,type,path,hashBytes(bytes),JSON.stringify(analysis)]);
  const c=(await setup.query('SELECT cnpj,uf,municipio FROM clientes WHERE id=$1',[customer])).rows[0];
  const d=(await setup.query('SELECT arquivo_hash,documento_meta_json,tipo,vigencia FROM registros WHERE numero_registro=$1',[number])).rows[0];
  const context=hashBytes(JSON.stringify({cliente:c,doc:d,vinculos:[]}));
  await setup.query(`INSERT INTO clientes_documentos(escritorio_id,cliente_id,numero_registro,status,motivo,contexto_hash,incluir_envio)
    VALUES($1,$2,$3,'confirmado','Teste',$4,true)`,[office,customer,number,context]);
  smtp.listen(0,'127.0.0.1');await once(smtp,'listening');
  await setup.query(`INSERT INTO configuracoes_smtp_escritorio(escritorio_id,ativo,host,porta,remetente,secure)
    VALUES($1,true,'127.0.0.1',$2,'teste@example.test',true)`,[office,smtp.address().port]);
  await setup.query(`REVOKE INSERT ON auditoria_seguranca FROM "${role}"`);
  assert.deepEqual(await prepararEnviosPostgres(runtime,office),{preparados:0,bloqueados:1});
  assert.equal(Number((await setup.query('SELECT count(*) n FROM envios_clientes WHERE escritorio_id=$1',[office])).rows[0].n),0);
  await setup.query(`GRANT INSERT ON auditoria_seguranca TO "${role}"`);
  assert.deepEqual(await prepararEnviosPostgres(runtime,office),{preparados:1,bloqueados:0});
  const preparedOrigins=await scoped(runtime,office,tx=>tx.query('SELECT snapshot_json FROM envios_clientes WHERE escritorio_id=$1',[office]));
  assert.deepEqual(preparedOrigins.rows[0].snapshot_json.preparacao,{tipo:'sistema',rotina:'preparacao-envios-v1'});
  const preparationAudit=await scoped(runtime,office,tx=>tx.query("SELECT ator_id,ip,detalhes_json FROM auditoria_seguranca WHERE escritorio_id=$1 AND acao='ENVIO_PREPARACAO_CONCLUIDA'",[office]));
  assert.equal(preparationAudit.rows.length,1);assert.equal(preparationAudit.rows[0].ator_id,null);assert.equal(preparationAudit.rows[0].ip,'');
  assert.deepEqual(preparationAudit.rows[0].detalhes_json.origem,{tipo:'sistema',rotina:'preparacao-envios-v1'});
  const [preview]=await listarEnviosPostgres(runtime,office);assert.equal(preview.status,'revisao');
  assert.deepEqual(await listarEnviosPostgres(runtime,other),[]);
  await assert.rejects(aprovarEnvioPostgres(runtime,other,Number(preview.id),'Teste',preview.previsualizacao_hash),{status:404});
  await aprovarEnvioPostgres(runtime,office,Number(preview.id),'Teste',preview.previsualizacao_hash);
  assert.deepEqual(await processarFilaPostgres(runtime,other),{enviados:0,falhas:0,ignorados:0});
  const outcome=await processarFilaPostgres(runtime,office);
  assert.deepEqual(outcome,{enviados:1,falhas:0,ignorados:0},JSON.stringify((await listarEnviosPostgres(runtime,office)).map(({status,erro})=>({status,erro}))));
  assert.equal(messages.length,1);assert.match(messages[0],/destino@example.test/);
  assert.match(messages[0],/original\.pdf/);assert.match(messages[0],/analise\.pdf/);
  assert.equal((await listarEnviosPostgres(runtime,office))[0].status,'enviado');
  assert.deepEqual(await processarFilaPostgres(runtime,office),{enviados:0,falhas:0,ignorados:0});
  assert.equal(messages.length,1);
  assert.equal((await scoped(runtime,office,async tx=>(await tx.query('SELECT count(*)::integer total FROM tentativas_envio WHERE escritorio_id=$1',[office])).rows[0].total)),1);
  // Each scenario gets a distinct recipient, preserving completed delivery history.
  async function approved(label){
    const id=(await setup.query('INSERT INTO contatos(escritorio_id,nome,email) VALUES($1,$2,$3) RETURNING id',[office,label,label+'@example.test'])).rows[0].id;
    await setup.query('INSERT INTO clientes_contatos(escritorio_id,cliente_id,contato_id) VALUES($1,$2,$3)',[office,customer,id]);
    assert.deepEqual(await prepararEnviosPostgres(runtime,office,customer,{contato_id:id,numero_registro:number}),{preparados:1,bloqueados:0});
    const preview=(await listarEnviosPostgres(runtime,office)).find(item=>item.contato_id===id);
    await aprovarEnvioPostgres(runtime,office,Number(preview.id),'Teste',preview.previsualizacao_hash);
    return {contact:id,delivery:Number(preview.id)};
  }
  async function blocked(label,mutate){
    const target=await approved(label),count=messages.length;
    await mutate(target);
    assert.deepEqual(await processarFilaPostgres(runtime,office),{enviados:0,falhas:1,ignorados:1});
    assert.equal(messages.length,count,'Changed approval must never reach SMTP');
    assert.equal((await listarEnviosPostgres(runtime,office)).find(item=>Number(item.id)===target.delivery).status,'falhou');
  }
  await blocked('email-alterado',target=>setup.query('UPDATE contatos SET email=$1 WHERE id=$2',['novo@example.test',target.contact]));
  await blocked('preferencia-alterada',target=>setup.query('UPDATE clientes_contatos SET tipos_json=$1::jsonb WHERE contato_id=$2',[JSON.stringify(['Outro instrumento']),target.contact]));
  await blocked('anexo-alterado',async target=>{
    const raw=(await setup.query('SELECT snapshot_json FROM envios_clientes WHERE id=$1',[target.delivery])).rows[0].snapshot_json;
    writeFileSync(raw.anexos[0].path,'corrompido');
  });
  await approved('concorrencia');
  secondRuntime=criarPoolPostgresRuntime({...process.env,PGDATABASE:database,PGPOOL_MAX:'1'});
  const before=messages.length;
  const settled=await Promise.allSettled([processarFilaPostgres(runtime,office),processarFilaPostgres(secondRuntime,office)]);
  const results=settled.map(result=>{if(result.status==='rejected')throw result.reason;return result.value;});
  assert.equal(results.reduce((total,result)=>total+result.enviados,0),1);
  assert.equal(results.reduce((total,result)=>total+result.falhas,0),0);
  assert.equal(messages.length,before+1,'Concurrent workers must deliver only once');
  const uncertain=await approved('smtp-interrompido');disconnectAfterData=true;
  assert.deepEqual(await processarFilaPostgres(runtime,office),{enviados:0,falhas:1,ignorados:0});
  assert.equal((await listarEnviosPostgres(runtime,office)).find(item=>Number(item.id)===uncertain.delivery).status,'incerto');
  disconnectAfterData=false;
  assert.deepEqual(await processarFilaPostgres(runtime,office),{enviados:0,falhas:0,ignorados:0});
  const interrupted=await approved('worker-interrompido');
  const [leased]=await reservarEnviosPostgres(runtime,office);assert.equal(Number(leased.id),interrupted.delivery);
  await setup.query("UPDATE envios_clientes SET atualizado_em=now()-interval '1 hour' WHERE id=$1",[interrupted.delivery]);
  assert.equal(await recuperarEnviosPresosPostgres(runtime,other),0);
  assert.equal(await recuperarEnviosPresosPostgres(runtime,office),1);
  assert.equal((await listarEnviosPostgres(runtime,office)).find(item=>Number(item.id)===interrupted.delivery).status,'incerto');
  assert.deepEqual(await processarFilaPostgres(runtime,office),{enviados:0,falhas:0,ignorados:0});
  await approved('worker-automatico');
  await setup.query('UPDATE escritorios SET ativo=false WHERE id=$1',[office]);
  assert.deepEqual(await executarCicloFilasPostgres(runtime),{escritorios:0,envios:0,notificacoes:0,falhas:0});
  await setup.query('UPDATE escritorios SET ativo=true WHERE id=$1',[office]);
  assert.deepEqual(await executarCicloFilasPostgres(runtime),{escritorios:1,envios:1,notificacoes:0,falhas:0});
  assert.deepEqual(await executarCicloFilasPostgres(runtime),{escritorios:0,envios:0,notificacoes:0,falhas:0});
  const user=(await setup.query("INSERT INTO usuarios(nome,email) VALUES('Representante','representante@example.test') RETURNING id")).rows[0].id;
  await setup.query('INSERT INTO usuarios_clientes(usuario_id,cliente_id,escritorio_id) VALUES($1,$2,$3)',[user,customer,office]);
  let publicationVersion=0;
  async function notice(){
    const publication=(await setup.query(`INSERT INTO publicacoes_documentos(escritorio_id,cliente_id,base,versao,hash_pdf,relatorio_json,pdf,ator_id)
      VALUES($1,$2,$3,$4,$5,'{}'::jsonb,$6,$7) RETURNING id`,[office,customer,number,'notice-'+(++publicationVersion),hashBytes(bytes),bytes,user])).rows[0].id;
    assert.equal(await scoped(runtime,office,tx=>prepararNotificacoesPublicacaoPostgres(tx,office,Number(publication))),1);
    assert.equal(await scoped(runtime,office,tx=>prepararNotificacoesPublicacaoPostgres(tx,office,Number(publication))),0);
    await assert.rejects(scoped(runtime,other,tx=>prepararNotificacoesPublicacaoPostgres(tx,other,Number(publication))),{status:404});
    return publication;
  }
  const noticeBefore=messages.length;
  await notice();
  assert.deepEqual(await executarCicloFilasPostgres(runtime,{publicUrl:'https://app.example.test'}),{escritorios:1,envios:0,notificacoes:1,falhas:0});
  assert.equal(messages.length,noticeBefore+1);
  assert.match(messages.at(-1),/representante@example.test/);
  assert.match(messages.at(-1),/https:\/\/app.example.test\/acesso/);
  assert.doesNotMatch(messages.at(-1),/Content-Disposition: attachment/i);
  assert.deepEqual(await executarCicloFilasPostgres(runtime),{escritorios:0,envios:0,notificacoes:0,falhas:0});
  async function cancelledNotice(change){
    const publication=await notice(),before=messages.length;
    await change(publication);
    await executarCicloFilasPostgres(runtime);
    assert.equal(messages.length,before);
    assert.equal((await setup.query('SELECT estado FROM notificacoes_publicacoes WHERE publicacao_id=$1',[publication])).rows[0].estado,'cancelado');
  }
  await cancelledNotice(id=>setup.query("UPDATE publicacoes_documentos SET estado='revogada',revogada_em=now() WHERE id=$1",[id]));
  await cancelledNotice(()=>setup.query("UPDATE usuarios SET email='alterado@example.test' WHERE id=$1",[user]));
  await setup.query("UPDATE usuarios SET email='representante@example.test' WHERE id=$1",[user]);
  await cancelledNotice(()=>setup.query('UPDATE usuarios_clientes SET ativo=false WHERE usuario_id=$1',[user]));
  await setup.query('UPDATE usuarios_clientes SET ativo=true WHERE usuario_id=$1',[user]);
  const ambiguousNotice=await notice();disconnectAfterData=true;
  assert.deepEqual(await executarCicloFilasPostgres(runtime),{escritorios:1,envios:0,notificacoes:0,falhas:1});
  assert.equal((await setup.query('SELECT estado FROM notificacoes_publicacoes WHERE publicacao_id=$1',[ambiguousNotice])).rows[0].estado,'incerto');
  disconnectAfterData=false;
  assert.deepEqual(await executarCicloFilasPostgres(runtime),{escritorios:0,envios:0,notificacoes:0,falhas:0});
  const auditContact=(await setup.query("INSERT INTO contatos(escritorio_id,nome,email) VALUES($1,'Auditoria preparo','audit-preparo@example.test') RETURNING id",[office])).rows[0].id;
  await setup.query('INSERT INTO clientes_contatos(escritorio_id,cliente_id,contato_id) VALUES($1,$2,$3)',[office,customer,auditContact]);
  await setup.query("INSERT INTO usuarios_escritorios(usuario_id,escritorio_id,papel) VALUES($1,$2,'operador')",[user,office]);
  await setup.query(`CREATE FUNCTION rejeitar_fim_preparo_teste() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.acao='ENVIO_PREPARACAO_CONCLUIDA' THEN RAISE EXCEPTION 'Falha de auditoria no ensaio'; END IF; RETURN NEW; END; $$`);
  await setup.query('CREATE TRIGGER rejeitar_fim_preparo_teste BEFORE INSERT ON auditoria_seguranca FOR EACH ROW EXECUTE FUNCTION rejeitar_fim_preparo_teste()');
  const originOptions={origem:{tipo:'usuario',usuario_id:user},evento:{ip:'127.0.0.1',request_id:'ensaio-preparo-humano'}};
  assert.deepEqual(await prepararEnviosPostgres(runtime,office,customer,{contato_id:auditContact,numero_registro:number},originOptions),{preparados:0,bloqueados:1});
  const failedPreparation=(await setup.query('SELECT id,status,snapshot_json FROM envios_clientes WHERE contato_id=$1',[auditContact])).rows[0];
  assert.equal(failedPreparation.status,'falhou');assert.equal(failedPreparation.snapshot_json,null);
  await setup.query('DROP TRIGGER rejeitar_fim_preparo_teste ON auditoria_seguranca');
  assert.deepEqual(await prepararEnviosPostgres(runtime,office,customer,{contato_id:auditContact,numero_registro:number},originOptions),{preparados:1,bloqueados:0});
  const finalPreparation=(await setup.query('SELECT status,snapshot_json FROM envios_clientes WHERE contato_id=$1',[auditContact])).rows[0];
  assert.equal(finalPreparation.status,'revisao');assert.deepEqual(finalPreparation.snapshot_json.preparacao,{tipo:'usuario',usuario_id:user});
  const humanAudit=(await setup.query("SELECT ator_id,ip FROM auditoria_seguranca WHERE acao='ENVIO_PREPARACAO_CONCLUIDA' AND detalhes_json->>'envio_id'=$1",[String(failedPreparation.id)])).rows;
  assert.equal(humanAudit.length,1);assert.equal(humanAudit[0].ator_id,user);assert.equal(humanAudit[0].ip,'127.0.0.1');
  console.log('OK: PDF/aprovação/SMTP TLS, RLS, alterações bloqueadas, concorrência sem duplicação, SMTP ambíguo, recuperação sem reenvio e preparo auditado de sistema/usuário com rollback.');
}finally{
  for(const socket of sockets)socket.destroy();if(smtp.listening)await new Promise(resolve=>smtp.close(resolve));
  await secondRuntime?.end();await runtime?.end();await setup?.end();
  try{
    if(created){
      // Pool.end may resolve before the server processes all socket closures.
      for(let attempt=0;attempt<40;attempt++){
        const active=(await admin.query('SELECT count(*)::integer total FROM pg_stat_activity WHERE datname=$1',[database])).rows[0].total;
        if(!active)break;
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      await admin.query(`DROP DATABASE "${database}"`);
    }
  }finally{await admin.end();}
  if(directory)rmSync(directory,{recursive:true,force:true});
}
}

