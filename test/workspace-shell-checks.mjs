import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {resolve,extname,join} from 'node:path';

export async function validarEstruturaWorkspace(page){
  const directory=process.env.MEDIADOR_UI_VISUAL_DIR&&resolve(process.env.MEDIADOR_UI_VISUAL_DIR);
  if(directory)mkdirSync(directory,{recursive:true});
  async function capture(name){if(directory)await page.screenshot({path:join(directory,name+'.png'),fullPage:true});}
  await page.setViewportSize({width:1440,height:1000});
  await capture('shell-desktop');
  await page.getByRole('button',{name:'Recolher barra lateral'}).click();
  await page.getByLabel('Seu espaço de trabalho').waitFor();
  await page.getByRole('button',{name:'Sair',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Cadastros',exact:true}).getAttribute('title'),'Cadastros');
  await capture('shell-recolhida');
  await page.reload();
  await page.getByRole('button',{name:'Expandir barra lateral'}).waitFor();
  await page.getByRole('button',{name:'Cadastros',exact:true}).click();
  await page.getByRole('table').waitFor();
  await page.getByRole('button',{name:'Expandir barra lateral'}).click();
  await page.setViewportSize({width:390,height:844});
  const trigger=page.getByRole('button',{name:'Abrir menu'});
  await trigger.click();
  const drawer=page.getByRole('dialog',{name:'Menu principal'});
  await drawer.waitFor();
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
  assert.equal(await drawer.evaluate(element=>element.contains(document.activeElement)),true);
  for(let i=0;i<14;i++){
    await page.keyboard.press(i%2?'Shift+Tab':'Tab');
    assert.equal(await drawer.evaluate(element=>element.contains(document.activeElement)),true);
  }
  await capture('shell-mobile-menu');
  await page.keyboard.press('Escape');
  await drawer.waitFor({state:'hidden'});
  assert.equal(await trigger.evaluate(element=>document.activeElement===element),true);
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
  await trigger.click();
  await drawer.getByRole('button',{name:'Documentos',exact:true}).click();
  await drawer.waitFor({state:'hidden'});
  await trigger.click();
  await drawer.getByRole('button',{name:'Trocar espaço de trabalho',exact:true}).click();
  await drawer.waitFor({state:'hidden'});
  assert.equal(await page.getByLabel('Seu espaço de trabalho').evaluate(element=>document.activeElement===element),true);
  await trigger.click();
  await page.mouse.click(380,400);
  await drawer.waitFor({state:'hidden'});
  await capture('shell-mobile');
  await trigger.click();
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Recolher barra lateral'}).waitFor();
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
  assert.equal(await page.getByRole('dialog',{name:'Menu principal'}).count(),0);
  await page.getByRole('button',{name:'Cadastros',exact:true}).click();
  await page.getByRole('table').waitFor();
  console.log('OK: estrutura real — recolhimento persistido, contexto/saída acessíveis, foco nativo, Escape, backdrop, navegação e resize móvel.');
}

/** Runs against the authenticated PostgreSQL fixture, retaining its validated context. */
export async function validarNavegacaoAreas(page,{restricted=false}={}){
  const heading=name=>page.getByRole('heading',{name,exact:true,level:1});
  await page.getByRole('button',{name:'Cadastros',exact:true}).click();
  assert.equal(new URL(page.url()).hash,'#/cadastros');
  await page.getByRole('button',{name:'Minha conta',exact:true}).click();
  await heading('Minha conta').waitFor();
  await page.goBack();await heading('Cadastros').waitFor();
  await page.goForward();await heading('Minha conta').waitFor();
  await page.reload();await heading('Minha conta').waitFor();
  const current=await page.evaluate(()=>sessionStorage.getItem('mediador_contexto'));
  await page.goto(page.url().split('#')[0]+'#/cadastros');
  await heading('Cadastros').waitFor();await page.getByRole('table').waitFor();
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('mediador_contexto')),current);
  for(const hash of restricted?['#/gestao','#/plataforma','#/desconhecida','#malformado']:['#/desconhecida','#malformado']){
    await page.evaluate(hash=>{location.hash=hash;},hash);
    await heading('Visão geral').waitFor();
    await page.waitForURL(url=>url.hash==='#/inicio');
  }
  await page.getByRole('button',{name:'Cadastros',exact:true}).click();
  await page.getByRole('table').waitFor();
  console.log('OK: hash direto/recarga, voltar/avançar, contexto validado e fallback de área inválida ou proibida.');
}

