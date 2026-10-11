// Servidor real e navegador headless, banco e contas sintéticas. Não envia e-mails externos.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { chromium } from 'playwright';
import { criarSindicato, openDb } from '../dist-historico/db.js';
import { salvarUsuario, salvarEscritorio, vincularUsuarioEscritorio } from '../dist-historico/organizacoes.js';
import { hashBytes } from '../dist-historico/relatorios.js';
import { CAMPOS_CCT } from '../dist-historico/cct-template.js';

const root = resolve('data'); mkdirSync(root, { recursive: true });
const directory = mkdtempSync(join(root, 'auth-e2e-'));
assert.ok(directory.startsWith(root + sep));
const dbPath = join(directory, 'test.db');
const senha = 'Senha sintética longa para E2E';
const childEnv = { ...process.env, DB_PATH: dbPath, SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', MAIL_FROM: '', MAIL_TO: '', SLACK_WEBHOOK_URL: '', LLM_API_KEY: '', AUTH_PUBLIC_URL: '' };
let server, browser; let stderr = '';
const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const esperar = async fn => { const limite = Date.now() + 20000; let erro; while (Date.now() < limite) { try { return await fn(); } catch (e) { erro = e; await new Promise(resolve => setTimeout(resolve, 100)); } } throw erro; };
const api = (path, method = 'GET', dados, headers = {}) => fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: dados === undefined ? undefined : JSON.stringify(dados) });
try {
  execFileSync(process.execPath, ['dist/auth-cli.js', 'bootstrap', '--nome', 'Administrador Teste', '--email', 'admin@example.test'],
    { env: { ...childEnv, AUTH_BOOTSTRAP_PASSWORD: senha }, stdio: 'pipe', windowsHide: true });
  const db = openDb(dbPath);
  const hash = db.prepare('SELECT senha_hash FROM credenciais_usuarios').get().senha_hash;
  const operador = salvarUsuario(db, null, { nome: 'Operador Teste', email: 'operador@example.test' });
  const suporte = salvarUsuario(db, null, { nome: 'Suporte Teste', email: 'suporte@example.test' });
  for (const id of [operador, suporte]) db.prepare('INSERT INTO credenciais_usuarios(usuario_id,senha_hash,atualizado_em) VALUES (?,?,?)').run(id, hash, Date.now());
  vincularUsuarioEscritorio(db, operador, 1, 'operador');
  const escritorioB=salvarEscritorio(db,null,{nome:'Escritório B',cnpj:'04252011000110'});
  vincularUsuarioEscritorio(db,operador,escritorioB,'operador');
  criarSindicato(db,{nome:'Sindicato compartilhado',cnpj:'',categoria:'Filtro legado privado',uf:'DF',tipo:'Convenção Coletiva',vigencia:'Vigentes',titulo:'',ativo:true});
  db.prepare("INSERT INTO papeis_plataforma(usuario_id,papel) VALUES (?,'suporte')").run(suporte); db.close();
  server = spawn(process.execPath, ['dist-historico/server-sqlite-dev.js'], { env: { ...childEnv, UI_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  server.stdout.on('data', () => {}); server.stderr.on('data', chunk => { stderr += String(chunk); });
  await esperar(async () => { const r = await api('/api/auth/estado'); assert.equal(r.status, 200); });
  assert.equal((await api('/api/clientes')).status, 401);
  assert.equal((await api('/api/arquivo/DF000001%2F2026')).status, 401);
  assert.equal((await api('/api/relatorio-pdf/DF000001%2F2026')).status, 401);
  browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { channel: process.env.BROWSER_CHANNEL || 'chrome' }) });
  const contextoAdmin = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await contextoAdmin.newPage(); const erros = []; page.on('pageerror', erro => erros.push(erro.message));
  await page.goto(base); await page.getByRole('heading', { name: 'Acesse sua conta' }).waitFor();
  await page.locator('#login-form').getByLabel('E-mail', { exact: true }).fill('admin@example.test'); await page.getByLabel('Senha', { exact: true }).fill('incorreta');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await page.locator('#auth-mensagem').filter({ hasText: 'E-mail ou senha inválidos' }).waitFor();
  await page.getByLabel('Senha', { exact: true }).fill(senha); await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.locator('nav').getByRole('tab', { name: 'Clientes', exact: true }).waitFor();
  await page.locator('nav').getByRole('tab', { name: 'Clientes', exact: true }).click(); await page.getByRole('heading', { name: 'Clientes', exact: true }).waitFor();
  await page.getByLabel('Abrir escritório',{exact:true}).selectOption({label:'Escritório inicial'});
  await page.waitForURL('**/acesso?escritorio=1');assert.equal(await page.locator('#contexto option:checked').textContent(),'Escritório · Escritório inicial');
  await page.getByRole('button',{name:'Minha conta',exact:true}).click(); await page.getByRole('heading', { name: 'Seu perfil', exact: true }).waitFor();
  await page.getByLabel('Nome', { exact: true }).fill('Administrador Atualizado'); await page.getByRole('button', { name: 'Salvar nome' }).click();
  await page.locator('#auth-mensagem').filter({ hasText: 'Nome atualizado' }).waitFor();await page.getByRole('button',{name:'Administração da plataforma',exact:true}).click();  await page.getByRole('button',{name:'Novo escritório',exact:true}).click();await page.getByLabel('Nome do escritório').fill('Escritório E2E da plataforma');await page.getByLabel('CNPJ do escritório').fill('19131243000197');await page.getByRole('button',{name:'Salvar escritório'}).click();await page.locator('#auth-mensagem').filter({hasText:'Escritório salvo'}).waitFor();
  await page.getByRole('button', { name: 'Esqueci minha senha' }).count().then(n => assert.equal(n, 0));
  await page.getByRole('button',{name:'Minha conta',exact:true}).click();
  await page.getByRole('button', { name: 'Sair', exact: true }).click(); await page.getByRole('heading', { name: 'Acesse sua conta' }).waitFor();
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click(); await page.locator('#recuperacao-form').getByLabel('E-mail', { exact: true }).fill('inexistente@example.test');
  await page.getByRole('button', { name: 'Enviar instruções' }).click(); await page.locator('#auth-mensagem').filter({ hasText: 'Se houver uma conta ativa' }).waitFor();
  await page.getByRole('button', { name: 'Voltar para entrar' }).click();
  await page.locator('#login-form').getByLabel('E-mail', { exact: true }).fill('operador@example.test'); await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await page.getByRole('heading', { name: 'Área de trabalho', exact: true }).waitFor();
  await page.getByLabel('Escritório ou empresa').selectOption({ label: 'Escritório · Escritório inicial' }); 
  await page.locator('#contexto-selecionado').filter({ hasText: 'Contexto selecionado' }).waitFor();
  await page.locator('#workspace-feedback:popover-open').waitFor();
  assert.equal(await page.locator('#workspace-feedback').evaluate(el=>getComputedStyle(el).position),'fixed');
  await page.locator('#workspace-feedback').waitFor({state:'hidden',timeout:7000});
  assert.equal(await page.locator('#painel-global').isVisible(), false);
  assert.equal(await page.evaluate(async () => (await fetch('/api/clientes')).status), 403);
  await page.reload(); await page.locator('#contexto-selecionado').filter({ hasText: 'Contexto selecionado' }).waitFor();
  await page.getByRole('button',{name:'Cadastros',exact:true}).click();await page.locator('#cadastros-status').filter({hasText:'0 cliente(s) e 0 contato(s)'}).waitFor();
  await page.getByRole('button',{name:'Configurar sindicato',exact:true}).click();
  await page.getByLabel('Sindicato do catálogo',{exact:true}).selectOption({label:'Sindicato compartilhado'});
  await page.getByLabel('Nome da consulta',{exact:true}).fill('Consulta escritório A');await page.getByLabel('Filtro de categoria',{exact:true}).fill('Categoria privada A');
  await page.getByLabel('Palavra no título',{exact:true}).fill('Palavra privada A');await page.getByRole('button',{name:'Salvar configuração',exact:true}).click();
  await page.locator('#lista-monitoramentos-contexto tr').filter({hasText:'Consulta escritório A'}).waitFor();
  await page.getByRole('button',{name:'Novo contato',exact:true}).click();
  await page.getByLabel('Nome do contato',{exact:true}).fill('Contato escritório A');await page.getByLabel('E-mail do contato',{exact:true}).fill('comum@example.test');
  await page.getByRole('button',{name:'Salvar contato',exact:true}).click();await page.locator('#cadastros-status').filter({hasText:'1 contato(s)'}).waitFor();
  await page.getByRole('button',{name:'Novo cliente',exact:true}).click();await page.getByLabel('Razão social',{exact:true}).fill('Empresa do escritório A');await page.getByLabel('CNPJ',{exact:true}).fill('00000000000000');
  await page.getByRole('button',{name:'Salvar cliente',exact:true}).click();
  await page.locator('dialog[open] #workspace-feedback[data-error=true]').waitFor();
  assert.equal(await page.locator('#workspace-feedback').evaluate(el=>el.hasAttribute('popover')),false);
  await page.getByLabel('CNPJ',{exact:true}).fill('11222333000181');
  await page.getByLabel('Contatos vinculados',{exact:true}).selectOption({label:'Contato escritório A · comum@example.test'});
  await page.getByLabel('Sindicatos do cliente',{exact:true}).selectOption({label:'Sindicato compartilhado'});
  await page.getByRole('button',{name:'Salvar cliente',exact:true}).click();await page.locator('#cadastros-status').filter({hasText:'1 cliente(s) e 1 contato(s)'}).waitFor();
  await page.getByRole('searchbox',{name:'Buscar clientes',exact:true}).fill('sem correspondencia');
  assert.equal(await page.locator('#lista-clientes-contexto tr').isVisible(),false);
  await page.getByRole('searchbox',{name:'Buscar clientes',exact:true}).fill('11222333000181');
  assert.equal(await page.locator('#lista-clientes-contexto tr').isVisible(),true);
  await page.getByRole('searchbox',{name:'Buscar clientes',exact:true}).fill('');
  await page.setViewportSize({width:1920,height:1080});await page.emulateMedia({colorScheme:'dark'});
  await page.screenshot({path:resolve('data/ui-escritorio-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:resolve('data/ui-escritorio-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1280,height:900});await page.emulateMedia({colorScheme:'light'});
  const compatibilidade=openDb(dbPath),clienteLegado=compatibilidade.prepare('SELECT id FROM clientes WHERE escritorio_id=1').get().id;
  const sindicatoTardio=criarSindicato(compatibilidade,{nome:'Sindicato vínculo anterior',cnpj:'',categoria:'Categoria histórica',uf:'DF',tipo:'Convenção Coletiva',vigencia:'Vigentes',titulo:'',ativo:true});
  compatibilidade.prepare('INSERT INTO clientes_sindicatos(cliente_id,sindicato_id,enquadramento_confirmado) VALUES (?,?,1)').run(clienteLegado,sindicatoTardio);
  const numeroDocumento='DF000001/2026',original=Buffer.from('%PDF-1.4\nOriginal sintético para documento por escritório'),arquivo=join(directory,'original.pdf');writeFileSync(arquivo,original);
  const sindicatoPublico=compatibilidade.prepare("SELECT id FROM sindicatos WHERE nome='Sindicato compartilhado'").get().id;
  compatibilidade.prepare('INSERT INTO registros(numero_registro,watch,tipo,vigencia,arquivo_path,arquivo_hash) VALUES (?,?,?,?,?,?)').run(numeroDocumento,'Consulta global privada','Convenção Coletiva','2026',arquivo,hashBytes(original));
  compatibilidade.prepare('INSERT INTO registros_sindicatos(numero_registro,sindicato_id) VALUES (?,?)').run(numeroDocumento,sindicatoPublico);compatibilidade.close();
  await page.locator('#lista-clientes-contexto tr').getByRole('button',{name:'Documentos',exact:true}).click();
  await page.locator('#documentos-status').filter({hasText:'Nenhum documento relacionado'}).waitFor();
  await page.getByRole('button',{name:'Atualizar documentos',exact:true}).click();await page.locator('#lista-documentos-contexto li').filter({hasText:numeroDocumento}).waitFor();
  const downloadPendente=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar original',exact:true}).click();const download=await downloadPendente;assert.equal(await download.failure(),null);
  await page.getByRole('button',{name:'Decidir aplicabilidade',exact:true}).click();assert.equal(await page.getByLabel('Responsável pela decisão',{exact:true}).inputValue(),'Operador Teste');
  await page.getByLabel('Justificativa da decisão',{exact:true}).fill('Conferência do escritório A');await page.getByRole('button',{name:'Registrar decisão',exact:true}).click();
  await page.locator('#lista-documentos-contexto li').filter({hasText:'Aplicabilidade confirmada'}).waitFor();
  await page.getByRole('button',{name:'Fechar documentos',exact:true}).click();
  await page.locator('#lista-clientes-contexto tr').filter({hasText:'Empresa do escritório A'}).getByRole('button',{name:'Editar',exact:true}).click();
  await page.getByLabel('Sindicatos do cliente',{exact:true}).locator('option').filter({hasText:'Sindicato vínculo anterior'}).waitFor({state:'attached'});
  assert.equal(await page.getByLabel('Sindicatos do cliente',{exact:true}).locator('option:checked').count(),2);
  await page.getByLabel('Situação do cliente',{exact:true}).selectOption('false');await page.getByRole('button',{name:'Salvar cliente',exact:true}).click();
  await page.locator('#lista-clientes-contexto tr').filter({hasText:'Inativo'}).waitFor();
  page.once('dialog',d=>d.accept());await page.locator('#lista-monitoramentos-contexto tr').getByRole('button',{name:'Excluir',exact:true}).click();
  await page.locator('#auth-mensagem').filter({hasText:'Inative o monitoramento'}).waitFor();
  page.once('dialog',d=>d.accept());await page.locator('#lista-contatos-contexto tr').getByRole('button',{name:'Excluir',exact:true}).click();
  await page.locator('#auth-mensagem').filter({hasText:'Inative-o'}).waitFor();
  await page.getByLabel('Escritório ou empresa').selectOption({label:'Escritório · Escritório B'});
  await page.locator('#cadastros-status').filter({hasText:'0 cliente(s) e 0 contato(s)'}).waitFor();
  assert.equal(await page.locator('#lista-clientes-contexto tr[data-empty=true]').count(),1);
  assert.equal(await page.locator('#lista-monitoramentos-contexto').textContent().then(t=>t.includes('privada A')),false);
  await page.getByRole('button',{name:'Configurar sindicato',exact:true}).click();await page.getByLabel('Sindicato do catálogo',{exact:true}).selectOption({label:'Sindicato compartilhado'});
  await page.getByLabel('Nome da consulta',{exact:true}).fill('Consulta escritório B');await page.getByLabel('Filtro de categoria',{exact:true}).fill('Categoria privada B');
  await page.getByRole('button',{name:'Salvar configuração',exact:true}).click();await page.locator('#lista-monitoramentos-contexto tr').filter({hasText:'Consulta escritório B'}).waitFor();
  await page.getByRole('button',{name:'Novo cliente',exact:true}).click();await page.getByLabel('Razão social',{exact:true}).fill('Empresa do escritório B');await page.getByLabel('CNPJ',{exact:true}).fill('11444777000161');
  await page.getByLabel('Sindicatos do cliente',{exact:true}).selectOption({label:'Sindicato compartilhado'});await page.getByRole('button',{name:'Salvar cliente',exact:true}).click();
  await page.locator('#lista-clientes-contexto tr').filter({hasText:'Empresa do escritório B'}).getByRole('button',{name:'Documentos',exact:true}).click();await page.getByRole('button',{name:'Atualizar documentos',exact:true}).click();
  await page.locator('#lista-documentos-contexto li').filter({hasText:'Conferir aplicabilidade'}).waitFor();assert.equal(await page.locator('#lista-documentos-contexto').textContent().then(t=>t.includes('Conferência do escritório A')),false);
  await page.getByRole('button',{name:'Decidir aplicabilidade',exact:true}).click();await page.getByLabel('Aplicabilidade',{exact:true}).selectOption('rejeitado');await page.getByLabel('Justificativa da decisão',{exact:true}).fill('Decisão do escritório B');await page.getByRole('button',{name:'Registrar decisão',exact:true}).click();
  await page.locator('#lista-documentos-contexto li').filter({hasText:'Não se aplica'}).waitFor();await page.getByRole('button',{name:'Fechar documentos',exact:true}).click();
  await page.getByRole('button',{name:'Novo contato',exact:true}).click();await page.getByLabel('Nome do contato',{exact:true}).fill('Contato escritório B');await page.getByLabel('E-mail do contato',{exact:true}).fill('comum@example.test');
  await page.getByRole('button',{name:'Salvar contato',exact:true}).click();await page.locator('#lista-contatos-contexto tr').filter({hasText:'Contato escritório B'}).waitFor();
  assert.equal(await page.locator('#lista-contatos-contexto').textContent().then(t=>t.includes('Contato escritório A')),false);
  const outraAba=await contextoAdmin.newPage();await outraAba.goto(base+'/acesso');await outraAba.getByLabel('Escritório ou empresa').selectOption({label:'Escritório · Escritório inicial'});
  await outraAba.getByRole('button',{name:'Cadastros',exact:true}).click();await outraAba.locator('#lista-clientes-contexto tr').filter({hasText:'Empresa do escritório A'}).waitFor();
  await outraAba.locator('#lista-monitoramentos-contexto tr').filter({hasText:'Categoria privada A'}).waitFor();
  await outraAba.locator('#lista-clientes-contexto tr').getByRole('button',{name:'Documentos',exact:true}).click();await outraAba.locator('#lista-documentos-contexto li').filter({hasText:'Conferência do escritório A'}).waitFor();
  assert.equal(await outraAba.locator('#lista-documentos-contexto').textContent().then(t=>t.includes('Decisão do escritório B')),false);
  assert.equal(await page.locator('#lista-monitoramentos-contexto').textContent().then(t=>t.includes('Categoria privada A')),false);
  assert.equal(await page.locator('#lista-clientes-contexto').textContent().then(t=>t.includes('Empresa do escritório A')),false);await outraAba.close();
  page.once('dialog',d=>d.accept());await page.locator('#lista-contatos-contexto tr').getByRole('button',{name:'Excluir',exact:true}).click();await page.locator('#cadastros-status').filter({hasText:'0 contato(s)'}).waitFor();
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Configurar sindicato',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:'Cancelar configuração',exact:true}).click();await page.setViewportSize({width:1280,height:900});
  await page.getByRole('button',{name:'Minha conta',exact:true}).click();
  await page.getByRole('button', { name: 'Sair', exact: true }).click(); await page.getByRole('heading', { name: 'Acesse sua conta' }).waitFor();
  await page.locator('#login-form').getByLabel('E-mail', { exact: true }).fill('suporte@example.test'); await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await page.getByRole('heading', { name: 'Área de trabalho', exact: true }).waitFor();
  await page.getByLabel('Escritório ou empresa').selectOption({ label: 'Escritório · Escritório inicial' });
   
  await page.locator('#contexto-selecionado').filter({ hasText: 'acesso administrativo' }).waitFor();
  await page.getByRole('button',{name:'Cadastros',exact:true}).click();await page.locator('#cadastros-status').filter({hasText:'Acesso somente para consulta'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Novo cliente',exact:true}).isVisible(),false);
  assert.equal(await page.locator('#lista-clientes-contexto').getByRole('button',{name:'Editar',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Configurar sindicato',exact:true}).isVisible(),false);
  await page.locator('#lista-clientes-contexto tr').getByRole('button',{name:'Documentos',exact:true}).click();await page.locator('#lista-documentos-contexto li').filter({hasText:'Conferência do escritório A'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Atualizar documentos',exact:true}).isVisible(),false);assert.equal(await page.getByRole('button',{name:'Decidir aplicabilidade',exact:true}).count(),0);
  assert.equal(await page.evaluate(async () => (await fetch('/api/registros')).status), 403);
  await page.getByRole('button',{name:'Minha conta',exact:true}).click();await page.getByRole('button', { name: 'Encerrar acesso administrativo' }).click();await page.keyboard.press('Escape'); await page.locator('#contexto-selecionado').filter({ hasText: 'encerrado' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(erros, []);
  const conferencia = openDb(dbPath);
  assert.equal(conferencia.prepare("SELECT ator_id FROM auditoria_seguranca WHERE acao='SUPORTE_CONTEXTO_INICIADO' AND ator_id=?").get(suporte).ator_id, suporte);
  assert.equal(conferencia.prepare("SELECT nome FROM usuarios WHERE email='admin@example.test'").get().nome, 'Administrador Atualizado');
  assert.equal(conferencia.prepare("SELECT COUNT(*) n FROM clientes_documentos WHERE incluir_envio<>0").get().n,0);
  assert.equal(conferencia.prepare("SELECT COUNT(*) n FROM auditoria_seguranca WHERE acao='APLICABILIDADE_DECIDIDA' AND ator_id=?").get(operador).n,2);conferencia.close();
  execFileSync(process.execPath, ['dist/auth-cli.js', 'redefinir', '--email', 'operador@example.test'],
    { env: { ...childEnv, AUTH_RESET_PASSWORD: 'Nova senha sintética longa de teste' }, stdio: 'pipe', windowsHide: true });
  const antigo = await api('/api/auth/login', 'POST', { email: 'operador@example.test', senha }); assert.equal(antigo.status, 401);
  const novo = await api('/api/auth/login', 'POST', { email: 'operador@example.test', senha: 'Nova senha sintética longa de teste' }); assert.equal(novo.status, 200);
  console.log('OK: bootstrap, login/erro/logout, perfil, recuperação, CRUD por escritório, e-mail repetido, inativação, exclusão com histórico, duas abas, suporte somente leitura e bloqueio do legado.');
} catch(error) {
  console.error('Falha na jornada:',error);
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) { const encerrado = once(server, 'exit'); server.kill(); await encerrado; }
  assert.ok(resolve(directory).startsWith(root + sep));
  rmSync(directory, { recursive: true, force: true, maxRetries:10, retryDelay:100 });
  if (stderr && /Error|erro/i.test(stderr)) console.error(stderr);
}














