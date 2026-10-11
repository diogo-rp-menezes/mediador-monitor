// Testes de estados da UI e migração/reserva SQLite, sem serviços externos.
// node --test test/analysis-state.smoke.mjs (Node 22+, necessário para node:sqlite)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const ui = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const script = ui.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const dbSource = readFileSync(new URL('../dist/db.js', import.meta.url), 'utf8');

// O adaptador usa a API nativa SQLite apenas durante os testes. Produção usa better-sqlite3.
const shimmedSource = dbSource
 .replace('import Database from "better-sqlite3";', `import Database from '${new URL('./fixtures/sqlite-smoke.mjs',import.meta.url).href}';`)
 .replace('import { env } from "./config.js";', `const env = { llm: { apiKey:'', model:'', baseUrl:'' } };`)
  .replace("import { ErroCadastro, migrarCadastros } from './cadastros.js';", `import { ErroCadastro, migrarCadastros } from '${new URL('../dist/cadastros.js',import.meta.url).href}';`)
  .replace("import { migrarOrganizacoes } from './organizacoes.js';", `import { migrarOrganizacoes } from '${new URL('../dist/organizacoes.js',import.meta.url).href}';`)
  .replace("import { migrarAutenticacao } from './autenticacao.js';", `import { migrarAutenticacao } from '${new URL('../dist/autenticacao.js',import.meta.url).href}';`)
  .replace("import { migrarContatosPorEscritorio } from './migracao-contatos.js';", `import { migrarContatosPorEscritorio } from '${new URL('../dist/migracao-contatos.js',import.meta.url).href}';`)
  .replace("import { migrarMonitoramentosEscritorio } from './monitoramentos-escritorio.js';", `import { migrarMonitoramentosEscritorio } from '${new URL('../dist/monitoramentos-escritorio.js',import.meta.url).href}';`)
  .replace("import { migrarInterpretacoes } from './migracao-interpretacoes.js';", `import { migrarInterpretacoes } from '${new URL('../dist/migracao-interpretacoes.js',import.meta.url).href}';`)
  .replace("import { migrarOperacoesEscritorio } from './operacoes-escritorio.js';", `import { migrarOperacoesEscritorio } from '${new URL('../dist/operacoes-escritorio.js',import.meta.url).href}';`)
 .replace('import { normalizarTipos } from "./instrumentos.js";', `import { normalizarTipos } from '${new URL('../dist/instrumentos.js', import.meta.url).href}';`);
const dbApi = await import('data:text/javascript;base64,'+Buffer.from(shimmedSource).toString('base64'));

function add(db, numero, extracao = null) {
  db.prepare(`INSERT INTO registros(numero_registro, watch, extracao_json) VALUES (?, ?, ?)`).run(numero, 'Teste', extracao);
}

test('botão simular não existe e UI suporta quatro estados', () => {
  assert.doesNotMatch(ui, /id="dry"/);
  assert.doesNotMatch(ui, /\$\("#dry"\)/);
  new vm.Script(script);
  const start = script.indexOf('function detalhe(r){');
  const end = script.indexOf('\nfunction viewRegistros()', start);
  assert.ok(start > -1 && end > start);
  const ctx={};
  vm.runInNewContext(`const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt =s=>s||'—';\n${script.slice(start,end)}\nthis.render=detalhe`,ctx);
  for(const [status,label,enabled] of [
    ['sem_analise','Sem análise',true],['analisando','Analisando',false],
    ['analisado','Analisado',true],['falhou','Falhou',true]]) {
    const html=ctx.render({numero_registro:'DF000380/2026',watch:'T',partes:'',extracao:null,primeira_vez:'2026-01-01',analise_status:status});
    assert.match(html,new RegExp('>'+label+'<'));
    const button=html.match(/<button class="sm" type="button" data-act="reanalisar"[^>]*>/)?.[0];
    assert.ok(button);
    assert.equal(button.includes('disabled'),!enabled,status);
  }
});

test('reserva atômica, conclusão, erro e preservação da análise anterior', () => {
  const db=dbApi.openDb(':memory:');
  add(db, 'DF000380/2026');
  assert.equal(dbApi.iniciarAnalise(db,'DF000380/2026'),true);
  assert.equal(dbApi.iniciarAnalise(db,'DF000380/2026'),false);
  dbApi.falharAnalise(db,'DF000380/2026','Falha simulada');
  let row=db.prepare('SELECT analise_status, analise_erro FROM registros').get();
  assert.equal(row.analise_status,'falhou');assert.equal(row.analise_erro,'Falha simulada');
  assert.equal(dbApi.iniciarAnalise(db,'DF000380/2026'),true);
  const extra={topicos:{reajuste:{resumo:'5%'}}};
  dbApi.atualizarArquivoEExtracao(db,'DF000380/2026','/arquivo.doc',extra);
  row=db.prepare('SELECT analise_status, analise_erro, extracao_json FROM registros').get();
  assert.equal(row.analise_status,'analisado');assert.equal(row.analise_erro,null);
  assert.deepEqual(JSON.parse(row.extracao_json),extra);
  dbApi.atualizarArquivoEExtracao(db,'DF000380/2026','/arquivo.doc',null);
  assert.equal(db.prepare('SELECT extracao_json FROM registros').get().extracao_json,row.extracao_json);
  db.close();
});

test('migra banco antigo sem apagar análises e recupera interrupção após reinício', () => {
  const dir=mkdtempSync(join(tmpdir(),'cct-status-')),path=join(dir,'legado.db');
  try {
    const old=new DatabaseSync(path);
    old.exec(`CREATE TABLE registros(numero_registro TEXT PRIMARY KEY, watch TEXT NOT NULL, extracao_json TEXT,
        primeira_vez TEXT NOT NULL DEFAULT (datetime('now')), notificado INTEGER DEFAULT 0);`);
    old.prepare('INSERT INTO registros(numero_registro,watch,extracao_json) VALUES(?,?,?)')
      .run('DF000381/2026','Teste','{"topicos":{}}');old.close();
    let db=dbApi.openDb(path);
    assert.equal(db.prepare('SELECT analise_status FROM registros').get().analise_status,'analisado');
    assert.equal(dbApi.iniciarAnalise(db,'DF000381/2026'),true);db.close();
    db=dbApi.openDb(path);
    const row=db.prepare('SELECT analise_status,analise_erro,extracao_json FROM registros').get();
    assert.equal(row.analise_status,'falhou');
    assert.match(row.analise_erro,/reinício/);
    assert.equal(row.extracao_json,'{"topicos":{}}');
    db.close();
  } finally {rmSync(dir,{recursive:true,force:true})}
});


