import assert from 'node:assert/strict';
import {createServer} from 'node:http';

/** Loopback provider only; invoked against the disposable HTTPS application database. */
export async function validarConexaoIaNavegador(setup,page,actor){
  assert.match((await setup.query('SELECT current_database() nome')).rows[0].nome,/^mediador_https_test_[a-f0-9]{32}$/);
  let count=0,rejected=false;
  const server=createServer(async(req,res)=>{
    assert.equal(req.url,'/v1/chat/completions');assert.equal(req.method,'POST');assert.equal(req.headers.authorization,'Bearer segredo-conexao-sintetico');
    let raw='';for await(const chunk of req)raw+=chunk;
    assert.deepEqual(JSON.parse(raw),{model:'modelo-conexao-sintetico',messages:[{role:'system',content:'Responda apenas com a palavra: ok'},{role:'user',content:'ping'}]});
    count++;res.setHeader('content-type','application/json');res.statusCode=rejected?401:200;
    res.end(rejected?'segredo-conexao-sintetico':JSON.stringify({choices:[{message:{content:'ok'}}]}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await page.getByRole('button',{name:'Editar configuração de IA',exact:true}).click();
    await page.getByLabel('Habilitar IA',{exact:true}).uncheck();
    await page.getByLabel('URL do provedor de IA',{exact:true}).fill(`http://127.0.0.1:${server.address().port}/v1`);
    await page.getByLabel('Modelo de IA',{exact:true}).fill('modelo-conexao-sintetico');
    await page.getByLabel('Nova chave de IA',{exact:true}).fill('segredo-conexao-sintetico');
    const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plataforma/ia'&&r.request().method()==='PUT');
    await page.getByRole('button',{name:'Salvar configuração de IA',exact:true}).click();assert.equal((await saved).status(),200);
    await page.getByText('IA desabilitada · modelo-conexao-sintetico',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Testar conexão de IA',exact:true}).click();
    await page.getByText(/Conexão e resposta do modelo confirmadas\./).waitFor();assert.equal(count,1);
    rejected=true;await page.getByRole('button',{name:'Testar conexão de IA',exact:true}).click();
    await page.getByText('O provedor recusou a autenticação. Confira a chave e as permissões.',{exact:true}).waitFor();assert.equal(count,2);
    assert.equal(await page.getByText('segredo-conexao-sintetico',{exact:true}).count(),0);
    const rows=(await setup.query("SELECT detalhes_json FROM auditoria_seguranca WHERE ator_id=$1 AND acao='IA_CONEXAO_TESTE_CONCLUIDO' ORDER BY id",[actor])).rows;
    assert.equal(rows.length,2);assert.deepEqual(rows.map(row=>row.detalhes_json.ok),[true,false]);assert.equal(JSON.stringify(rows).includes('segredo-conexao-sintetico'),false);
  }finally{await new Promise(resolve=>server.close(resolve));}
}
