import assert from 'node:assert/strict';
import {CAMPOS_CCT,NAO_CONSTA_CCT} from '../dist/cct-template.js';

export async function validarAnalisesIntegradas(page,setup){
  assert.match((await setup.query('SELECT current_database() nome')).rows[0].nome,/^mediador_https_test_[a-f0-9]{32}$/);
  const base='DF000001/2026',field='s01_numero_do_registro_no_mte',quote='Trecho salvo.\n  Segunda linha & <texto literal>.';
  const original=(await setup.query('SELECT extracao_json FROM registros WHERE numero_registro=$1',[base])).rows[0].extracao_json;
  const cases=[
    {data:{padrao:{versao:'1.0.0',campos:{...Object.fromEntries(CAMPOS_CCT.map(c=>[c.id,NAO_CONSTA_CCT])),[field]:base},evidencias:{[field]:{clausula:'Cláusula primeira',citacao:quote}}}},value:base,evidence:'Número do Registro no MTE'},
    {data:{topicos:{pisoSalarial:{resumo:'R$ 1.900',clausula:'Cláusula segunda',citacao:quote}},observacoes:['Observação histórica preservada.']},value:'R$ 1.900',evidence:'Piso salarial'},
    {data:{aditivo:{versao:'1.0',alteracoes:[{campo:'piso',acao:'revogar',valor:'',clausula:'Cláusula terceira',citacao:quote}]}},value:'Ação: revogar',evidence:'piso'},
    {data:{campos:{piso:'R$ 2.100',quantidade:0}},value:'R$ 2.100',fallback:true},
    {data:null,value:'Ainda não há análise disponível para este instrumento.'}
  ];
  try{
    await page.getByRole('button',{name:'Documentos',exact:true}).click();
    for(const item of cases){
      await setup.query('UPDATE registros SET extracao_json=$2::jsonb WHERE numero_registro=$1',[base,item.data===null?null:JSON.stringify(item.data)]);
      await page.getByRole('button',{name:'Abrir ficha de '+base,exact:true}).click();
      const modal=page.getByRole('dialog',{name:'Ficha do documento',exact:true});await modal.getByRole('button',{name:'Análise',exact:true}).click();
      await (item.data&&!item.fallback?modal.locator('.analysis-field-grid'):modal).getByText(item.value,{exact:true}).first().waitFor();
      assert.equal(await modal.getByRole('button',{name:'Abrir Plataforma',exact:true}).count(),0);
      if(item.evidence){
        await modal.getByRole('button',{name:'Ver evidência de '+item.evidence,exact:true}).click();
        const evidence=page.getByRole('dialog',{name:'Evidência no documento original'});assert.equal(await evidence.locator('blockquote').textContent(),quote);
        await evidence.getByLabel('Fechar modal').click();
      }
      await modal.getByLabel('Fechar modal').click();
    }
    await page.getByRole('button',{name:'Cadastros',exact:true}).click();
    console.log('OK: análises reais template/tópicos/aditivo/ausente lidas do PostgreSQL; citações preservadas e administrador do escritório sem ação de Plataforma.');
  }finally{await setup.query('UPDATE registros SET extracao_json=$2::jsonb WHERE numero_registro=$1',[base,original===null?null:JSON.stringify(original)]);}
}
