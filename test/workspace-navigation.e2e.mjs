import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const html=readFileSync('web/acesso.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  await page.route('http://workspace.test/**',route=>{
    const path=new URL(route.request().url()).pathname;
    route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/html',body:path.endsWith('.css')?readFileSync(resolve('web',path.slice(1)),'utf8'):html});
  });
  await page.goto('http://workspace.test/');
  await page.addScriptTag({path:resolve('web/workspace-ui.js')});
  await page.evaluate(()=>document.getElementById('gestao-plataforma').textContent='Escritórios da plataforma');
  const visible=async area=>page.locator('#area-'+area).isVisible();
  assert.equal(await visible('inicio'),true);
  await page.getByRole('button',{name:'Gerenciar clientes',exact:true}).click();
  assert.equal(await visible('cadastros'),false,'Atalho sem contexto não abre cadastro');
  const session={usuario:{nome:'Diogo Teste',papel_plataforma:'administrador_plataforma'},capacidades:{ia_plataforma:true,monitoramento_execucoes:true}};
  await page.evaluate(session=>window.dispatchEvent(new CustomEvent('mediador:sessao',{detail:session})),session);
  await page.evaluate(session=>window.dispatchEvent(new CustomEvent('mediador:contexto',{detail:{contexto:{tipo:'escritorio',papel:'administrador'},sessao:session}})),session);
  await page.evaluate(()=>document.getElementById('cadastros-escritorio').hidden=false);
  await page.getByRole('button',{name:'Gerenciar clientes',exact:true}).click();
  assert.equal(await visible('cadastros'),true);
  await page.evaluate(()=>window.dispatchEvent(new Event('mediador:limpar')));
  assert.equal(await visible('cadastros'),false);assert.equal(await visible('inicio'),true);
  await page.getByRole('button',{name:'Minha conta',exact:true}).click();
  await page.evaluate(()=>document.getElementById('painel-global').hidden=false);
  await page.getByRole('link',{name:'Administração da plataforma',exact:true}).click();
  assert.equal(await visible('plataforma'),true);assert.equal(await page.locator('dialog[open]').count(),0);
  await page.evaluate(session=>window.dispatchEvent(new CustomEvent('mediador:sessao',{detail:{...session,usuario:{nome:'Operador',papel_plataforma:null}}})),session);
  assert.equal(await visible('plataforma'),false);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('mediador:navegar',{detail:{area:'plataforma'}})));
  assert.equal(await visible('plataforma'),false);
  await page.evaluate(()=>{const status=document.getElementById('auth-mensagem');status.dataset.erro='false';status.textContent='Escritório alterado.';});
  await page.getByText('Escritório alterado.',{exact:true}).waitFor();
  assert.equal(await page.locator('#workspace-feedback').evaluate(node=>node.matches(':popover-open')),true);
  await page.getByRole('button',{name:'Fechar notificação',exact:true}).click();
  await page.evaluate(()=>document.getElementById('cliente-contexto-form').hidden=false);
  await page.getByRole('dialog',{name:'Novo cliente',exact:true}).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(),0);
  assert.equal(await page.locator('#cliente-contexto-form').evaluate(node=>node.hidden),true);
  assert.deepEqual(errors,[]);
  console.log('OK: atalhos respeitam contexto, navegação limpa ao trocar, administração atual e toast/modal.');
}finally{await browser.close();}
