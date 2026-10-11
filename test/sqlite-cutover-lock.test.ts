import {it,expect,vi} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDb} from '../src/db.js';
import {bloquearSqliteParaCorte,caminhoBloqueioSqlite,exigirSqliteOperacional} from '../src/sqlite-cutover-lock.js';
import {prepararEnvios,processarFila} from '../src/envios.js';
import {processarNotificacoesPublicacao} from '../src/publicacoes.js';
import {executarMonitor} from '../src/monitoring/runner.js';
import {spawnSync} from 'node:child_process';

it('persiste bloqueio idempotente sem sobrescrever outro pacote',()=>{
  const folder=mkdtempSync(join(tmpdir(),'mediador-lock-')),source=join(folder,'origem.sqlite');
  try{
    writeFileSync(source,'arquivo');expect(()=>exigirSqliteOperacional(source)).not.toThrow();
    const path=bloquearSqliteParaCorte(source,'a'.repeat(64)),before=readFileSync(path,'utf8');
    expect(bloquearSqliteParaCorte(source,'a'.repeat(64))).toBe(path);
    expect(()=>bloquearSqliteParaCorte(source,'b'.repeat(64))).toThrow('outro pacote');
    expect(readFileSync(path,'utf8')).toBe(before);
    expect(()=>exigirSqliteOperacional(source)).toThrow('SQLite bloqueado');
    expect(()=>exigirSqliteOperacional(':memory:')).not.toThrow();
  }finally{rmSync(folder,{recursive:true,force:true});}
});
it('bloqueio parcial ou adulterado nunca libera a origem',()=>{
  const folder=mkdtempSync(join(tmpdir(),'mediador-lock-invalid-')),source=join(folder,'origem.sqlite');
  try{
    writeFileSync(caminhoBloqueioSqlite(source),'');
    expect(()=>exigirSqliteOperacional(source)).toThrow('SQLite bloqueado');
    expect(()=>bloquearSqliteParaCorte(source,'a'.repeat(64))).toThrow();
    expect(()=>openDb(source)).toThrow('SQLite bloqueado');
  }finally{rmSync(folder,{recursive:true,force:true});}
});
it('recusa reinício, filas e coleta usando uma conexão aberta antes do bloqueio',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'mediador-lock-open-')),source=join(folder,'origem.sqlite'),db=openDb(source);
  try{
    const before=db.prepare('SELECT * FROM envios_clientes').all(),sendMail=vi.fn();
    bloquearSqliteParaCorte(source,'c'.repeat(64));
    expect(()=>openDb(source)).toThrow('SQLite bloqueado');
    await expect(prepararEnvios(db)).rejects.toThrow('SQLite bloqueado');
    await expect(processarFila(db,{sendMail})).rejects.toThrow('SQLite bloqueado');
    await expect(processarNotificacoesPublicacao(db)).rejects.toThrow('SQLite bloqueado');
    await expect(executarMonitor({db})).rejects.toThrow('SQLite bloqueado');
    expect(sendMail).not.toHaveBeenCalled();
    expect(db.prepare('SELECT * FROM envios_clientes').all()).toEqual(before);
  }finally{db.close();rmSync(folder,{recursive:true,force:true});}
});

it('servidor e CLI encerram em novos processos sem reabrir SQLite bloqueado',()=>{
  const folder=mkdtempSync(join(tmpdir(),'mediador-lock-process-')),source=join(folder,'origem.sqlite');
  const db=openDb(source);db.close();
  try{
    bloquearSqliteParaCorte(source,'d'.repeat(64));
    for(const args of [['src/server-sqlite-dev.ts'],['src/index.ts','check'],['src/index.ts','list']]){
      const result=spawnSync(process.execPath,['--import','tsx',...args],{
        env:{...process.env,APP_POSTGRES_CONTEXT:'0',DB_PATH:source},encoding:'utf8',windowsHide:true,timeout:10000
      });
      expect(result.error).toBeUndefined();expect(result.status).toBe(1);
      expect(result.stderr).toContain('SQLITE_CUTOVER_LOCKED');
      expect(result.stdout).not.toContain('Painel:');
    }
  }finally{rmSync(folder,{recursive:true,force:true});}
},15000);

