import {it,expect} from 'vitest';
import Database from 'better-sqlite3';
import {mkdtempSync,readFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {referenciasOriginaisSqlite} from '../src/sqlite-original-references.js';
it('protege originais e anexos de snapshots sem alterar a origem ou executar migrações',()=>{
  const dir=mkdtempSync(join('data','sqlite-refs-test-')),path=join(dir,'origin.db'),db=new Database(path);
  try{
    db.exec('CREATE TABLE registros(arquivo_path TEXT); CREATE TABLE envios_clientes(snapshot_json TEXT)');
    db.prepare('INSERT INTO registros VALUES(?)').run('downloads/original.doc');
    db.prepare('INSERT INTO envios_clientes VALUES(?)').run(JSON.stringify({anexos:[{path:'downloads/snapshot.doc'}]}));db.close();
    const before=readFileSync(path),refs=referenciasOriginaisSqlite(path);
    expect(refs.has(resolve('downloads/original.doc').toLowerCase())).toBe(true);
    expect(refs.has('nome:snapshot.doc')).toBe(true);expect(readFileSync(path).equals(before)).toBe(true);
  }finally{if(db.open)db.close();unlinkSync(path);rmdirSync(dir);}
});
it('recusa origem ausente sem criar banco vazio',()=>{
  const dir=mkdtempSync(join('data','sqlite-refs-test-'));
  try{expect(()=>referenciasOriginaisSqlite(join(dir,'absent.db'))).toThrow();}finally{rmdirSync(dir);}
});
