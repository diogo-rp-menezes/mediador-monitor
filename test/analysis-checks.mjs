import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';

export async function validarLeituraAnalise(browser){
  const quote='Linha primeira.\n  Linha segunda: <script>literal</script> & fonte original.';
  const cases=[
    {analise:{padrao:{}},analise_visao:{versao:'1.0',secoes:[{titulo:'Identificação',grupos:[{titulo:null,campos:[{id:'valor',rotulo:'Valor identificado',valor:'R$ 2.000',clausula:'Cláusula segunda',citacao:quote},{id:'zero',rotulo:'Quantidade',valor:0},{id:'falso',rotulo:'Condição',valor:false},{id:'ausente',rotulo:'Campo ausente',valor:'Não consta na CCT'},{id:'vazio',rotulo:'Campo vazio',valor:' '}]}]},{titulo:'Outras condições',grupos:[{titulo:null,campos:[{id:'ref',rotulo:'Referência parcial',valor:'Conferir',clausula:'Cláusula terceira'}]}]}]}},
    {analise:{topicos:{piso:{resumo:'R$ 1.900'}}},analise_visao:{itens:[{id:'piso',titulo:'Piso antigo',resumo:'R$ 1.900',citacao:quote},{id:'vazio',titulo:'Vigência'}],observacoes:['Observação salva\nsem alteração.']}},
    {analise:{aditivo:{}},analise_visao:{versao:'aditivo-1.0',aditivo:true,alteracoes:[{campo:'piso',acao:'revogar',valor:'',clausula:'Cláusula quarta',citacao:quote}]}},
    {analise:{campos:{piso:'R$ 2.100',quantidade:0,condicao:false,ausente:null},observacoes:['Texto salvo']},analise_visao:{itens:[{id:'piso',titulo:'Piso antigo'}]}},
    {analise:null,analise_visao:null}
  ];
  for(const platform of [false,true]){
    const context=await browser.newContext();
    try{
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      const docs=cases.map((_,i)=>({numero_registro:'DF00000'+i+'/2026',tipo:'Convenção Coletiva',cliente_original_id:9,clientes_ids:[9],original_disponivel:false}));
      await page.route('http://analysis.test/**',route=>{
        const url=new URL(route.request().url()),path=url.pathname;
        if(path==='/api/auth/sessao')return route.fulfill({json:{csrf:'token',usuario:{nome:'Teste',email:'teste@example.invalid',papel_plataforma:platform?'administrador_plataforma':null},contextos:{escritorios:[{id:1,nome:'Análise',membro:true}],clientes:[]}}});
        if(path==='/api/auth/contexto')return route.fulfill({json:{contexto:{tipo:'escritorio',escritorio_id:1,cliente_id:null,papel:'administrador'}}});
        if(path==='/api/contexto/interpretacoes'){
          const index=docs.findIndex(d=>d.numero_registro===url.searchParams.get('numero'));
          return route.fulfill({json:index<0?{documentos:docs,vinculos:[]}:{...docs[index],...cases[index],analise_status:'analisado'}});
        }
        if(path.startsWith('/api/contexto/'))return route.fulfill({json:[]});
        const asset=path==='/app/'?'index.html':path.slice(5);
        return route.fulfill({body:readFileSync(resolve('web/vue',asset)),contentType:extname(asset)==='.js'?'text/javascript':extname(asset)==='.css'?'text/css':'text/html'});
      });
      await page.goto('http://analysis.test/app/');await page.getByLabel('Seu espaço de trabalho').selectOption('0');await page.getByRole('button',{name:'Documentos',exact:true}).click();
      if(await page.getByLabel('Fechar notificação').count())await page.getByLabel('Fechar notificação').click();
      for(let index=0;index<cases.length;index++){
        await page.getByRole('button',{name:'Abrir ficha de '+docs[index].numero_registro,exact:true}).click();
        const modal=page.getByRole('dialog',{name:'Ficha do documento',exact:true});await modal.getByRole('button',{name:'Análise',exact:true}).click();
        assert.equal(await modal.getByRole('button',{name:'Abrir Plataforma',exact:true}).count(),platform?1:0);
        if(index===0){
          await modal.getByText('4/6',{exact:true}).waitFor();assert.equal(await modal.locator('.field-absent').count(),2);
          await modal.getByText('0',{exact:true}).waitFor();await modal.getByText('false',{exact:true}).waitFor();
          await modal.getByRole('button',{name:'Outras condições',exact:true}).click();await modal.getByRole('button',{name:'Ver evidência de Referência parcial',exact:true}).click();
          const evidence=page.getByRole('dialog',{name:'Evidência no documento original'});await evidence.getByText('Citação textual não disponível.',{exact:true}).waitFor();await page.keyboard.press('Escape');await evidence.waitFor({state:'hidden'});
          await modal.getByRole('button',{name:'Identificação',exact:true}).click();
        }
        if(index<3){
          await modal.getByRole('button',{name:/^Ver evidência de/}).first().click();const evidence=page.getByRole('dialog',{name:'Evidência no documento original'});
          assert.equal(await evidence.locator('blockquote').textContent(),quote);assert.equal(await evidence.locator('script').count(),0);
          if(index===0&&!platform&&process.env.MEDIADOR_UI_VISUAL_DIR){
            const dir=resolve(process.env.MEDIADOR_UI_VISUAL_DIR);mkdirSync(dir,{recursive:true});
            for(const theme of ['light','dark'])for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:resolve(dir,`analise-evidencia-${theme}-${width}.png`),fullPage:false});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
          }
          await evidence.getByLabel('Fechar modal').click();
        }
        if(index===1)await modal.getByText('Observação salva\nsem alteração.',{exact:true}).waitFor();
        if(index===2)await modal.getByText('Ação: revogar',{exact:true}).waitFor();
        if(index===3){await modal.getByText('R$ 2.100',{exact:true}).waitFor();await modal.getByText('0',{exact:true}).waitFor();await modal.getByText('false',{exact:true}).waitFor();await modal.getByText('Não informado na análise',{exact:true}).waitFor();}
        if(index===4)await modal.getByText('Ainda não há análise disponível para este instrumento.',{exact:true}).waitFor();
        if(index===0&&!platform&&process.env.MEDIADOR_UI_VISUAL_DIR){
          const dir=resolve(process.env.MEDIADOR_UI_VISUAL_DIR);
          for(const theme of ['light','dark'])for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:resolve(dir,`analise-campos-${theme}-${width}.png`),fullPage:false});}
        }
        if(index===4&&platform){await modal.getByRole('button',{name:'Abrir Plataforma',exact:true}).click();await page.getByRole('heading',{name:'Plataforma',exact:true,level:1}).waitFor();assert.equal(new URL(page.url()).hash,'#/plataforma');assert.equal(await page.getByRole('dialog').count(),0);}
        else await modal.getByLabel('Fechar modal').click();
      }
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
  console.log('OK: análise template/legado/aditivo/fallback/ausente, zero/falso, citações literais seguras, evidência parcial e Plataforma apenas autorizada.');
}
