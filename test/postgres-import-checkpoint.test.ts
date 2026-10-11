import {describe,it,expect,vi} from 'vitest';
import type {PoolClient} from 'pg';
import Database from 'better-sqlite3';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {identificarOrigemImportacao,identificarOpcoesImportacao,conferirCheckpointImportacao,capturarLinhasPreexistentes,conferirLinhasPreexistentes} from '../src/postgres-import-checkpoint.js';

describe('checkpoint de importação',()=>{
  it('confere preservação das linhas preexistentes com multiplicidade, permitindo apenas acréscimos',async()=>{
    let rows=[{conteudo:'original'},{conteudo:'original'}];
    const query=vi.fn(async(sql:string)=>({rows:sql.includes('information_schema.tables')?[{table_name:'historico'}]:rows}));
    const client={query} as unknown as PoolClient,before=await capturarLinhasPreexistentes(client);
    rows=[...rows,{conteudo:'novo'}];await expect(conferirLinhasPreexistentes(client,before)).resolves.toBeUndefined();
    rows=[{conteudo:'original'},{conteudo:'alterado'},{conteudo:'novo'}];
    await expect(conferirLinhasPreexistentes(client,before)).rejects.toThrow('preexistente foi alterado');
  });
  it('detecta mudança de conteúdo sem mudança de contagem, incluindo inteiros de 64 bits',()=>{
    const db=new Database(':memory:');
    try{
      db.exec('CREATE TABLE historico(id INTEGER PRIMARY KEY,valor INTEGER,payload BLOB)');
      db.prepare('INSERT INTO historico VALUES(1,?,?)').run(9223372036854775806n,Buffer.from([0,255]));
      const before=identificarOrigemImportacao(db);
      db.prepare('UPDATE historico SET valor=?').run(9223372036854775807n);
      expect(identificarOrigemImportacao(db)).not.toBe(before);
      db.prepare('UPDATE historico SET valor=?,payload=?').run(9223372036854775806n,Buffer.from([0,254]));
      expect(identificarOrigemImportacao(db)).not.toBe(before);
    }finally{db.close();}
  });
  it('considera esquema e multiplicidade, mas não a ordem física das linhas',()=>{
    const db=new Database(':memory:');
    try{
      db.exec("CREATE TABLE itens(valor TEXT); INSERT INTO itens VALUES('a'),('b')");
      const before=identificarOrigemImportacao(db);
      db.exec("DELETE FROM itens; INSERT INTO itens VALUES('b'),('a')");
      expect(identificarOrigemImportacao(db)).toBe(before);
      db.exec("INSERT INTO itens VALUES('a')");
      expect(identificarOrigemImportacao(db)).not.toBe(before);
      db.exec("DELETE FROM itens WHERE rowid=(SELECT max(rowid) FROM itens); ALTER TABLE itens ADD COLUMN extra TEXT");
      expect(identificarOrigemImportacao(db)).not.toBe(before);
    }finally{db.close();}
  });
  it('recusa original ausente ou alterado mesmo quando o banco não mudou',()=>{
    const root=mkdtempSync(join(tmpdir(),'import-checkpoint-')),db=new Database(':memory:');
    try{
      const file=join(root,'original.pdf');writeFileSync(file,'original');
      db.exec('CREATE TABLE registros(numero_registro TEXT,arquivo_path TEXT,arquivo_hash TEXT)');
      db.prepare('INSERT INTO registros VALUES(?,?,?)').run('CCT1',file,createHash('sha256').update('original').digest('hex'));
      expect(identificarOrigemImportacao(db,join(root,'origem.db'))).toMatch(/^[a-f0-9]{64}$/);
      writeFileSync(file,'alterado');
      expect(()=>identificarOrigemImportacao(db,join(root,'origem.db'))).toThrow('Original alterado');
      rmSync(file);expect(()=>identificarOrigemImportacao(db,join(root,'origem.db'))).toThrow('Original ausente');
    }finally{db.close();rmSync(root,{recursive:true,force:true});}
  });
  it('vincula opções aos mapas e à chave sem depender da ordem do plano',()=>{
    const key=Buffer.alloc(32,1),plans=[{tabela:'usuarios',mapeamentos:[{origem_id:2,destino_id:8,acao:'inserir_remapeando_id'},{origem_id:1,destino_id:7,acao:'inserir_remapeando_id'}]}];
    const before=identificarOpcoesImportacao(plans,key);
    expect(identificarOpcoesImportacao([{...plans[0],mapeamentos:[...plans[0].mapeamentos].reverse()}],key)).toBe(before);
    expect(identificarOpcoesImportacao(plans,Buffer.alloc(32,2))).not.toBe(before);
    expect(identificarOpcoesImportacao(plans,key,'conciliacao')).not.toBe(before);
    expect(identificarOpcoesImportacao([{...plans[0],mapeamentos:[{...plans[0].mapeamentos[0],destino_id:9}]}],key)).not.toBe(before);
  });
  it('só aceita retomar com origem, opções e destino equivalentes',()=>{
    const saved={origem_hash:'origem',opcoes_hash:'opcoes',destino_hash:'destino'};
    expect(()=>conferirCheckpointImportacao(saved,{...saved})).not.toThrow();
    expect(()=>conferirCheckpointImportacao(saved,{...saved,origem_hash:'outra'})).toThrow('Origem alterada');
    expect(()=>conferirCheckpointImportacao(saved,{...saved,opcoes_hash:'outras'})).toThrow('divergem');
    expect(()=>conferirCheckpointImportacao(saved,{...saved,destino_hash:'outro'})).toThrow('Destino alterado');
  });
});
