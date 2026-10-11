import {it,expect} from 'vitest';
import Database from 'better-sqlite3';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {bloquearSqliteParaCorte,caminhoBloqueioSqlite,exigirSqliteOperacional} from '../src/sqlite-cutover-lock.js';
import {inspecionarSqliteRecuperacao} from '../src/sqlite-recovery-inspection.js';

it('inspeciona filas sem alterar banco/bloqueio ou expor dados pessoais',()=>{
  const folder=mkdtempSync(join(tmpdir(),'mediador-inspect-')),source=join(folder,'origem.sqlite');
  try{
    const db=new Database(source);
    db.exec(`CREATE TABLE usuarios(email TEXT); INSERT INTO usuarios VALUES('sigiloso@example.invalid');
      CREATE TABLE envios_clientes(status TEXT); INSERT INTO envios_clientes VALUES('na_fila'),('enviando'),('enviado'),('sigiloso@example.invalid');
      CREATE TABLE notificacoes_publicacoes(estado TEXT); INSERT INTO notificacoes_publicacoes VALUES('pendente');`);db.close();
    const lock=bloquearSqliteParaCorte(source,'a'.repeat(64)),before=readFileSync(source),marker=readFileSync(lock);
    const result=inspecionarSqliteRecuperacao(source);
    expect(result.contagens.usuarios).toBe('1');expect(result.contagens.clientes).toBeNull();
    expect(result.filas.envios).toEqual({na_fila:'1',enviando:'1',enviado:'1',outros:'1'});
    expect(result.filas.notificacoes).toEqual({pendente:'1'});
    expect(result.filas_liberadas).toBe(false);expect(JSON.stringify(result)).not.toContain('sigiloso');
    expect(readFileSync(source)).toEqual(before);expect(readFileSync(lock)).toEqual(marker);
    expect(()=>exigirSqliteOperacional(source)).toThrow('SQLite bloqueado');
    const cli=spawnSync(process.execPath,['--import','tsx','src/sqlite-recovery-inspection-cli.ts','--source',source],{encoding:'utf8',windowsHide:true,timeout:10000});
    expect(cli.error).toBeUndefined();expect(cli.status).toBe(0);
    expect(JSON.parse(cli.stdout)).toEqual(result);
    expect(readFileSync(source)).toEqual(before);expect(readFileSync(lock)).toEqual(marker);
  }finally{rmSync(folder,{recursive:true,force:true});}
});
it('recusa origem sem bloqueio, ausente ou corrompida sem criar banco',()=>{
  const folder=mkdtempSync(join(tmpdir(),'mediador-inspect-invalid-')),source=join(folder,'origem.sqlite');
  try{
    expect(()=>inspecionarSqliteRecuperacao(source)).toThrow('exige um arquivo');
    writeFileSync(caminhoBloqueioSqlite(source),'');
    expect(()=>inspecionarSqliteRecuperacao(source)).toThrow();
    writeFileSync(source,'conteúdo corrompido');
    expect(()=>inspecionarSqliteRecuperacao(source)).toThrow();
    expect(readFileSync(source,'utf8')).toBe('conteúdo corrompido');
  }finally{rmSync(folder,{recursive:true,force:true});}
});
