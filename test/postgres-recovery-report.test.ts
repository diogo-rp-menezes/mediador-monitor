import {it,expect,vi} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import type {Pool} from 'pg';
import {compararFilasRecuperacaoPostgres} from '../src/postgres-recovery-queues.js';
import {exportarRelatorioRecuperacao,verificarRelatorioRecuperacao} from '../src/postgres-recovery-report.js';
import {resumirPendenciasRecuperacao} from '../src/postgres-recovery-summary.js';
vi.mock('../src/postgres-recovery-queues.js',()=>({compararFilasRecuperacaoPostgres:vi.fn()}));
const comparison={modo:'comparacao_recuperacao',somente_leitura:true,filas_liberadas:false,conciliacao_concluida:false,
  manifesto_assinatura:'a'.repeat(64),evidencias_hash:'b'.repeat(64),registros:[],linhas_destino_fora_do_lote:{},resumo:resumirPendenciasRecuperacao([],{}),limites:[]};

it('exporta relatório assinado sem sobrescrever e rejeita adulteração/chave diferente',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'mediador-report-')),path=join(folder,'relatorio.json'),key=Buffer.alloc(32,7),pool={} as Pool;
  vi.mocked(compararFilasRecuperacaoPostgres).mockResolvedValue(comparison);
  try{
    await exportarRelatorioRecuperacao(pool,'manifesto.json',path,key);
    expect((await verificarRelatorioRecuperacao(pool,path,key)).filas_liberadas).toBe(false);
    const original=readFileSync(path,'utf8');
    await expect(exportarRelatorioRecuperacao(pool,'manifesto.json',path,key)).rejects.toMatchObject({code:'EEXIST'});
    expect(readFileSync(path,'utf8')).toBe(original);
    await expect(verificarRelatorioRecuperacao(pool,path,Buffer.alloc(32,8))).rejects.toThrow('chave divergente');
    writeFileSync(path,original.replace('recuperacao-filas-v1','recuperacao-filas-alterado'));
    await expect(verificarRelatorioRecuperacao(pool,path,key)).rejects.toThrow('Manifesto alterado');
  }finally{rmSync(folder,{recursive:true,force:true});}
});
it('rejeita evidências atuais diferentes mesmo com as mesmas contagens e classificações',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'mediador-report-state-')),path=join(folder,'relatorio.json'),key=Buffer.alloc(32,7),pool={} as Pool;
  try{
    vi.mocked(compararFilasRecuperacaoPostgres).mockResolvedValue(comparison);
    await exportarRelatorioRecuperacao(pool,'manifesto.json',path,key);
    vi.mocked(compararFilasRecuperacaoPostgres).mockResolvedValue({...comparison,evidencias_hash:'c'.repeat(64)});
    await expect(verificarRelatorioRecuperacao(pool,path,key)).rejects.toThrow('Evidências mudaram');
  }finally{rmSync(folder,{recursive:true,force:true});}
});
