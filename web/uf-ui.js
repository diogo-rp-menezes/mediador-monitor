(()=>{
  'use strict';
  const estados=[['AC','Acre'],['AL','Alagoas'],['AP','Amapá'],['AM','Amazonas'],['BA','Bahia'],['CE','Ceará'],['DF','Distrito Federal'],['ES','Espírito Santo'],['GO','Goiás'],['MA','Maranhão'],['MT','Mato Grosso'],['MS','Mato Grosso do Sul'],['MG','Minas Gerais'],['PA','Pará'],['PB','Paraíba'],['PR','Paraná'],['PE','Pernambuco'],['PI','Piauí'],['RJ','Rio de Janeiro'],['RN','Rio Grande do Norte'],['RS','Rio Grande do Sul'],['RO','Rondônia'],['RR','Roraima'],['SC','Santa Catarina'],['SP','São Paulo'],['SE','Sergipe'],['TO','Tocantins']];
  window.criarSeletorUf=(valor='',vazio='Não informada')=>{
    const select=document.createElement('select');
    for(const [sigla,nome]of [['',vazio],...estados]){const option=document.createElement('option');option.value=sigla;option.textContent=sigla?`${sigla} · ${nome}`:nome;select.append(option);}
    select.value=String(valor??'').trim().toUpperCase();return select;
  };
  for(const [id,vazio]of [['cliente-uf','Não informada'],['monitoramento-uf','Todas as UFs']]){
    const original=document.getElementById(id);if(!original)continue;
    const select=window.criarSeletorUf(original.value,vazio);select.id=id;select.required=original.required;original.replaceWith(select);
  }
})();
