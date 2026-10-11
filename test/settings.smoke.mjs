// Teste offline da configuração SQLite. Não usa serviços externos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';

const src = readFileSync(new URL('../dist/settings.js', import.meta.url), 'utf8');
const withEnv = src.replace('import { env } from \'./config.js\';', `const env = {
  headless:true,
  slackWebhook:'https://hooks.slack.com/services/OLD/LEGACY/SECRET',
  smtp:{host:'smtp.legado.com',port:587,user:'old',pass:'old-secret',from:'old@empresa.com',to:'rh@empresa.com'}
};`);
assert.notEqual(withEnv, src, 'import do env esperado');
const settings = await import('data:text/javascript;base64,' + Buffer.from(withEnv).toString('base64'));
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE ajustes(chave TEXT PRIMARY KEY, valor TEXT NOT NULL)');
const n = {slack:{ativo:true,webhook:'https://hooks.slack.com/services/NEW/ONE/SECRET'}, email:{ativo:true,host:'smtp.exemplo.com',port:465,secure:true,user:'conta',password:'secreto',from:'monitor@empresa.com',to:'rh@empresa.com'}};

test('migração: configuração .env antiga é fallback antes de salvar', () => {
  assert.equal(settings.lerNotificacoes(db).email.host, 'smtp.legado.com');
  assert.equal(settings.lerAgendamento(db).cron, '0 8 * * 1-5');
  assert.equal(settings.lerAgendamento(db).timezone, 'server');
});
test('notificações persistem no SQLite, sem retornar segredos à UI', () => {
  settings.salvarNotificacoes(db,n);
  assert.equal(settings.lerNotificacoes(db).email.password, 'secreto');
  const seen = settings.vistaNotificacoes(settings.lerNotificacoes(db));
  assert.equal(seen.email.temSenha,true);
  assert.equal(seen.slack.temWebhook,true);
  assert.equal(JSON.stringify(seen).includes('secreto'),false);
  assert.equal(JSON.stringify(seen).includes('NEW/ONE'),false);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM ajustes WHERE chave='notificacoes'").get().n,1);
});
test('editar preserva segredo vazio e permite desativar canal mesmo havendo .env', () => {
  settings.salvarNotificacoes(db,{slack:{ativo:false,webhook:''},email:{...n.email,ativo:false,password:''}});
  const cfg=settings.lerNotificacoes(db);
  assert.equal(cfg.slack.ativo,false);
  assert.equal(cfg.email.ativo,false);
  assert.equal(cfg.email.password,'secreto');
});
test('remover segredos explicitamente funciona', () => {
  settings.salvarNotificacoes(db,{slack:{ativo:false,limparWebhook:true},email:{...n.email,ativo:false,limparSenha:true}});
  assert.equal(settings.lerNotificacoes(db).slack.webhook,'');
  assert.equal(settings.lerNotificacoes(db).email.password,'');
});
test('agenda e timezone são persistidos, preservando schema antigo', () => {
  settings.salvarAgendamento(db,{ativo:true,cron:'30 9 * * 1,3,5',timezone:'America/Sao_Paulo'});
  assert.deepEqual(settings.lerAgendamento(db),{ativo:true,cron:'30 9 * * 1,3,5',timezone:'America/Sao_Paulo'});
  db.prepare("UPDATE ajustes SET valor=? WHERE chave='agendamento'").run(JSON.stringify({ativo:false,cron:'0 8 * * 1-5'}));
  assert.equal(settings.lerAgendamento(db).timezone,'server');
});
test('navegador: headless é padrão e a escolha fica persistida no SQLite', () => {
  assert.equal(settings.lerNavegador(db).headless, true);
  assert.deepEqual(settings.salvarNavegador(db,{headless:false}),{headless:false});
  assert.equal(settings.lerNavegador(db).headless, false);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM ajustes WHERE chave='navegador'").get().n,1);
  settings.salvarNavegador(db,{headless:true});
  assert.equal(settings.lerNavegador(db).headless,true);
});
test('UI contém formulários, dias da semana, botões de teste e máscara de senha', () => {
  const html=readFileSync(new URL('../web/index.html', import.meta.url),'utf8');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  new vm.Script(script);
  for (const id of ['agf','nf','n-slack-webhook','n-host','n-user','n-pass','n-from','n-to','ag-freq','ag-time','ag-tz','browserMode'])
    assert.match(html,new RegExp(id));
  assert.match(html,/api\/notificacoes\/testar/);
  assert.match(html,/api\/agendamento/);
  assert.match(html,/api\/navegador/);
  assert.match(html,/data-act=\\?"revelar/);
});

test('configuração persiste após fechar e reabrir arquivo SQLite', () => {
  const directory=mkdtempSync(join(tmpdir(),'mediador-setting-'));
  try {
    const file=join(directory,'config.db');
    const d1=new DatabaseSync(file);
    d1.exec('CREATE TABLE ajustes(chave TEXT PRIMARY KEY, valor TEXT NOT NULL)');
    settings.salvarAgendamento(d1,{ativo:true,cron:'45 17 * * 1-5',timezone:'America/Sao_Paulo'});
    settings.salvarNotificacoes(d1,n);
    settings.salvarNavegador(d1,{headless:false});
    d1.close();
    const d2=new DatabaseSync(file);
    assert.equal(settings.lerAgendamento(d2).cron,'45 17 * * 1-5');
    assert.equal(settings.lerNotificacoes(d2).email.to,'rh@empresa.com');
    assert.equal(settings.lerNavegador(d2).headless,false);
    d2.close();
  } finally {rmSync(directory,{recursive:true,force:true});}
});

test('layout de Configurações gera formulários completos com dados do SQLite', async () => {
  const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  const start=script.indexOf('const PRESETS='),end=script.indexOf('const lbody=',start);
  assert.ok(start>-1&&end>start);
  const values={
    '/api/llm':{ativo:true,baseUrl:'http://localhost:3330/v1',model:'capability-reviewer',temChave:true,chaveFinal:'1234'},
    '/api/agendamento':{ativo:true,cron:'0 8 * * 1-5',timezone:'America/Sao_Paulo'},
    '/api/notificacoes':settings.vistaNotificacoes(settings.lerNotificacoes(db)),
    '/api/navegador':{headless:true}
  };
  const context=vm.createContext({api:async path=>values[path],esc:s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')});
  vm.runInContext(script.slice(start,end)+'\nthis.view=viewConfig;',context);
  const result=await context.view();
  for(const id of ['lf','agf','nf','n-slack-webhook','n-pass','ag-freq','ag-time','ag-tz'])
    assert.ok(result.includes('id="'+id+'"'),id);
  assert.match(result,/name="browserMode" value="headless" checked/);
  assert.match(result,/America\/Sao_Paulo/);
  assert.match(result,/Dias úteis/);
  assert.doesNotMatch(result,/OLD\/LEGACY\/SECRET/);
});
