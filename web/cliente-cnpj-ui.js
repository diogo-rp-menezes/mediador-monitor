(()=>{
  'use strict';
  window.criarConsultaCnpjCliente=(api,notify)=>{
    const form=document.getElementById('cliente-contexto-form'),input=document.getElementById('cliente-cnpj');
    const button=document.createElement('button'),result=document.createElement('div');
    button.type='button';button.id='cliente-consultar-cnpj';button.textContent='Consultar CNPJ';
    result.id='cliente-cnpj-resultado';result.className='cliente-cnpj-resultado';result.hidden=true;result.setAttribute('aria-live','polite');input.after(button,result);
    let data=null,generation=0;
    const normalize=value=>value.replace(/[^a-z0-9]/gi,'').toUpperCase();
    function text(tag,value,parent=result){const node=document.createElement(tag);node.textContent=value;parent.append(node);return node;}
    function render(value,apply=false){
      result.replaceChildren();result.hidden=!value;if(!value)return;
      text('h4',value.razao_social);text('p',`${value.cnpj} · ${value.situacao_cadastral||'Situação não informada'}`);
      const details=document.createElement('details');result.append(details);text('summary','Dados cadastrais completos',details);
      const rows=[['Nome fantasia',value.nome_fantasia],['Localidade',[value.municipio,value.uf].filter(Boolean).join(' / ')],['Endereço',Object.values(value.endereco||{}).filter(Boolean).join(' · ')],['CNAE principal',[value.cnae_principal?.codigo,value.cnae_principal?.descricao].filter(Boolean).join(' · ')],['Natureza jurídica',value.natureza_juridica],['Porte',value.porte],['Início da atividade',value.inicio_atividade],['Situação desde',value.data_situacao_cadastral]];
      for(const [label,content] of rows)text('p',`${label}: ${content||'Não informado'}`,details);
      for(const cnae of value.cnaes_secundarios||[])text('p',`CNAE secundário: ${cnae.codigo} · ${cnae.descricao}`,details);
      text('small',`Fonte: ${value.fonte} · Consulta: ${new Date(value.consultado_em).toLocaleString('pt-BR')}`);
      text('p','Confira os dados e o enquadramento sindical. Nada será gravado até salvar o cliente.');
      if(apply){const use=text('button','Usar dados no cadastro');use.type='button';use.id='cliente-aplicar-cnpj';use.onclick=()=>{
        if(normalize(input.value)!==value.cnpj||form.hidden)return;
        for(const [field,key] of [['razao','razao_social'],['fantasia','nome_fantasia'],['uf','uf'],['municipio','municipio']])document.getElementById('cliente-'+field).value=value[key]||'';
        data=value;render(data);notify('Dados preenchidos. Confira e salve o cliente.');
      };}
    }
    input.addEventListener('input',()=>{generation++;button.disabled=false;if(data?.cnpj!==normalize(input.value))data=null;render(data);});
    button.onclick=async()=>{
      const request=++generation,cnpj=normalize(input.value);button.disabled=true;result.hidden=false;result.textContent='Consultando CNPJ…';
      try{const value=await api('/api/contexto/clientes/consulta-cnpj/'+encodeURIComponent(cnpj||'invalido'));
        if(request!==generation||form.hidden||cnpj!==normalize(input.value))return;render(value,true);
      }catch(error){if(request===generation&&!form.hidden){result.textContent=error.message;notify(error.message,true);}}
      finally{if(request===generation)button.disabled=false;}
    };
    new MutationObserver(()=>{if(form.hidden){generation++;button.disabled=false;result.replaceChildren();result.hidden=true;data=null;}}).observe(form,{attributes:true,attributeFilter:['hidden']});
    return {reset(item){generation++;button.disabled=false;data=item?.dados_cnpj_json??item?.dados_cnpj??null;if(data?.cnpj!==normalize(input.value))data=null;render(data);},read(){return data?.cnpj===normalize(input.value)?data:null;}};
  };
})();