/** Failure paths are controlled here; successful authorization/persistence is tested on PostgreSQL. */
export async function validarFalhasContexto(browser){
  const context=await browser.newContext();
  try{
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    let rejectEnd=true,rejectLogout=true,starts=0,ends=0,logouts=0;
    const grant='11111111-1111-4111-8111-111111111111';
    await page.route('http://shell.test/**',async route=>{
      const request=route.request(),url=new URL(request.url());
      const json=data=>route.fulfill({json:data});
      if(url.pathname==='/api/auth/sessao')return json({csrf:'csrf-shell',usuario:{nome:'Suporte de conferência',email:'suporte@example.invalid',papel_plataforma:'suporte'},contextos:{escritorios:[{id:1,nome:'Escritório A',membro:false},{id:2,nome:'Escritório B',membro:false}],clientes:[]}});
      if(request.method()==='POST')assert.equal(request.headers()['x-csrf-token'],'csrf-shell');
      if(url.pathname==='/api/auth/suporte/iniciar'){
        starts++;return json({contexto:{tipo:'escritorio',escritorio_id:request.postDataJSON().escritorio_id,cliente_id:null,papel:'suporte',concessao:grant}});
      }
      if(url.pathname==='/api/auth/suporte/encerrar'){
        ends++;assert.equal(request.postDataJSON().concessao,grant);
        return rejectEnd?route.fulfill({status:503,json:{erro:'Encerramento temporariamente indisponível.'}}):json({ok:true});
      }
      if(url.pathname==='/api/auth/logout'){
        logouts++;return rejectLogout?route.fulfill({status:503,json:{erro:'Saída temporariamente indisponível.'}}):json({ok:true});
      }
      if(url.pathname==='/api/contexto/clientes')return json([{id:1,razao_social:'Empresa isolada',cnpj:'11222333000181',ativo:true}]);
      if(url.pathname==='/login')return route.fulfill({contentType:'text/html',body:'<h1>Acesso</h1>'});
      const asset=url.pathname==='/app/'?'index.html':url.pathname.slice(5);
      return route.fulfill({body:readFileSync(resolve('web/vue',asset)),contentType:extname(asset)==='.js'?'text/javascript':extname(asset)==='.css'?'text/css':'text/html'});
    });
    await page.goto('http://shell.test/app/');
    const selector=page.getByLabel('Seu espaço de trabalho');
    await selector.selectOption('0');
    await page.getByRole('button',{name:'Cadastros',exact:true}).click();
    await page.getByText('Empresa isolada',{exact:true}).waitFor();
    await selector.selectOption('1');
    await page.getByRole('alert').getByText('Encerramento temporariamente indisponível.').waitFor();
    assert.equal(starts,1);assert.equal(ends,1);
    assert.equal(await selector.inputValue(),'0');
    assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mediador_contexto')).concessao),grant);
    await page.getByText('Empresa isolada',{exact:true}).waitFor();
    rejectEnd=false;
    await selector.selectOption('');
    await page.getByRole('status').getByText('Acesso de suporte encerrado.').waitFor();
    assert.equal(ends,2);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('mediador_contexto')),null);
    assert.equal(await page.getByRole('button',{name:'Cadastros',exact:true}).count(),0);
    await selector.selectOption('0');
    await page.getByRole('button',{name:'Encerrar acesso de suporte'}).click();
    await page.getByRole('status').getByText('Acesso de suporte encerrado.').waitFor();
    assert.equal(ends,3);
    await page.getByRole('button',{name:'Sair',exact:true}).click();
    await page.getByRole('alert').getByText('Saída temporariamente indisponível.').waitFor();
    assert.equal(await page.getByRole('button',{name:'Sair',exact:true}).isEnabled(),true);
    rejectLogout=false;
    await page.getByRole('button',{name:'Sair',exact:true}).click();
    await page.waitForURL('http://shell.test/login');
    assert.equal(logouts,2);assert.deepEqual(errors,[]);
    console.log('OK: falhas de encerramento e logout permitem retry; nenhum novo grant antes do encerramento; limpar seletor e botão encerram suporte.');
  }finally{await context.close();}
}
