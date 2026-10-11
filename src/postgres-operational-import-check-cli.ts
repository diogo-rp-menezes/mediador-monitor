import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync,unlinkSync,readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {criarPoolPostgres} from './postgres.js';
import {backupPostgresConfig,comBackupRestauradoIsolado} from './postgres-backup.js';
import {conferirArquivosPacoteMigracao} from './postgres-migration-package.js';
import {assinarManifestoMigracao} from './postgres-migration-manifest.js';
import {importarPacoteOperacionalPostgres} from './postgres-operational-import.js';
import {importarNucleoIsoladoPostgres} from './postgres-import-core.js';
import {withPostgresGlobalTransaction} from './postgres-transaction.js';
import {identificarDestinoImportacao} from './postgres-import-checkpoint.js';
import {compararFilasRecuperacaoPostgres} from './postgres-recovery-queues.js';
import {exportarRelatorioRecuperacao,verificarRelatorioRecuperacao} from './postgres-recovery-report.js';

const args=process.argv.slice(2);
try{
  if(args.length!==2||args[0]!=='--manifest'||!args[1])throw new Error('Informe --manifest <manifesto.json>.');
  const key=Buffer.from(process.env.CREDENTIALS_MASTER_KEY??'','base64');
  const {file,manifest}=conferirArquivosPacoteMigracao(args[1],key);
  const config=backupPostgresConfig();
  await comBackupRestauradoIsolado({...config,backup:manifest.destino.backup,ensaioOperacional:true},async database=>{
    const pool=criarPoolPostgres({...process.env,PGDATABASE:database});
    const path=join(dirname(file),'manifesto-teste-operacional-'+randomUUID()+'.json');
    const reportPath=join(dirname(file),'recuperacao-teste-'+randomUUID()+'.json');
    let created=false,reportCreated=false;
    const trial={...manifest,destino:{...manifest.destino,database}};
    const save=(value:typeof trial,flag:'wx'|'w')=>writeFileSync(path,JSON.stringify({...value,assinatura:assinarManifestoMigracao(value,key)}),{flag});
    try{
      assert.equal(await withPostgresGlobalTransaction(pool,identificarDestinoImportacao),manifest.destino.conteudo_hash);
      await assert.rejects(()=>importarNucleoIsoladoPostgres(pool,manifest.origem.snapshot,{credentialsKey:key,conciliarDestino:true}),/banco isolado/);
      save(trial,'wx');created=true;
      // The original signed package names the current destination, never this disposable database.
      await assert.rejects(()=>importarPacoteOperacionalPostgres(pool,file,key),/Destino não corresponde/);
      const spectator=criarPoolPostgres({...process.env,PGDATABASE:database});
      try{
        await spectator.query('SELECT 1');
        await assert.rejects(()=>importarPacoteOperacionalPostgres(pool,path,key),/Pare outros processos/);
      }finally{await spectator.end();}
      assert.equal(await withPostgresGlobalTransaction(pool,identificarDestinoImportacao),manifest.destino.conteudo_hash);
      const result=await importarPacoteOperacionalPostgres(pool,path,key);
      assert.equal(result.destino_preexistente_preservado,true);
      assert.equal((await importarPacoteOperacionalPostgres(pool,path,key)).checkpoint.retomado,true);
      const beforeRecovery=await withPostgresGlobalTransaction(pool,identificarDestinoImportacao);
      const recovery=await compararFilasRecuperacaoPostgres(pool,path,key);
      assert.equal(recovery.filas_liberadas,false);assert.equal(recovery.conciliacao_concluida,false);
      assert.equal(await withPostgresGlobalTransaction(pool,identificarDestinoImportacao),beforeRecovery);
      await exportarRelatorioRecuperacao(pool,path,reportPath,key);reportCreated=true;
      assert.equal((await verificarRelatorioRecuperacao(pool,reportPath,key)).evidencias_atuais_conferidas,true);
      await assert.rejects(()=>exportarRelatorioRecuperacao(pool,path,reportPath,key),{code:'EEXIST'});
      const originalReport=readFileSync(reportPath,'utf8');
      writeFileSync(reportPath,originalReport.replace('recuperacao-filas-v1','recuperacao-filas-alterado'));
      await assert.rejects(()=>verificarRelatorioRecuperacao(pool,reportPath,key),/Manifesto alterado/);
      writeFileSync(reportPath,originalReport);
      const first=recovery.registros.find(row=>row.tabela==='envios_clientes');
      if(first){
        const old=(await pool.query('SELECT status FROM envios_clientes WHERE id=$1',[first.destino_id])).rows[0].status;
        await pool.query("UPDATE envios_clientes SET status='incerto' WHERE id=$1",[first.destino_id]);
        const uncertain=await compararFilasRecuperacaoPostgres(pool,path,key);
        assert.equal(uncertain.registros.find(row=>row.tabela==='envios_clientes'&&row.origem_id===first.origem_id)?.situacao,'entrega_exige_conferencia');
        await assert.rejects(()=>verificarRelatorioRecuperacao(pool,reportPath,key),/Evidências mudaram/);
        await pool.query('UPDATE envios_clientes SET status=$2 WHERE id=$1',[first.destino_id,old]);
      }
      console.log(`Recuperação: ${recovery.registros.length} registro(s) comparado(s); cenário de envio incerto ${first?'exercitado':'sem envio na origem'}.`);
      save({...trial,gerado_em:trial.gerado_em+'-alterado'},'w');
      await assert.rejects(()=>importarPacoteOperacionalPostgres(pool,path,key),/checkpoint/i);
      save(trial,'w');
      const corrupted={...trial,estado:'alterado'};
      writeFileSync(path,JSON.stringify(corrupted));
      await assert.rejects(()=>importarPacoteOperacionalPostgres(pool,path,key));
      save(trial,'w');
      assert.equal((await importarPacoteOperacionalPostgres(pool,path,key)).checkpoint.retomado,true);
      if(first){
        const envio=(await pool.query('SELECT escritorio_id,versao FROM envios_clientes WHERE id=$1',[first.destino_id])).rows[0];
        // Administrative corruption probe in this disposable database only.
        await pool.query('ALTER TABLE envios_clientes DISABLE TRIGGER envios_propriedade_imutavel');
        try{
          await pool.query("UPDATE envios_clientes SET versao='versao-corrompida-teste' WHERE id=$1",[first.destino_id]);
          const mismatched=await compararFilasRecuperacaoPostgres(pool,path,key);
          assert.equal(mismatched.registros.find(row=>row.tabela==='envios_clientes'&&row.origem_id===first.origem_id)?.situacao,'identidade_documento_divergente');
          await pool.query('UPDATE envios_clientes SET versao=$2 WHERE id=$1',[first.destino_id,envio.versao]);
        }finally{await pool.query('ALTER TABLE envios_clientes ENABLE TRIGGER envios_propriedade_imutavel');}
        await pool.query("INSERT INTO tentativas_envio(envio_id,escritorio_id,resultado) VALUES($1,$2,'incerto')",[first.destino_id,envio.escritorio_id]);
        const withAttempt=await compararFilasRecuperacaoPostgres(pool,path,key);
        const evidence=withAttempt.registros.find(row=>row.tabela==='envios_clientes'&&row.origem_id===first.origem_id);
        assert.ok(evidence?.alertas.includes('tentativa_incerta_exige_conferencia'));
        assert.equal(evidence?.evidencias.tentativas_adicionais,'1');
      }
      console.log('Caminho operacional validado: pacote, banco, conexão concorrente, preservação, retomada e rejeição de troca/adulteração do manifesto.');
    }finally{await pool.end();if(created)unlinkSync(path);if(reportCreated)unlinkSync(reportPath);}
  });
  console.log('Banco temporário removido; destino atual preservado.');
}catch(error){
  console.error('Validação operacional não concluída:',(error as {code?:string}).code??(error as Error).name);
  const locations=(error as Error).stack?.split('\n').filter(line=>/src[\\/]postgres-.*\.ts:\d+/.test(line));
  for(const location of locations??[])console.error(location.trim());process.exitCode=1;
}

