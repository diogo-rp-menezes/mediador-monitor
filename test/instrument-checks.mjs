import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';

export async function validarInstrumentos(browser){
  const context=await browser.newContext();
  try{
    const page=await context.newPage(),errors=[],downloads=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));
    const docs=[{numero_registro:'DF000001/2026',tipo:'Convenção Coletiva',cliente_original_id:9,clientes_ids:[9],original_disponivel:false},{numero_registro:'DF000002/2026',tipo:'Termo Aditivo',cliente_original_id:10,clientes_ids:[10],original_disponivel:true}];
    let mode='ok',release,started,detailRelease,detailStarted,delayDetail=false;
    await page.route('http://instrument.test/**',async route=>{
      const url=new URL(route.request().url()),path=url.pathname,office=route.request().headers()['x-context-id'];
      if(path==='/api/auth/sessao')return route.fulfill({json:{csrf:'token',usuario:{nome:'Teste',email:'teste@example.invalid'},contextos:{escritorios:[{id:1,nome:'A',membro:true},{id:2,nome:'B',membro:true}],clientes:[]}}});
      if(path==='/api/auth/contexto')return route.fulfill({json:{contexto:{tipo:'escritorio',escritorio_id:route.request().postDataJSON().id,cliente_id:null,papel:'administrador'}}});
      if(path.endsWith('/documentos/original')){
        assert.equal(office,'1');assert.equal(url.searchParams.get('numero'),docs[1].numero_registro);
        if(mode==='delay'){const gate=new Promise(r=>{release=r;});started();await gate;}
        if(mode==='fail')return route.fulfill({status:409,json:{erro:'Original sem integridade confirmada. Atualize o documento.'}});
        return route.fulfill({contentType:'application/pdf',body:Buffer.from('%PDF-1.4\nOriginal sintético')});
      }
      if(path==='/api/contexto/interpretacoes'){
        if(url.searchParams.has('numero')){
          const item=docs.find(d=>d.numero_registro===url.searchParams.get('numero'));
          if(delayDetail){delayDetail=false;const gate=new Promise(r=>{detailRelease=r;});detailStarted();await gate;}
          return route.fulfill({json:{...item,numero_solicitacao:'MR000001/2026',vigencia:'2026–2027',partes:'Sindicato sintético',analise_status:'pendente',analise:null}});
        }
        return route.fulfill({json:{documentos:office==='1'?docs:[],vinculos:[]}});
      }
      if(path==='/api/contexto/clientes')return route.fulfill({json:office==='1'?[{id:9,razao_social:'Cliente Alfa',nome_fantasia:''},{id:10,razao_social:'Cliente Beta',nome_fantasia:''}]:[]});
      if(path.startsWith('/api/contexto/'))return route.fulfill({json:[]});
      const asset=path==='/app/'?'index.html':path.slice(5);
      return route.fulfill({body:readFileSync(resolve('web/vue',asset)),contentType:extname(asset)==='.js'?'text/javascript':extname(asset)==='.css'?'text/css':'text/html'});
    });
    await page.goto('http://instrument.test/app/');
    const workspace=page.getByLabel('Seu espaço de trabalho');await workspace.selectOption('0');
    await page.getByRole('button',{name:'Documentos',exact:true}).click();
    const rows=page.locator('tbody tr');await page.getByText('2 de 2 instrumentos',{exact:true}).waitFor();
    assert.match(await rows.first().innerText(),/DF000002/);
    await page.getByRole('combobox',{name:/^Ordenar/}).selectOption('asc');assert.match(await rows.first().innerText(),/DF000001/);
    await page.getByRole('combobox',{name:/^Cliente relacionado/}).selectOption('9');await page.getByText('1 de 2 instrumentos',{exact:true}).waitFor();
    await page.getByRole('combobox',{name:/^Documento original/}).selectOption('disponivel');await page.getByText('Nenhum resultado para esta busca.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();
    await page.getByRole('combobox',{name:/^Tipo de instrumento/}).selectOption('Termo Aditivo');assert.equal(await rows.count(),1);
    await page.getByLabel('Buscar instrumento',{exact:true}).fill('000001');await page.getByText('0 de 2 instrumentos',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();
    const open=async index=>{await page.getByRole('button',{name:'Abrir ficha de '+docs[index].numero_registro,exact:true}).click();return page.getByRole('dialog',{name:'Ficha do documento',exact:true});};
    let modal=await open(0);await modal.getByRole('button',{name:'Original',exact:true}).click();await modal.getByText('Original ainda não disponível.',{exact:true}).waitFor();assert.equal(await modal.getByRole('button',{name:'Baixar original',exact:true}).count(),0);
    await modal.getByRole('button',{name:'Clientes',exact:true}).click();await modal.getByRole('heading',{name:'Clientes relacionados'}).waitFor();assert.match(await modal.innerText(),/Cliente Alfa/);
    await modal.getByLabel('Fechar modal').click();modal=await open(1);
    let downloaded=page.waitForEvent('download');await modal.getByRole('button',{name:'Baixar original',exact:true}).click();assert.equal((await downloaded).suggestedFilename(),'DF000002_2026.pdf');
    mode='fail';await modal.getByRole('button',{name:'Baixar original',exact:true}).click();await modal.getByRole('alert').getByText('Original sem integridade confirmada. Atualize o documento.').waitFor();
    // A resposta da primeira abertura não pode baixar após reabrir o mesmo objeto.
    mode='delay';let requested=new Promise(r=>{started=r;});await modal.getByRole('button',{name:'Baixar original',exact:true}).click();await requested;
    await modal.getByLabel('Fechar modal').click();modal=await open(1);await modal.getByRole('button',{name:'Visão geral',exact:true}).waitFor();
    let response=page.waitForResponse(r=>r.url().includes('/documentos/original'));release();await response;
    await modal.getByRole('button',{name:'Clientes',exact:true}).click();assert.equal(downloads.length,1);
    // Fechar ficha e trocar escritório enquanto o download está em voo.
    requested=new Promise(r=>{started=r;});await modal.getByRole('button',{name:'Baixar original',exact:true}).click();await requested;
    await modal.getByLabel('Fechar modal').click();await workspace.selectOption('1');await page.getByText('Ainda não há instrumentos neste escritório.',{exact:true}).waitFor();
    response=page.waitForResponse(r=>r.url().includes('/documentos/original'));release();await response;
    await workspace.selectOption('0');await page.getByText('2 de 2 instrumentos',{exact:true}).waitFor();assert.equal(downloads.length,1);
    delayDetail=true;requested=new Promise(r=>{detailStarted=r;});modal=await open(1);await requested;await modal.getByLabel('Fechar modal').click();await workspace.selectOption('1');
    response=page.waitForResponse(r=>r.url().includes('interpretacoes?numero='));detailRelease();await response;
    await page.getByText('Ainda não há instrumentos neste escritório.',{exact:true}).waitFor();assert.equal(await page.getByRole('dialog').count(),0);
    await workspace.selectOption('0');await page.getByText('2 de 2 instrumentos',{exact:true}).waitFor();assert.equal(await page.getByRole('combobox',{name:/^Cliente relacionado/}).inputValue(),'');
    if(process.env.MEDIADOR_UI_VISUAL_DIR){
      const dir=resolve(process.env.MEDIADOR_UI_VISUAL_DIR);mkdirSync(dir,{recursive:true});
      if(await page.getByLabel('Fechar notificação').count())await page.getByLabel('Fechar notificação').click();
      for(const theme of ['light','dark'])for(const width of [1440,390]){
        await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
        await page.screenshot({path:resolve(dir,`instrumentos-${theme}-${width}.png`),fullPage:true});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        modal=await open(1);await modal.getByRole('button',{name:'Clientes',exact:true}).click();
        await modal.getByRole('heading',{name:'Clientes relacionados'}).waitFor();
        await page.screenshot({path:resolve(dir,`instrumento-ficha-${theme}-${width}.png`),fullPage:true});
        await modal.getByLabel('Fechar modal').click();
      }
    }
    assert.deepEqual(errors,[]);
    console.log('OK: instrumentos, filtros combinados, ordem, clientes, original ausente/falha/download, reabertura e contexto invalidam respostas atrasadas.');
  }finally{await context.close();}
}
