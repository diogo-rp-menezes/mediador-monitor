import { resolve } from 'node:path';
import { criarPoolPostgresRuntime } from './postgres.js';
import { auditarImportacaoLegada } from './postgres-import-audit.js';
import { planejarImportacaoPostgres } from './postgres-import-plan.js';
import { planejarConciliacaoPostgres } from './postgres-import-reconcile.js';

const args = process.argv.slice(2);
const sourceIndex = args.indexOf('--source');
const reportIndex = args.indexOf('--report');
if (sourceIndex < 0 || reportIndex < 0 || !args[sourceIndex+1] || !args[reportIndex+1] || args.some(x=>x==='--import')) {
  console.error('Uso: npm run postgres:auditar-importacao -- --source <sqlite.db> --report <relatorio.json>');
  console.error('Este comando é somente leitura: não importa nem altera dados.');
  process.exitCode = 2;
} else {
  const pool = criarPoolPostgresRuntime();
  try {
    if(args.includes('--reconcile')){
      const report=await planejarConciliacaoPostgres(pool,resolve(args[sourceIndex+1]!),resolve(args[reportIndex+1]!));
      console.log(`Plano de conciliação salvo: ${resolve(args[reportIndex+1]!)}; ${report.revisoes_obrigatorias.length} revisões de identidade; ${report.revisoes_chaves.length} revisões de chaves. Nenhum dado foi importado.`);
      if(report.restricoes_sem_plano.length){console.error(`${report.restricoes_sem_plano.length} restrições únicas sem plano de conciliação.`);process.exitCode=1;}
    }else if(args.includes('--plan')){
      const report=await planejarImportacaoPostgres(pool,resolve(args[sourceIndex+1]!),resolve(args[reportIndex+1]!));
      console.log(`Plano salvo: ${resolve(args[reportIndex+1]!)}; ${report.tabelas.length} tabelas; ${report.bloqueios.length} sem mapeamento.`);
      if(report.bloqueios.length)process.exitCode=1;
    }else{
    const report = await auditarImportacaoLegada(pool,resolve(args[sourceIndex+1]!),resolve(args[reportIndex+1]!));
    console.log(`Relatório salvo em ${resolve(args[reportIndex+1]!)}`);
    console.log(`Registros SQLite: ${report.sourceTables.registros ?? 0}; tabelas PostgreSQL com dados: ${Object.values(report.destinationTables).filter(n=>n>0).length}`);
    console.log(report.readyForImport ? 'Pré-verificação sem bloqueios conhecidos; importador ainda requer validação de equivalência.' : `Bloqueios: ${report.blockers.join(' ')}`);
    if (!report.readyForImport) process.exitCode = 1;
    }
  } finally { await pool.end(); }
}

