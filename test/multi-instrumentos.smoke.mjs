import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIPOS_INSTRUMENTO, TIPOS_PADRAO, normalizarTipos, expandirTipos, valorMte } from '../dist-historico/instrumentos.js';
const html=readFileSync(new URL('../web/index.html', import.meta.url),'utf8');
const db=readFileSync(new URL('../src/db.ts',import.meta.url),'utf8');
const srv=readFileSync(new URL('../src/server-sqlite-dev.ts',import.meta.url),'utf8');
const runner=readFileSync(new URL('../src/monitoring/runner.ts',import.meta.url),'utf8');
const scraper=readFileSync(new URL('../src/scraper.ts',import.meta.url),'utf8');

test('MTE disponibiliza 8 tipos explícitos e busca sem tipo',()=>assert.equal(TIPOS_INSTRUMENTO.length,9));
test('CCT usa value exato do MTE',()=>assert.equal(valorMte('Convenção Coletiva'),'convencao'));
test('aditivo de convenção preserva grafia do HTML real',()=>assert.equal(valorMte('Termo Aditivo de Convenção Coletiva'),'termoAditivoConvecao'));
test('aditivo de acordo',()=>assert.equal(valorMte('Termo Aditivo de Acordo Coletivo'),'termoAditivoAcordo'));
test('todos os tipos fica sem filtro',()=>assert.equal(valorMte('Todos os tipos'),''));
test('seleção de CCT e aditivo mantém a ordem',()=>assert.deepEqual(normalizarTipos(TIPOS_PADRAO),TIPOS_PADRAO));
test('cadastro legado sem lista preserva o tipo original',()=>assert.deepEqual(normalizarTipos(undefined,'Acordo Coletivo'),['Acordo Coletivo']));
test('cadastro legado em branco usa CCT',()=>assert.deepEqual(normalizarTipos(undefined,''),['Convenção Coletiva']));
test('normalização remove duplicatas',()=>assert.deepEqual(normalizarTipos(['Acordo Coletivo','Acordo Coletivo']),['Acordo Coletivo']));
test('todos os tipos exclui filtros simultâneos',()=>assert.deepEqual(normalizarTipos(['Convenção Coletiva','Todos os tipos']),['Todos os tipos']));
test('rejeita tipos desconhecidos',()=>assert.throws(()=>normalizarTipos(['um tipo inexistente']),/reconhecido/));
test('uma seleção dupla gera duas consultas com identificação intacta',()=>{
 const w={name:'Sindicato exemplo',cnpj:'00.721.175/0001-98',categoria:'',uf:'DF',tipo:'Convenção Coletiva',tipos:TIPOS_PADRAO,vigencia:'Vigentes',titulo:''};
 const result=expandirTipos(w);
 assert.equal(result.length,2);
 assert.deepEqual(result.map(x=>x.tipo),TIPOS_PADRAO);
 assert.ok(result.every(x=>x.cnpj===w.cnpj && x.uf===w.uf && x.name===w.name));
});
test('um tipo legado gera consulta única',()=>assert.equal(expandirTipos({tipo:'Convenção Coletiva'}).length,1));
test('opções da interface correspondem às opções suportadas',()=>{
 for(const t of TIPOS_INSTRUMENTO) assert.ok(html.includes(`value="${t.nome}"`),t.nome);
});
test('o formulário inclui seleção obrigatória e exclusividade de Todos os tipos',()=>{
 assert.match(html,/if\(!tipos\.length\)/);assert.match(html,/if\(e\.target\.value==='Todos os tipos'\)/);
});
test('a UI exibe os tipos escolhidos',()=>assert.match(html,/w\.tipos\?\.length/));
test('o banco possui campo JSON e migração aditiva',()=>{
 assert.match(db,/tipos_json TEXT NOT NULL DEFAULT '\[\]'/);
 assert.match(db,/ALTER TABLE sindicatos ADD COLUMN tipos_json/);
 assert.match(db,/UPDATE sindicatos SET tipos_json/);
});
test('o CRUD do SQLite persiste e recupera a lista',()=>{
 assert.match(db,/JSON\.stringify\(tipos\)/);
 assert.match(db,/JSON\.parse\(tipos_json\)/);
});
test('o backend valida lista de tipos',()=>assert.match(srv,/TIPOS_VALIDOS\.has\(t\)/));
test('o runner expande todos os tipos em consultas independentes',()=>assert.match(runner,/flatMap\(expandirTipos\)/));
test('o scraper fecha popups da consulta anterior',()=>assert.match(scraper,/janela\.close\(\)/));
test('a execução registra o tipo consultado',()=>assert.match(db,/tipo_instrumento TEXT NOT NULL DEFAULT/));

