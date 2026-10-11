import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditarImportacaoLegada } from '../src/postgres-import-audit.js';

const roots: string[] = [];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});vi.restoreAllMocks();});
function fixture(){const root=mkdtempSync(join(tmpdir(),'mediador-import-audit-'));roots.push(root);const dbPath=join(root,'legacy.db');const db=new Database(dbPath);db.exec('CREATE TABLE registros(numero_registro TEXT PRIMARY KEY,arquivo_path TEXT,arquivo_hash TEXT); INSERT INTO registros(numero_registro) VALUES (\'R-1\');');db.close();return{root,dbPath,report:join(root,'audit.json')};}
function poolWithDestination(rows:Record<string,number>={},initial=true){const query=vi.fn(async(sql:string)=>{
  if(sql.includes('current_database()'))return{rows:[{current_database:'mediador_test',server_addr:'127.0.0.1',server_port:5432}]};
  if(sql.includes('pg_roles'))return{rows:[{rolname:'runtime',rolsuper:false,rolbypassrls:false}]};
  if(sql.includes('information_schema.tables'))return{rows:Object.keys(rows).map(table_name=>({table_name}))};
  if(sql.startsWith('SELECT id,nome,cnpj,email,telefone,ativo'))return{rows:[{id:1,nome:initial?'Escritório inicial':'Empresa real',cnpj:null,email:'',telefone:'',ativo:true}]};
  const table=sql.match(/FROM "([^"]+)"/)?.[1]??'';return{rows:[{n:rows[table]??0}]};
});const client={query,release:vi.fn()};return{connect:vi.fn(async()=>client)} as never;}

describe('auditarImportacaoLegada',()=>{
  it('produces a read-only report for a clean source and empty destination',async()=>{
    const f=fixture(),pool=poolWithDestination();const before=readFileSync(f.dbPath);
    const report=await auditarImportacaoLegada(pool,f.dbPath,f.report);
    expect(report.readyForImport).toBe(true);expect(report.sourceTables.registros).toBe(1);expect(report.blockers).toEqual([]);
    expect(readFileSync(f.dbPath).equals(before)).toBe(true);expect(JSON.parse(readFileSync(f.report,'utf8')).sourceFingerprint).toBe(report.sourceFingerprint);
  });
  it('permite o escritório inicial criado pela migração em um destino ainda vazio',async()=>{
    const f=fixture();
    const report=await auditarImportacaoLegada(poolWithDestination({escritorios:1}),f.dbPath,f.report);
    expect(report.readyForImport).toBe(true);
  });
  it('bloqueia um escritório real mesmo quando é o único cadastro do destino',async()=>{
    const f=fixture();
    const report=await auditarImportacaoLegada(poolWithDestination({escritorios:1},false),f.dbPath,f.report);
    expect(report.readyForImport).toBe(false);
    expect(report.blockers.join(' ')).toContain('contém dados');
  });
  it('identifica mudanças de conteúdo sem alteração das contagens e inventaria tabelas legadas adicionais',async()=>{
    const f=fixture();const db=new Database(f.dbPath);
    db.exec("CREATE TABLE ajustes_legados(chave TEXT PRIMARY KEY,valor TEXT); INSERT INTO ajustes_legados VALUES('modo','antigo')");db.close();
    const before=await auditarImportacaoLegada(poolWithDestination(),f.dbPath,f.report);
    const changed=new Database(f.dbPath);changed.exec("UPDATE ajustes_legados SET valor='novo'");changed.close();
    const after=await auditarImportacaoLegada(poolWithDestination(),f.dbPath,f.report);
    expect(before.sourceTables).toEqual(after.sourceTables);
    expect(after.sourceTables.ajustes_legados).toBe(1);
    expect(after.sourceFingerprint).not.toBe(before.sourceFingerprint);
    const repeat=await auditarImportacaoLegada(poolWithDestination(),f.dbPath,f.report);
    expect(repeat.sourceFingerprint).toBe(after.sourceFingerprint);
  });
  it('blocks orphaned tenant relations, invalid file hashes and populated target',async()=>{
    const f=fixture();const db=new Database(f.dbPath);db.exec('CREATE TABLE clientes(id INTEGER PRIMARY KEY); CREATE TABLE clientes_documentos(cliente_id INTEGER,numero_registro TEXT); INSERT INTO clientes_documentos VALUES (900,\'R-1\'); ALTER TABLE registros ADD COLUMN arquivo_path2 TEXT;');
    const file=join(f.root,'missing.pdf');db.prepare('UPDATE registros SET arquivo_path=?').run(file);db.close();
    const report=await auditarImportacaoLegada(poolWithDestination({clientes:2}),f.dbPath,f.report);
    expect(report.readyForImport).toBe(false);expect(report.sourceChecks.documentos_cliente_sem_cliente).toBe(1);expect(report.missingFiles).toEqual(['R-1']);expect(report.blockers).toHaveLength(3);
  });
  it('detects a file whose bytes do not match the stored SHA-256',async()=>{
    const f=fixture(),path=join(f.root,'record.pdf');writeFileSync(path,'not the original');const db=new Database(f.dbPath);db.prepare('UPDATE registros SET arquivo_path=?,arquivo_hash=?').run(path,createHash('sha256').update('different').digest('hex'));db.close();
    const report=await auditarImportacaoLegada(poolWithDestination(),f.dbPath,f.report);
    expect(report.invalidFiles).toEqual(['R-1']);expect(report.readyForImport).toBe(false);
  });
});
