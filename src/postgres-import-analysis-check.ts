import Database from 'better-sqlite3';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import type {Pool} from 'pg';
import {normalizarExtracao,paraVisao} from './extract.js';
import {renderizarCctMarkdown} from './cct-template.js';
import {hashBytes} from './relatorio-core.js';
import {withPostgresOfficeTransaction} from './postgres-transaction.js';
const parse=(value:unknown)=>typeof value==='string'?JSON.parse(value):value;
/** Read-only semantic comparison, restricted to an already imported disposable database. */
export async function validarAnalisesImportadas(source:string,target:Pool,runtime:Pool){
  const database=(await target.query('SELECT current_database() nome')).rows[0].nome;
  assert.match(database,/^mediador_import_test_[a-f0-9]{32}$/);
  assert.equal((await runtime.query('SELECT current_database() nome')).rows[0].nome,database);
  const db=new Database(resolve(source),{readonly:true,fileMustExist:true});
  let analyzed=0,structured=0,amendments=0,legacy=0,originals=0,scoped=0;
  try{
    db.exec('BEGIN');
    const rows=db.prepare('SELECT numero_registro,analise_status,extracao_json,arquivo_path,arquivo_hash FROM registros ORDER BY numero_registro').all() as Array<Record<string,unknown>>;
    for(const row of rows){
      const stored=(await target.query('SELECT analise_status,extracao_json,arquivo_path,arquivo_hash FROM registros WHERE numero_registro=$1',[row.numero_registro])).rows[0];
      assert.ok(stored,'Registro não importado.');assert.equal(stored.analise_status,row.analise_status);
      const before=parse(row.extracao_json),after=parse(stored.extracao_json);assert.deepEqual(after,before);
      if(row.analise_status==='analisado'){
        assert.ok(before,'Análise concluída sem JSON.');analyzed++;
        const sourceAnalysis=normalizarExtracao(before),targetAnalysis=normalizarExtracao(after);
        assert.deepEqual(paraVisao(targetAnalysis),paraVisao(sourceAnalysis));
        if(sourceAnalysis?.padrao){structured++;assert.equal(hashBytes(renderizarCctMarkdown(targetAnalysis!.padrao!)),hashBytes(renderizarCctMarkdown(sourceAnalysis.padrao)));}
        else if(sourceAnalysis?.aditivo)amendments++;else legacy++;
      }
      if(row.arquivo_path){
        const candidates=[resolve(String(row.arquivo_path)),resolve(dirname(resolve(source)),String(row.arquivo_path))];
        const expected=String(row.arquivo_hash).toLowerCase();let bytes:Buffer|undefined;
        for(const path of candidates){try{bytes=readFileSync(path);break;}catch{}}
        assert.ok(bytes,'Original de origem indisponível.');assert.equal(hashBytes(bytes),expected);
        assert.equal(hashBytes(readFileSync(stored.arquivo_path)),expected);assert.equal(stored.arquivo_hash,expected);originals++;
      }
    }
    // Verify imported ownership through the runtime RLS, including connection reuse.
    for(const office of (await target.query('SELECT id FROM escritorios ORDER BY id')).rows){
      const expected=(await target.query('SELECT cliente_id,numero_registro,status FROM clientes_documentos WHERE escritorio_id=$1 ORDER BY cliente_id,numero_registro',[office.id])).rows;
      const actual=await withPostgresOfficeTransaction(runtime,office.id,async client=>(await client.query('SELECT cliente_id,numero_registro,status FROM clientes_documentos ORDER BY cliente_id,numero_registro')).rows);
      assert.deepEqual(actual,expected);scoped+=actual.length;
    }
    assert.equal((await runtime.query('SELECT * FROM clientes_documentos')).rowCount,0);
    const privateCounts=await target.query('SELECT (SELECT count(*)::integer FROM interpretacoes_escritorio) interpretacoes,(SELECT count(*)::integer FROM versoes_interpretacao) versoes');
    return {registros_comparados:rows.length,analises:analyzed,estruturadas_markdown:structured,aditivos:amendments,legadas:legacy,originais_verificados:originals,vinculos_cliente_isolados:scoped,
      ...privateCounts.rows[0],comparacao_json:true,comparacao_visao:true,comparacao_markdown:structured>0,
      limite_cobertura:'Compara conteúdo e apresentação existentes; não chama IA nem cria revisões/consolidações ausentes na origem.'};
  }finally{db.close();}
}


