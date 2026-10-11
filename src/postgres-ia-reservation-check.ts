import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {reservarAnalisePostgres,falharAnalisePostgres} from './postgres-ia-reservation.js';
import {withPostgresOfficeTransaction,withPostgresGlobalTransaction} from './postgres-transaction.js';
/** Called only inside the disposable monitoring rehearsal, with synthetic records. */
export async function conferirReservasIaPostgres(runtime:Pool,admin:Pool,office:number){
  const database=(await admin.query('SELECT current_database() AS nome')).rows[0].nome;
  if(!/^mediador_monitor_test_[a-f0-9]{32}$/.test(database)||(await runtime.query('SELECT current_database() AS nome')).rows[0].nome!==database)
    throw new Error('Ensaio IA exige pools do mesmo banco descartável.');
  const role=(await runtime.query('SELECT current_user AS nome')).rows[0].nome as string;
  if(!/^[a-z][a-z0-9_]{2,62}$/.test(role))throw new Error('Papel runtime inválido.');
  await admin.query(`GRANT SELECT,INSERT,UPDATE ON tentativas_analise TO "${role}"`);
  await admin.query(`GRANT USAGE,SELECT ON SEQUENCE tentativas_analise_id_seq TO "${role}"`);
  const number='DF999994/2026',other='DF999993/2026',old={topicos:{},preservado:true};
  await admin.query(`INSERT INTO registros(numero_registro,watch,tipo,arquivo_path,arquivo_hash,analise_status,extracao_json,analise_concluida_em)
    VALUES($1,'Catálogo público','Convenção Coletiva','sintetico.pdf',$2,'analisado',$3::jsonb,'2026-01-01')`,[number,'a'.repeat(64),JSON.stringify(old)]);
  const concurrent=await Promise.allSettled([reservarAnalisePostgres(runtime,number),reservarAnalisePostgres(runtime,number)]);
  assert.equal(concurrent.filter(item=>item.status==='fulfilled').length,1);
  assert.equal(concurrent.filter(item=>item.status==='rejected').length,1);
  const reservation=(concurrent.find(item=>item.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof reservarAnalisePostgres>>>).value!;
  assert.equal(reservation.config.versao,1);
  const row=async()=> (await admin.query('SELECT * FROM registros WHERE numero_registro=$1',[number])).rows[0];
  assert.deepEqual((await row()).extracao_json,old);assert.equal((await row()).analise_status,'analisando');
  const persisted=(await admin.query('SELECT * FROM tentativas_analise WHERE id=$1',[reservation.id])).rows[0];
  assert.equal(JSON.stringify(persisted).includes(reservation.config.api_key),false);
  assert.equal((await runtime.query('SELECT * FROM tentativas_analise')).rowCount,0);
  assert.equal(await withPostgresOfficeTransaction(runtime,office,async client=>(await client.query('SELECT * FROM tentativas_analise')).rowCount),0);
  await assert.rejects(()=>falharAnalisePostgres(runtime,reservation.id,randomUUID(),'resposta_invalida'));
  // Audit failure must roll back both finalization and record restoration.
  await admin.query(`REVOKE INSERT ON auditoria_seguranca FROM "${role}"`);
  try{await assert.rejects(()=>falharAnalisePostgres(runtime,reservation.id,reservation.token,'resposta_invalida'));}
  finally{await admin.query(`GRANT INSERT ON auditoria_seguranca TO "${role}"`);}
  assert.equal((await row()).analise_status,'analisando');
  await falharAnalisePostgres(runtime,reservation.id,reservation.token,'resposta_invalida');
  const restored=await row();assert.equal(restored.analise_status,'analisado');assert.deepEqual(restored.extracao_json,old);
  assert.equal(restored.analise_concluida_em.toISOString(),'2026-01-01T00:00:00.000Z');
  await assert.rejects(()=>falharAnalisePostgres(runtime,reservation.id,reservation.token,'resposta_invalida'));
  await assert.rejects(()=>admin.query("UPDATE tentativas_analise SET motivo='alterado' WHERE id=$1",[reservation.id]));
  await assert.rejects(()=>admin.query('DELETE FROM tentativas_analise WHERE id=$1',[reservation.id]));
  const next=(await reservarAnalisePostgres(runtime,number))!;assert.notEqual(next.token,reservation.token);
  await falharAnalisePostgres(runtime,next.id,next.token,'execucao_interrompida');
  await admin.query(`INSERT INTO registros(numero_registro,watch,arquivo_path,arquivo_hash) VALUES($1,'Catálogo público','sintetico.pdf',$2)`,[other,'b'.repeat(64)]);
  await admin.query(`REVOKE INSERT ON auditoria_seguranca FROM "${role}"`);
  try{await assert.rejects(()=>reservarAnalisePostgres(runtime,other));}
  finally{await admin.query(`GRANT INSERT ON auditoria_seguranca TO "${role}"`);}
  assert.equal((await admin.query('SELECT analise_status FROM registros WHERE numero_registro=$1',[other])).rows[0].analise_status,'sem_analise');
  assert.equal((await admin.query('SELECT * FROM tentativas_analise WHERE numero_registro=$1',[other])).rowCount,0);
  await withPostgresGlobalTransaction(runtime,async client=>{
    const audit=(await client.query("SELECT detalhes_json FROM auditoria_seguranca WHERE acao LIKE 'IA_EXTRACAO_%'")).rows;
    assert.equal(audit.length,4);assert.equal(JSON.stringify(audit).includes(reservation.token),false);assert.equal(JSON.stringify(audit).includes(reservation.config.api_key),false);
  });
  console.log('Reservas IA: concorrência única, RLS global, token, histórico imutável, preservação da análise anterior e rollback de auditoria validados.');
}