// Migration test against an ACTUAL old SQLite database using the Node 22 SQLite
// adapter already used by analysis-state.smoke; no npm/native binary required.
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname } from 'node:path';
const dbSrc=readFileSync(new URL('../dist-historico/db.js', import.meta.url),'utf8');
const sourceShim=dbSrc
  .replace('import Database from "better-sqlite3";', `import Database from '${new URL('./fixtures/sqlite-smoke.mjs',import.meta.url).href}';`)
  .replace('import { env } from "./config.js";', `const env = { llm: {apiKey:'', model:'',baseUrl:''} };`)
  .replace("import { ErroCadastro, migrarCadastros } from './cadastros.js';", `import { ErroCadastro, migrarCadastros } from '${new URL('../dist-historico/cadastros.js',import.meta.url).href}';`)
  .replace("import { migrarOrganizacoes } from './organizacoes.js';", `import { migrarOrganizacoes } from '${new URL('../dist-historico/organizacoes.js',import.meta.url).href}';`)
  .replace("import { migrarAutenticacao } from './autenticacao.js';", `import { migrarAutenticacao } from '${new URL('../dist-historico/autenticacao.js',import.meta.url).href}';`)
  .replace("import { migrarContatosPorEscritorio } from './migracao-contatos.js';", `import { migrarContatosPorEscritorio } from '${new URL('../dist-historico/migracao-contatos.js',import.meta.url).href}';`)
  .replace("import { migrarMonitoramentosEscritorio } from './monitoramentos-escritorio.js';", `import { migrarMonitoramentosEscritorio } from '${new URL('../dist-historico/monitoramentos-escritorio.js',import.meta.url).href}';`)
  .replace("import { migrarInterpretacoes } from './migracao-interpretacoes.js';", `import { migrarInterpretacoes } from '${new URL('../dist-historico/migracao-interpretacoes.js',import.meta.url).href}';`)
  .replace("import { migrarOperacoesEscritorio } from './operacoes-escritorio.js';", `import { migrarOperacoesEscritorio } from '${new URL('../dist-historico/operacoes-escritorio.js',import.meta.url).href}';`)
  .replace('import { normalizarTipos } from "./instrumentos.js";', `import { normalizarTipos } from '${new URL('../dist-historico/instrumentos.js', import.meta.url).href}';`);
const api=await import('data:text/javascript;base64,'+Buffer.from(sourceShim).toString('base64'));

test('migração REAL: preserva sindicato antigo e permite editar vários tipos',()=>{
 const temp=mkdtempSync(join(tmpdir(),'mte-v036-'));
 try {
   const path=join(temp,'legacy.sqlite');
   const old=new DatabaseSync(path);
   old.exec(`CREATE TABLE sindicatos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, cnpj TEXT DEFAULT '', categoria TEXT DEFAULT '', uf TEXT DEFAULT '', tipo TEXT DEFAULT '', vigencia TEXT DEFAULT '', titulo TEXT DEFAULT '', ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT DEFAULT (datetime('now')));
             CREATE TABLE execucoes (id INTEGER PRIMARY KEY AUTOINCREMENT, iniciada_em TEXT, watch TEXT, encontrados INTEGER, novos INTEGER, erro TEXT);`);
   old.prepare('INSERT INTO sindicatos (nome,cnpj,tipo,vigencia,uf) VALUES (?,?,?,?,?)').run('Sindicato histórico','00.721.175/0001-98','Acordo Coletivo','Vigentes','DF');
   old.close();
   let db=api.openDb(path);let w=api.listarSindicatos(db)[0];
   assert.equal(w.nome,'Sindicato histórico');
   assert.deepEqual(w.tipos,['Acordo Coletivo']);
   api.atualizarSindicato(db,w.id,{...w,tipos:['Acordo Coletivo','Termo Aditivo de Acordo Coletivo']});
   db.close();
   db=api.openDb(path);w=api.listarSindicatos(db)[0];
   assert.deepEqual(w.tipos,['Acordo Coletivo','Termo Aditivo de Acordo Coletivo']);
   assert.equal(api.watchesDeSindicatos(db)[0].tipos.length,2);
   const tiposCols=db.prepare('PRAGMA table_info(sindicatos)').all().map(x=>x.name);
   const execCols=db.prepare('PRAGMA table_info(execucoes)').all().map(x=>x.name);
   assert.ok(tiposCols.includes('tipos_json'));
   assert.ok(execCols.includes('tipo_instrumento'));
   db.close();
 } finally {rmSync(temp,{recursive:true,force:true});}
});




