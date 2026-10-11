import assert from 'node:assert/strict';
import {resolverContextoPostgres} from '../dist/postgres-autorizacao.js';
import {withPostgresOfficeTransaction} from '../dist/postgres-transaction.js';
import {resumoEscritorioPostgres} from '../dist/postgres-office-summary.js';

/** Synthetic pilot: no external providers, only the restored disposable database. */
export async function validarConcorrenciaContextos(target,runtime,identity,office,other,session){
  assert.match((await target.query('SELECT current_database() nome')).rows[0].nome,/^mediador_import_test_[a-f0-9]{32}$/);
  await target.query(`INSERT INTO usuarios_escritorios(usuario_id,escritorio_id,papel)
    VALUES($1,$2,'operador'),($1,$3,'operador')`,[identity.usuario_id,office,other]);
  try{
    const before=(await target.query('SELECT id,escritorio_id,razao_social FROM clientes WHERE escritorio_id=ANY($1::bigint[]) ORDER BY id',[[office,other]])).rows;
    for(const id of [office,other]){
      const summary=await resumoEscritorioPostgres(runtime,id);
      assert.equal(summary.clientes_ativos,before.filter(row=>row.escritorio_id===id).length);
      assert.equal(summary.monitoramentos_ativos,Number((await target.query('SELECT count(*) n FROM monitoramentos_escritorios WHERE escritorio_id=$1 AND ativo=true',[id])).rows[0].n));
      assert.equal(summary.envios_revisao,Number((await target.query("SELECT count(*) n FROM envios_clientes WHERE escritorio_id=$1 AND status='revisao'",[id])).rows[0].n));
      assert.equal(summary.envios_fila,Number((await target.query("SELECT count(*) n FROM envios_clientes WHERE escritorio_id=$1 AND status='na_fila'",[id])).rows[0].n));
      assert.equal(summary.envios_atencao,Number((await target.query("SELECT count(*) n FROM envios_clientes WHERE escritorio_id=$1 AND status IN ('falhou','incerto','bloqueado')",[id])).rows[0].n));
    }
    let reads=0,rollbacks=0;const latencies=[],started=performance.now();
    const tasks=Array.from({length:12},(_,worker)=>(async()=>{
      for(let round=0;round<10;round++){
        const roundStarted=performance.now();
        const id=(worker+round)%2?office:other;
        const context=await resolverContextoPostgres(runtime,identity,{tipo:'escritorio',id});
        assert.equal(context.escritorio_id,id);
        if(round%2===0){
          const own=before.find(row=>row.escritorio_id===id);assert.ok(own);
          await assert.rejects(withPostgresOfficeTransaction(runtime,id,async client=>{
            assert.equal((await client.query("UPDATE clientes SET razao_social='Alteração que deve reverter' WHERE id=$1 RETURNING id",[own.id])).rowCount,1);
            if(round%4===0)await client.query('SELECT 1/0');
            else throw new Error('Falha controlada após atualização');
          }),error=>round%4===0?error.code==='22012':error.message==='Falha controlada após atualização');
          rollbacks++;
        }
        await withPostgresOfficeTransaction(runtime,id,async client=>{
          const rows=(await client.query('SELECT id,escritorio_id,razao_social FROM clientes ORDER BY id')).rows;
          assert.deepEqual(rows,before.filter(row=>row.escritorio_id===id));
          const foreign=before.find(row=>row.escritorio_id!==id);assert.ok(foreign);
          assert.equal((await client.query('SELECT id FROM clientes WHERE id=$1',[foreign.id])).rowCount,0);
          assert.equal((await client.query("UPDATE clientes SET razao_social='Acesso cruzado' WHERE id=$1 RETURNING id",[foreign.id])).rowCount,0);
        });reads++;latencies.push(performance.now()-roundStarted);
      }
    })());
    const settled=await Promise.allSettled(tasks);
    const failed=settled.find(result=>result.status==='rejected');if(failed)throw failed.reason;
    const duration=performance.now()-started;
    assert.equal(reads,120);
    assert.equal(rollbacks,60);
    assert.equal((await runtime.query('SELECT id FROM clientes')).rowCount,0);
    // Drain all pool connections simultaneously and check scope cleanup on each reused session.
    const clients=[];
    try{
      for(let i=0;i<runtime.options.max;i++)clients.push(await runtime.connect());
      for(const client of clients){
        const scope=(await client.query("SELECT current_setting('app.global_access',true) global_scope,current_setting('app.escritorio_id',true) office_scope")).rows[0];
        assert.ok(scope.global_scope===null||scope.global_scope==='');assert.ok(scope.office_scope===null||scope.office_scope==='');
        assert.equal((await client.query('SELECT id FROM clientes')).rowCount,0);
      }
    }finally{for(const client of clients)client.release();}
    await target.query('UPDATE usuarios_escritorios SET ativo=false WHERE usuario_id=$1 AND escritorio_id=$2',[identity.usuario_id,office]);
    await assert.rejects(resolverContextoPostgres(runtime,identity,{tipo:'escritorio',id:office}),{status:403});
    assert.equal((await resolverContextoPostgres(runtime,identity,{tipo:'escritorio',id:other})).escritorio_id,other);
    await target.query('UPDATE usuarios_escritorios SET ativo=true WHERE usuario_id=$1 AND escritorio_id=$2',[identity.usuario_id,office]);
    const logoutBefore=Number((await target.query("SELECT count(*) n FROM auditoria_seguranca WHERE ator_id=$1 AND acao='LOGOUT'",[identity.usuario_id])).rows[0].n);
    await session.auth.logout(session.token,{ip:'127.0.0.1',request_id:'adversarial-logout'});
    // Reuse the identity captured before logout: authorization must recheck its session.
    const rejected=await Promise.allSettled(Array.from({length:12},(_,i)=>
      resolverContextoPostgres(runtime,identity,{tipo:'escritorio',id:i%2?office:other})));
    for(const result of rejected){assert.equal(result.status,'rejected');assert.equal(result.reason.status,401);}
    await assert.rejects(session.auth.exigirSessao(session.token),{status:401});
    await assert.rejects(session.auth.logout(session.token),{status:401});
    assert.equal(Number((await target.query("SELECT count(*) n FROM auditoria_seguranca WHERE ator_id=$1 AND acao='LOGOUT'",[identity.usuario_id])).rows[0].n),logoutBefore+1);
    assert.equal((await session.auth.exigirSessao(session.otherToken)).usuario_id,identity.usuario_id);
    assert.deepEqual((await target.query('SELECT id,escritorio_id,razao_social FROM clientes WHERE escritorio_id=ANY($1::bigint[]) ORDER BY id',[[office,other]])).rows,before);
    latencies.sort((a,b)=>a-b);
    const rounded=value=>Math.round(value*100)/100;
    const percentile=p=>rounded(latencies[Math.ceil(latencies.length*p)-1]);
    return {formato:'ensaio-concorrencia-contextos-v1',validado:true,sintetico:true,
      rotinas:12,pool_conexoes:runtime.options.max,rodadas:reads,rollbacks,
      tentativas_leitura_cruzada_recusadas:reads,tentativas_escrita_cruzada_recusadas:reads,
      contextos_recusados_apos_logout:rejected.length,duracao_carga_ms:rounded(duration),
      rodadas_por_segundo:rounded(reads*1000/duration),
      latencia_rodada_ms:{min:rounded(latencies[0]),p50:percentile(.5),p95:percentile(.95),max:rounded(latencies.at(-1))}};
  }finally{
    await target.query('DELETE FROM usuarios_escritorios WHERE usuario_id=$1 AND escritorio_id=ANY($2::bigint[])',[identity.usuario_id,[office,other]]);
  }
}
