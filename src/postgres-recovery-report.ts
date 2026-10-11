import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {Pool} from 'pg';
import {compararFilasRecuperacaoPostgres} from './postgres-recovery-queues.js';
import {assinarManifestoMigracao,conferirAssinaturaManifestoMigracao} from './postgres-migration-manifest.js';

export async function exportarRelatorioRecuperacao(pool:Pool,manifestPath:string,output:string,key:Buffer){
  const comparison=await compararFilasRecuperacaoPostgres(pool,manifestPath,key);
  const payload={formato:'recuperacao-filas-v1',gerado_em:new Date().toISOString(),manifesto:resolve(manifestPath),
    conciliacao_concluida:false,filas_liberadas:false,comparacao:comparison};
  const report={...payload,assinatura:assinarManifestoMigracao(payload,key)};
  const file=resolve(output);writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  return {path:file,report};
}

export async function verificarRelatorioRecuperacao(pool:Pool,path:string,key:Buffer){
  const report=JSON.parse(readFileSync(resolve(path),'utf8')) as Awaited<ReturnType<typeof exportarRelatorioRecuperacao>>['report'];
  conferirAssinaturaManifestoMigracao(report,key);
  if(report.formato!=='recuperacao-filas-v1'||report.conciliacao_concluida!==false||report.filas_liberadas!==false)throw new Error('Formato de relatório de recuperação inválido.');
  const current=await compararFilasRecuperacaoPostgres(pool,report.manifesto,key);
  if(assinarManifestoMigracao({comparacao:current},key)!==assinarManifestoMigracao({comparacao:report.comparacao},key))throw new Error('Evidências mudaram desde o relatório de recuperação.');
  return {relatorio:resolve(path),assinatura_validada:true,evidencias_atuais_conferidas:true,filas_liberadas:false};
}

