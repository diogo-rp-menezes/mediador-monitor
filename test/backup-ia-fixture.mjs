import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {withPostgresGlobalTransaction as global} from '../dist/postgres-transaction.js';
import {salvarIaPostgres,obterIaPostgres} from '../dist/postgres-ia-settings.js';
import {solicitarAnalisePostgres} from '../dist/postgres-ia-requests.js';
import {executarSolicitacaoIaPostgres} from '../dist/postgres-ia-worker.js';
import {reservarAnalisePostgres,falharAnalisePostgres} from '../dist/postgres-ia-reservation.js';
import {recuperarAnalisePostgres,recuperarSolicitacaoIaPostgres} from '../dist/postgres-ia-recovery.js';
import {CAMPOS_CCT,NAO_CONSTA_CCT} from '../dist/cct-template.js';

/** Controlled real HTTP provider; no external model calls or operational data. */
export async function prepararIaBackup(pool,directory,actor){
  assert.match((await pool.query('SELECT current_database() nome')).rows[0].nome,/^mediador_backup_test_[a-f0-9]{32}$/);
  let hits=0;const raw={campos:Object.fromEntries(CAMPOS_CCT.map(field=>[field.id,NAO_CONSTA_CCT]))};
  const provider=createServer((req,res)=>{void(async()=>{
    let body='';for await(const chunk of req)body+=chunk;
    assert.equal(req.url,'/chat/completions');assert.equal(req.headers.authorization,'Bearer segredo-ia-sintetico');assert.equal(JSON.parse(body).model,'modelo-ensaio');
    hits++;res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(raw)}}]}));
  })().catch(()=>{res.statusCode=500;res.end('{}');});});
  provider.listen(0,'127.0.0.1');await once(provider,'listening');
  const close=async()=>{provider.closeAllConnections();await new Promise(resolve=>provider.close(resolve));};
  try{
    await global(pool,tx=>salvarIaPostgres(tx,{ativo:true,base_url:`http://127.0.0.1:${provider.address().port}`,modelo:'modelo-ensaio',api_key:'segredo-ia-sintetico',versao:0}));
    const numbers=['DF900001/2026','DF900002/2026','DF900003/2026','DF900004/2026'],files=[];
    for(let i=0;i<numbers.length;i++){
      const bytes=Buffer.from(`<html><head><meta charset="utf-8"></head><body>NÚMERO DE REGISTRO NO MTE: ${numbers[i]}<br>Convenção de ensaio</body></html>`),path=join(directory,`ia-${i}.pdf`);
      await writeFile(path,bytes);files.push(path);
      await pool.query("INSERT INTO registros(numero_registro,watch,tipo,vigencia,arquivo_path,arquivo_hash) VALUES($1,'teste','Convenção Coletiva de Trabalho','',$2,$3)",[numbers[i],path,createHash('sha256').update(bytes).digest('hex')]);
    }
    const request=number=>global(pool,tx=>solicitarAnalisePostgres(tx,actor,{numero_registro:number}));
    await request(numbers[0]);assert.equal((await executarSolicitacaoIaPostgres(pool)).status,'concluida');assert.equal(hits,1);
    const completed=(await pool.query('SELECT extracao_json FROM registros WHERE numero_registro=$1',[numbers[0]])).rows[0].extracao_json;
    const pending=await request(numbers[1]);const active=await reservarAnalisePostgres(pool,numbers[2]);assert.ok(active);
    const orphan=await request(numbers[3]);await pool.query("UPDATE solicitacoes_analise SET status='executando',reserva_token=$2 WHERE id=$1",[orphan.id,randomUUID()]);
    const attempts=(await pool.query('SELECT id,numero_registro,status,extracao_json FROM tentativas_analise ORDER BY id')).rows;
    return {files,close,async validar(target,runtime){
      const restored=(await target.query('SELECT current_database() nome')).rows[0].nome;
      assert.match(restored,/^mediador_import_test_[a-f0-9]{32}$/);assert.equal((await runtime.query('SELECT current_database() nome')).rows[0].nome,restored);
      for(const number of numbers){const row=(await target.query('SELECT arquivo_path FROM registros WHERE numero_registro=$1',[number])).rows[0];assert.ok((await readFile(row.arquivo_path)).length>0);}
      assert.deepEqual((await target.query('SELECT id,numero_registro,status,extracao_json FROM tentativas_analise ORDER BY id')).rows,attempts);
      const key=process.env.CREDENTIALS_MASTER_KEY;
      try{process.env.CREDENTIALS_MASTER_KEY=Buffer.alloc(32,9).toString('base64');await assert.rejects(global(runtime,obterIaPostgres),{status:503});}
      finally{process.env.CREDENTIALS_MASTER_KEY=key;}
      const view=await global(runtime,obterIaPostgres);assert.equal(view.tem_chave,true);assert.equal(view.modelo,'modelo-ensaio');assert.equal('api_key'in view,false);
      const done=await executarSolicitacaoIaPostgres(runtime);assert.equal(done.solicitacao_id,pending.id);assert.equal(done.status,'concluida');assert.equal(hits,2);
      assert.deepEqual(await executarSolicitacaoIaPostgres(runtime),{reservada:false});assert.equal(hits,2);
      assert.deepEqual((await target.query('SELECT extracao_json FROM registros WHERE numero_registro=$1',[numbers[0]])).rows[0].extracao_json,completed);
      assert.equal((await target.query('SELECT analise_status FROM registros WHERE numero_registro=$1',[numbers[2]])).rows[0].analise_status,'analisando');
      const audit=(tx,details)=>tx.query(`INSERT INTO auditoria_seguranca(ator_id,acao,criado_em,ip,user_agent,request_id,detalhes_json)
        VALUES($1,'ENSAIO_RECUPERACAO_IA',$2,'127.0.0.1','teste',$3,$4::jsonb)`,[actor,Date.now(),randomUUID(),JSON.stringify(details)]);
      const recovery={justificativa:'Consumidores do banco de origem encerrados antes da recuperação',consumidor_encerrado:true};
      assert.equal((await recuperarAnalisePostgres(runtime,Number(active.id),recovery,audit)).status,'falhou');
      assert.equal((await recuperarSolicitacaoIaPostgres(runtime,Number(orphan.id),recovery,audit)).status,'falhou');
      assert.equal((await target.query('SELECT reserva_token FROM tentativas_analise WHERE id=$1',[active.id])).rows[0].reserva_token,null);
      await assert.rejects(falharAnalisePostgres(runtime,Number(active.id),active.token,'execucao_interrompida'));
      assert.equal((await target.query('SELECT analise_status FROM registros WHERE numero_registro=$1',[numbers[2]])).rows[0].analise_status,'sem_analise');
      assert.equal((await target.query('SELECT reserva_token FROM solicitacoes_analise WHERE id=$1',[orphan.id])).rows[0].reserva_token,null);
      assert.deepEqual(await executarSolicitacaoIaPostgres(runtime),{reservada:false});assert.equal(hits,2);
      assert.equal(Number((await target.query("SELECT count(*) n FROM auditoria_seguranca WHERE acao='ENSAIO_RECUPERACAO_IA'")).rows[0].n),2);
    }};
  }catch(error){await close();throw error;}
}
