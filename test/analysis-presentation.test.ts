import {expect,it} from 'vitest';
import {analysisSections,hasAnalysisValue} from '../frontend/src/analysis';
it('distingue ausência de zero e falso sem tratar o marcador como valor',()=>{
  for(const value of [null,undefined,'','  ','Não consta na CCT',' Não consta na CCT ',[],{}])expect(hasAnalysisValue(value)).toBe(false);
  for(const value of [0,false,'0','Não se aplica','R$ 2.000'])expect(hasAnalysisValue(value)).toBe(true);
});
it('preserva referências e texto integral nos tópicos antigos e nas ações de aditivo',()=>{
  const citacao='Linha 1\n  Linha 2 <script>literal</script>';
  const legacy=analysisSections({itens:[{id:'piso',titulo:'Piso',resumo:'R$ 2.000',clausula:'Cláusula 2',citacao},{id:'vazio',titulo:'Ausente'}]});
  expect(legacy[0].grupos[0].campos[0]).toMatchObject({valor:'R$ 2.000',clausula:'Cláusula 2',citacao});
  expect(hasAnalysisValue(legacy[0].grupos[0].campos[1].valor)).toBe(false);
  const amendment=analysisSections({aditivo:true,alteracoes:[{campo:'piso',acao:'revogar',valor:'',citacao}]});
  expect(amendment[0].grupos[0].campos[0]).toMatchObject({acao:'revogar',valor:'',citacao});
});
it('mantém a hierarquia do template e não inventa campos para formato desconhecido',()=>{
  const secoes=[{titulo:'Seção',grupos:[{titulo:null,campos:[{id:'x',rotulo:'Campo',valor:'Valor'}]}]}];
  expect(analysisSections({secoes})).toBe(secoes);
  expect(analysisSections(null)).toEqual([]);
  expect(analysisSections({itens:[{id:'piso',titulo:'Piso'}]},{campos:{piso:'R$ 2.100'}})).toEqual([]);
});
