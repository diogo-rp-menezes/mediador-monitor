import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';

/** Optional visual evidence from real pages in the disposable HTTPS journey. */
export async function capturarMinhaConta(page){
  if(!process.env.MEDIADOR_UI_VISUAL_DIR)return;
  const directory=resolve(process.env.MEDIADOR_UI_VISUAL_DIR);mkdirSync(directory,{recursive:true});
  const previous=await page.evaluate(()=>document.documentElement.dataset.theme);
  for(const theme of ['light','dark']){
    if(await page.evaluate(()=>document.documentElement.dataset.theme)!==theme)await page.getByRole('button',{name:theme==='light'?'Ativar tema claro':'Ativar tema escuro'}).click();
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:width===390?844:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:join(directory,`${theme}-${width}-minha-conta.png`),fullPage:true});
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  if(await page.evaluate(()=>document.documentElement.dataset.theme)!==previous)await page.getByRole('button',{name:previous==='light'?'Ativar tema claro':'Ativar tema escuro'}).click();
}

export async function capturarUiIntegrada(page){
  if(!process.env.MEDIADOR_UI_VISUAL_DIR)return;
  const directory=resolve(process.env.MEDIADOR_UI_VISUAL_DIR);
  mkdirSync(directory,{recursive:true});
  const previous=await page.evaluate(()=>document.documentElement.dataset.theme);
  const closeToast=page.getByRole('button',{name:'Fechar notificação'});
  if(await closeToast.count())await closeToast.click();
  for(const theme of ['light','dark']){
    if(await page.evaluate(()=>document.documentElement.dataset.theme)!==theme){
      await page.getByRole('button',{name:theme==='light'?'Ativar tema claro':'Ativar tema escuro'}).click();
    }
    for(const width of [1440,390]){
      await page.setViewportSize({width:1440,height:1000});
      await page.getByRole('button',{name:'Cadastros',exact:true}).click();
      await page.getByText('Empresa HTTPS A',{exact:true}).waitFor();
      await page.setViewportSize({width,height:width===390?844:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:join(directory,`${theme}-${width}-cadastros.png`),fullPage:true});
      await page.getByRole('button',{name:'Novo cliente',exact:true}).click();
      const form=page.getByRole('dialog',{name:'Novo cliente',exact:true});
      await form.getByLabel('Razão social').waitFor();
      await form.getByRole('button',{name:'Salvar cliente',exact:true}).scrollIntoViewIfNeeded();
      await form.getByLabel('Razão social').focus();
      await form.evaluate(element=>{element.scrollTop=0;});
      assert.equal(await form.evaluate(element=>element.getBoundingClientRect().right<=innerWidth),true);
      await page.screenshot({path:join(directory,`${theme}-${width}-formulario.png`),fullPage:true});
      await form.getByRole('button',{name:'Fechar modal'}).click();
      await page.setViewportSize({width:1440,height:1000});
      await page.getByRole('button',{name:'Documentos',exact:true}).click();
      await page.getByRole('button',{name:'Abrir ficha de DF000001/2026'}).click();
      const sheet=page.getByRole('dialog',{name:'Ficha do documento',exact:true});
      await sheet.getByText('DF000001/2026',{exact:true}).waitFor();
      await sheet.getByRole('navigation',{name:'Conteúdo do instrumento'}).waitFor();
      await page.setViewportSize({width,height:width===390?844:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:join(directory,`${theme}-${width}-documento.png`),fullPage:true});
      await sheet.getByRole('button',{name:'Fechar modal'}).click();
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  if(await page.evaluate(()=>document.documentElement.dataset.theme)!==previous){
    await page.getByRole('button',{name:previous==='light'?'Ativar tema claro':'Ativar tema escuro'}).click();
  }
  await page.getByRole('button',{name:'Cadastros',exact:true}).click();
  console.log('OK: 12 capturas reais — tabela, formulário e documento; claro/escuro; 1440/390 px; sem overflow da página.');
}
