import {expect,it,vi} from 'vitest';
import Database from 'better-sqlite3';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Pool} from 'pg';
import {planejarImportacaoPostgres} from '../src/postgres-import-plan.js';

it('inventário preserva origem, omite valores secretos e bloqueia tabelas desconhecidas',async()=>{
  const root=mkdtempSync(join(tmpdir(),'import-plan-'));
  try{
    const source=join(root,'source.db'),output=join(root,'plan.json'),db=new Database(source);
    db.exec("CREATE TABLE credenciais_usuarios(usuario_id INTEGER,senha_hash TEXT); INSERT INTO credenciais_usuarios VALUES(1,'segredo-que-nao-pode-sair'); CREATE TABLE desconhecida(id INTEGER); CREATE TABLE clientes_contatos(cliente_id INTEGER,contato_id INTEGER); CREATE TABLE sessoes_usuarios(token_hash TEXT);");db.close();
    const before=readFileSync(source);
    const pool={query:vi.fn(async()=>({rows:[{table_name:'credenciais_usuarios',column_name:'usuario_id',data_type:'integer',is_nullable:'NO',column_default:null,is_identity:'NO'},{table_name:'credenciais_usuarios',column_name:'senha_hash',data_type:'text',is_nullable:'NO',column_default:null,is_identity:'NO'},{table_name:'clientes_contatos',column_name:'escritorio_id',data_type:'integer',is_nullable:'NO',column_default:null,is_identity:'NO'}]}))} as unknown as Pool;
    const report=await planejarImportacaoPostgres(pool,source,output);
    expect(report.bloqueios).toEqual(['Mapeamento ausente: desconhecida']);
    expect(report.tabelas.find(table=>table.origem==='clientes_contatos')).toMatchObject({politica:'derivar_escritorio',colunas_obrigatorias_sem_origem:['escritorio_id']});
    expect(report.tabelas.find(table=>table.origem==='sessoes_usuarios')?.politica).toBe('preservar_sem_reativar');
    expect(readFileSync(output,'utf8')).not.toContain('segredo-que-nao-pode-sair');
    expect(readFileSync(source).equals(before)).toBe(true);
  }finally{rmSync(root,{recursive:true,force:true});}
});
