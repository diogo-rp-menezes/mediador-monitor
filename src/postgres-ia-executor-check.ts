import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {hashBytes} from './relatorio-core.js';
import {CAMPOS_CCT,NAO_CONSTA_CCT} from './cct-template.js';
import {executarAnalisePostgres} from './postgres-ia-executor.js';
import {reservarAnalisePostgres,concluirAnalisePostgres,falharAnalisePostgres} from './postgres-ia-reservation.js';
import {obterIaPostgres,salvarIaPostgres} from './postgres-ia-settings.js';
import {withPostgresGlobalTransaction} from './postgres-transaction.js';
import {recuperarAnalisePostgres,listarTentativasIaPostgres,recuperarSolicitacaoIaPostgres} from './postgres-ia-recovery.js';
import {comExclusividadeIaPostgres} from './postgres-ia-lock.js';
import {solicitarAnalisePostgres} from './postgres-ia-requests.js';
import {executarSolicitacaoIaPostgres,IA_QUEUE_LOCK} from './postgres-ia-worker.js';
export async function conferirExecutorIaPostgres(runtime:Pool,admin:Pool){
  const database=(await admin.query('SELECT current_database() nome')).rows[0].nome;
  if(!/^mediador_monitor_test_[a-f0-9]{32}$/.test(database)||(await runtime.query('SELECT current_database() nome')).rows[0].nome!==database)throw new Error('Executor IA exige banco descartável.');
  const role=(await runtime.query('SELECT current_user nome')).rows[0].nome as string;
  if(!/^[a-z][a-z0-9_]{2,62}$/.test(role))throw new Error('Papel runtime inválido.');
  await admin.query(`GRANT SELECT,INSERT,UPDATE ON solicitacoes_analise TO "${role}"`);
  await admin.query(`GRANT USAGE,SELECT ON SEQUENCE solicitacoes_analise_id_seq TO "${role}"`);
  const number='DF999980/2026',dir=mkdtempSync(join('data','ia-executor-test-')),path=join(dir,'original.doc');
  const text=`CONVENÇÃO COLETIVA\nNÚMERO DE REGISTRO NO MTE: ${number}\nCláusula 1: Regra adicional`;
  const bytes=Buffer.from(`<html><head><meta charset="utf-8"></head><body>${text.replaceAll('\n','<br>')}</body></html>`);
  writeFileSync(path,bytes);let calls=0,invalid=false;
  const raw={campos:Object.fromEntries(CAMPOS_CCT.map(field=>[field.id,NAO_CONSTA_CCT]))};
  let responseRaw:unknown=raw;
  const server=createServer(async(req,res)=>{calls++;let body='';for await(const chunk of req)body+=chunk;
    assert.equal(JSON.parse(body).model,'modelo-local');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(invalid?{campos:{}}:responseRaw)}}]}));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const config=await withPostgresGlobalTransaction(runtime,client=>obterIaPostgres(client));
    await withPostgresGlobalTransaction(runtime,client=>salvarIaPostgres(client,{ativo:true,base_url:`http://127.0.0.1:${(server.address() as {port:number}).port}`,modelo:'modelo-local',versao:config.versao}));
    await admin.query(`INSERT INTO registros(numero_registro,watch,tipo,arquivo_path,arquivo_hash) VALUES($1,'Catálogo público','Convenção Coletiva',$2,$3)`,[number,path,hashBytes(bytes)]);
    const result=await executarAnalisePostgres(runtime,number);assert.equal(result.status,'concluida');assert.equal(calls,1);
    const doc=async()=> (await admin.query('SELECT * FROM registros WHERE numero_registro=$1',[number])).rows[0];
    const old=await doc();assert.equal(old.analise_status,'analisado');assert.equal(old.extracao_json.padrao.campos[CAMPOS_CCT[0].id],NAO_CONSTA_CCT);
    const history=(await admin.query('SELECT * FROM tentativas_analise WHERE numero_registro=$1',[number])).rows[0];assert.deepEqual(history.extracao_json,old.extracao_json);assert.equal(history.reserva_token,null);
    invalid=true;const failed=await executarAnalisePostgres(runtime,number);assert.equal(failed.status,'falhou');assert.deepEqual((await doc()).extracao_json,old.extracao_json);assert.equal((await doc()).analise_concluida_em.toISOString(),old.analise_concluida_em.toISOString());
    const reservation=(await reservarAnalisePostgres(runtime,number))!;
    await assert.rejects(()=>concluirAnalisePostgres(runtime,reservation.id,randomUUID(),raw,text));
    await admin.query(`REVOKE INSERT ON auditoria_seguranca FROM "${role}"`);
    try{await assert.rejects(()=>concluirAnalisePostgres(runtime,reservation.id,reservation.token,raw,text));}
    finally{await admin.query(`GRANT INSERT ON auditoria_seguranca TO "${role}"`);}
    assert.equal((await doc()).analise_status,'analisando');assert.deepEqual((await doc()).extracao_json,old.extracao_json);
    await concluirAnalisePostgres(runtime,reservation.id,reservation.token,raw,text);
    await assert.rejects(()=>concluirAnalisePostgres(runtime,reservation.id,reservation.token,raw,text));
    const changed=(await reservarAnalisePostgres(runtime,number))!;writeFileSync(path,Buffer.from('alterado'));
    await assert.rejects(()=>concluirAnalisePostgres(runtime,changed.id,changed.token,raw,text));writeFileSync(path,bytes);
    await falharAnalisePostgres(runtime,changed.id,changed.token,'original_invalido');
    // Cancellation cannot finish a reservation until the running generator settles.
    let ready!:()=>void,release!:()=>void;const started=new Promise<void>(resolve=>{ready=resolve;}),hold=new Promise<void>(resolve=>{release=resolve;});
    const control=new AbortController();
    const running=executarAnalisePostgres(runtime,number,{signal:control.signal,gerar:async()=>{ready();await hold;return raw;}});
    await started;
    const active=(await admin.query("SELECT id FROM tentativas_analise WHERE numero_registro=$1 AND status='executando'",[number])).rows[0].id;
    await assert.rejects(()=>recuperarAnalisePostgres(runtime,active,{justificativa:'Consumidor supostamente encerrado',consumidor_encerrado:true},async()=>{throw new Error('Não deve auditar bloqueio ocupado.');}),/exclusividade/);
    control.abort();assert.equal((await doc()).analise_status,'analisando');await assert.rejects(()=>reservarAnalisePostgres(runtime,number));release();assert.equal((await running).status,'falhou');
    writeFileSync(path,Buffer.from('corrompido'));const before=calls;assert.equal((await executarAnalisePostgres(runtime,number)).status,'falhou');assert.equal(calls,before);
    writeFileSync(path,bytes);invalid=false;
    responseRaw={alteracoes:[{campo:CAMPOS_CCT[0].id,acao:'revisar',valor:'Regra adicional',clausula:'Cláusula 1',citacao:'Regra adicional'}]};
    await admin.query("UPDATE registros SET tipo='Termo Aditivo de Convenção Coletiva' WHERE numero_registro=$1",[number]);
    assert.equal((await executarAnalisePostgres(runtime,number)).status,'concluida');assert.equal((await doc()).extracao_json.aditivo.alteracoes.length,1);
    const interrupted=(await reservarAnalisePostgres(runtime,number))!;
    const recovery={justificativa:'Processo de extração encerrado e conferido',consumidor_encerrado:true};
    await assert.rejects(()=>recuperarAnalisePostgres(runtime,interrupted.id,recovery,async()=>{throw new Error('Falha de auditoria simulada.');}));
    assert.equal((await doc()).analise_status,'analisando');
    assert.equal((await admin.query('SELECT reserva_token FROM tentativas_analise WHERE id=$1',[interrupted.id])).rows[0].reserva_token,interrupted.token);
    const previous=(await doc()).extracao_json;
    await recuperarAnalisePostgres(runtime,interrupted.id,recovery,async(client,details)=>{
      const actor=(await admin.query('SELECT id FROM usuarios ORDER BY id LIMIT 1')).rows[0].id;
      await client.query("INSERT INTO auditoria_seguranca(ator_id,acao,criado_em,ip,user_agent,request_id,detalhes_json) VALUES($1,'IA_EXTRACAO_RECUPERADA',$2,'','ensaio-local','ensaio-ia',$3::jsonb)",[actor,Date.now(),JSON.stringify(details)]);
    });
    assert.equal((await doc()).analise_status,'analisado');assert.deepEqual((await doc()).extracao_json,previous);
    await assert.rejects(()=>falharAnalisePostgres(runtime,interrupted.id,interrupted.token,'execucao_interrompida'));
    await assert.rejects(()=>recuperarAnalisePostgres(runtime,interrupted.id,recovery,async()=>{}));
    const list=await withPostgresGlobalTransaction(runtime,client=>listarTentativasIaPostgres(client));
    assert.equal(JSON.stringify(list).includes(interrupted.token),false);assert.equal(JSON.stringify(list).includes('arquivo_path'),false);assert.equal(JSON.stringify(list).includes('extracao_json'),false);
    const next=(await reservarAnalisePostgres(runtime,number))!;await falharAnalisePostgres(runtime,next.id,next.token,'execucao_interrompida');
    const actor=(await admin.query('SELECT id FROM usuarios ORDER BY id LIMIT 1')).rows[0].id;
    const request=(confirm=false)=>withPostgresGlobalTransaction(runtime,client=>solicitarAnalisePostgres(client,actor,{numero_registro:number,confirmar_reanalise:confirm}));
    await assert.rejects(()=>request());
    const requests=await Promise.allSettled([request(true),request(true)]);assert.equal(requests.filter(result=>result.status==='fulfilled').length,1);assert.equal(requests.filter(result=>result.status==='rejected').length,1);
    assert.equal((await runtime.query('SELECT * FROM solicitacoes_analise')).rowCount,0);
    const consumed=await executarSolicitacaoIaPostgres(runtime);assert.equal(consumed.reservada,true);assert.equal('status' in consumed?consumed.status:null,'concluida');
    const job=(await admin.query('SELECT * FROM solicitacoes_analise WHERE numero_registro=$1',[number])).rows[0];assert.equal(job.status,'concluida');assert.equal(job.reserva_token,null);assert.ok(job.tentativa_id);
    assert.equal((await executarSolicitacaoIaPostgres(runtime)).reservada,false);
    const orphan=(await request(true)).id;
    await admin.query("UPDATE solicitacoes_analise SET status='executando',reserva_token=$2 WHERE id=$1",[orphan,randomUUID()]);
    await comExclusividadeIaPostgres(runtime,IA_QUEUE_LOCK,async()=>{
      await assert.rejects(()=>recuperarSolicitacaoIaPostgres(runtime,orphan,recovery,async()=>{}),/exclusividade/);
    });
    await assert.rejects(()=>recuperarSolicitacaoIaPostgres(runtime,orphan,recovery,async()=>{throw new Error('audit');}));
    assert.equal((await admin.query('SELECT status FROM solicitacoes_analise WHERE id=$1',[orphan])).rows[0].status,'executando');
    const docBefore=await doc();
    await recuperarSolicitacaoIaPostgres(runtime,orphan,recovery,async(client,details)=>{
      await client.query("INSERT INTO auditoria_seguranca(ator_id,acao,criado_em,ip,user_agent,request_id,detalhes_json) VALUES($1,'IA_SOLICITACAO_RECUPERADA',$2,'','ensaio-local','ensaio-ia',$3::jsonb)",[actor,Date.now(),JSON.stringify(details)]);
    });
    const orphanDone=(await admin.query('SELECT * FROM solicitacoes_analise WHERE id=$1',[orphan])).rows[0];assert.equal(orphanDone.status,'falhou');assert.equal(orphanDone.reserva_token,null);
    assert.deepEqual(await doc(),docBefore);
    await assert.rejects(()=>recuperarSolicitacaoIaPostgres(runtime,orphan,recovery,async()=>{}));
    await assert.rejects(()=>recuperarSolicitacaoIaPostgres(runtime,job.id,recovery,async()=>{}));
    await request(true);assert.equal((await executarSolicitacaoIaPostgres(runtime)).reservada,true);
    console.log('Solicitação órfã: consumidor ativo recusado, rollback de auditoria, token removido, documento preservado e novo ciclo validados.');
    console.log('Fila IA: confirmação de reanálise, solicitação concorrente única, RLS e consumo/conclusão vinculados validados.');
    console.log('Recuperação IA: executor vivo recusado, auditoria atômica, JSON preservado, token invalidado, repetição recusada e novo ciclo permitidos.');
    console.log('Executor IA: CCT/aditivo com HTML real e provedor HTTP local, conclusão/histórico, JSON inválido, token, auditoria, hash alterado e interrupção cooperativa validados.');
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));unlinkSync(path);rmdirSync(dir);}
}


