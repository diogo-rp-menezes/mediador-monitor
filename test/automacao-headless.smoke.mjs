import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = name => readFileSync(new URL(name, import.meta.url),'utf8');
const scraper = src('../src/scraper.ts');
const runner = src('../src/monitoring/runner.ts');
const server = src('../src/server-sqlite-dev.ts');
const ui = src('../web/index.html');
const distScraper = src('../dist-historico/scraper.js');

// Exercita a função real emitida pelo TypeScript, sem inicializar o Playwright.
const from = distScraper.indexOf('export async function fecharSessao(');
assert.ok(from >= 0);
const fechar = vm.runInNewContext(
  distScraper.slice(from).replace('export async function fecharSessao(', 'async function fecharSessao(') + '\nfecharSessao;',
  { logDefault: () => {} }
);

test('fechamento limpa todas as guias e encerra o navegador na ordem correta', async () => {
  const passos=[];
  await fechar({context:{close:async()=>{passos.push('context');}},browser:{close:async()=>{passos.push('browser');}}},()=>{});
  assert.deepEqual(passos,['context','browser']);
});

test('navegador é encerrado mesmo quando fechar o contexto produz erro', async () => {
  const passos=[], logs=[];
  await fechar({context:{close:async()=>{passos.push('context');throw new Error('falha');}},browser:{close:async()=>{passos.push('browser');}}},m=>logs.push(m));
  assert.deepEqual(passos,['context','browser']);
  assert.ok(logs.some(m=>m.includes('falha')));
});

test('consultas sucessivas descartam popups da pesquisa anterior e fecham ao final', () => {
  assert.match(scraper,/janela !== sessao\.page && !janela\.isClosed\(\)/);
  assert.match(scraper,/await janela\.close\(\)/);
  assert.match(runner,/await fecharSessao\(sessao, log\)/);
  assert.match(runner,/\} finally \{/);
});

test('não há checkpoints obrigatórios nem endpoint continuar na execução', () => {
  assert.doesNotMatch(scraper,/\.checkpoint\(/);
  assert.doesNotMatch(runner,/\.gate/);
  assert.doesNotMatch(server,/\/api\/continuar/);
  assert.doesNotMatch(ui, /id="next"|\/api\/continuar|supervisionado:true/);
});

test('configuração headless é lida do SQLite e aplicada a execuções manuais e cron', () => {
  assert.match(server,/headless: lerNavegador\(db\)\.headless/);
  assert.match(server,/executar\('check'\)/);
  assert.match(runner,/abrirSessao\(modoHeadless\)/);
  assert.match(ui,/name="browserMode" value="headless"/);
  assert.match(ui,/\/api\/navegador/);
});

test('interromper cancela requisições e fecha o contexto sem depender de pausa',()=>{
  assert.match(server,/job\.controller\.abort\(\)/);
  assert.match(runner,/addEventListener\('abort', onAbort/);
  assert.match(runner,/sessao\.context\.close\(\)/);
});

test('Cloudflare provoca erro explícito e não é contornado ou aguardado por 10 minutos',()=>{
  assert.match(scraper,/throw new Error\('MTE solicitou verificação humana/);
  assert.doesNotMatch(scraper,/10 \* 60_000/);
});


