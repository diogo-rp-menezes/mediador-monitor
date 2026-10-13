import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';

export async function validarConsultaAtrasada(browser){
  const context=await browser.newContext();
  try{
    const page=await context.newPage();let release,started;
    const gate=new Promise(resolve=>{release=resolve;}),requested=new Promise(resolve=>{started=resolve;});
    const result={cnpj:'11222333000181',razao_social:'Resposta antiga',nome_fantasia:'Antiga',uf:'DF',municipio:'Brasília',endereco:{},cnae_principal:{},cnaes_secundarios:[],fonte:'Fixture',consultado_em:'2026-10-12T00:00:00Z'};
    let calls=0;
    await page.route('http://cnpj.test/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/api/auth/sessao')return route.fulfill({json:{csrf:'token',usuario:{nome:'Conta teste',email:'conta@example.invalid'},contextos:{escritorios:[{id:1,nome:'Escritório teste',membro:true}],clientes:[]}}});
      if(path==='/api/auth/contexto')return route.fulfill({json:{contexto:{tipo:'escritorio',escritorio_id:1,cliente_id:null,papel:'administrador'}}});
      if(path.includes('/consulta-cnpj/')){
        calls++;
        if(calls===1){started();await gate;}
        return route.fulfill({json:result});
      }
      if(path.startsWith('/api/contexto/'))return route.fulfill({json:[]});
      const asset=path==='/app/'?'index.html':path.slice(5);
      return route.fulfill({body:readFileSync(resolve('web/vue',asset)),contentType:extname(asset)==='.js'?'text/javascript':extname(asset)==='.css'?'text/css':'text/html'});
    });
    await page.goto('http://cnpj.test/app/');
    await page.getByLabel('Seu espaço de trabalho').selectOption('0');
    await page.getByRole('button',{name:'Cadastros',exact:true}).click();
    await page.getByRole('button',{name:'Novo cliente',exact:true}).click();
    const form=page.getByRole('dialog',{name:'Novo cliente',exact:true});
    await form.getByLabel('Razão social').fill('Rascunho atual');
    await form.getByLabel('CNPJ',{exact:true}).fill('11222333000181');
    await form.getByRole('button',{name:'Consultar CNPJ',exact:true}).click();await requested;
    assert.equal(await form.getByRole('button',{name:'Consultando…',exact:true}).isDisabled(),true);
    await form.getByLabel('CNPJ',{exact:true}).fill('04252011000110');
    const response=page.waitForResponse(r=>r.url().includes('/consulta-cnpj/11222333000181'));
    release();await response;
    await form.getByRole('button',{name:'Consultar CNPJ',exact:true}).click();
    await form.getByRole('alert').getByText('A consulta retornou dados de outro CNPJ.').waitFor();
    assert.equal(await form.getByRole('button',{name:'Usar dados no cadastro',exact:true}).count(),0);
    assert.equal(await form.getByLabel('Razão social').inputValue(),'Rascunho atual');
    assert.equal(calls,2);
    console.log('OK: consulta atrasada descartada após mudança de CNPJ; resultado divergente recusado sem alterar rascunho.');
  }finally{await context.close();}
}
