(()=>{
  'use strict';
  window.criarEditorVinculosCliente=()=>{
    const selectors={contatos:document.getElementById('cliente-contatos'),sindicatos:document.getElementById('cliente-sindicatos')};
    const states={contatos:new Map(),sindicatos:new Map()},roots={};
    let defaults;
    for(const kind of Object.keys(selectors)){
      const root=document.createElement('div');root.className='cliente-vinculos';root.id='cliente-preferencias-'+kind;selectors[kind].after(root);roots[kind]=root;selectors[kind].hidden=true;
      selectors[kind].addEventListener('change',()=>render(kind));
    }
    function field(parent,id,label,value,type,key,state){
      const wrapper=document.createElement('div'),caption=document.createElement('label'),input=key==='uf'?window.criarSeletorUf(value):document.createElement('input');
      caption.htmlFor=id;caption.textContent=label;input.id=id;if(key!=='uf')input.type=type;
      if(type==='checkbox'||type==='radio')input.checked=!!value;else{input.value=value??'';input.maxLength=key==='uf'?2:500;}
      input.addEventListener('input',()=>{state[key]=(type==='checkbox'||type==='radio')?input.checked:input.value;
        if(key==='principal'&&input.checked){for(const other of states.sindicatos.values())if(other!==state)other.principal=false;for(const check of roots.sindicatos.querySelectorAll('[data-principal]'))if(check!==input)check.checked=false;}
      });
      if(key==='principal'){input.dataset.principal='true';input.name='cliente-sindicato-principal';}wrapper.append(caption,input);parent.append(wrapper);
    }
    function render(kind){
      roots[kind].replaceChildren();
      const search=document.createElement('input');search.type='search';search.placeholder=kind==='contatos'?'Buscar contato para vincular':'Buscar sindicato para vincular';search.setAttribute('aria-label',search.placeholder);roots[kind].append(search);search.oninput=()=>{const query=search.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');for(const card of roots[kind].querySelectorAll('fieldset'))card.hidden=!card.querySelector('legend').textContent.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').includes(query);};
      if(!selectors[kind].options.length){const empty=document.createElement('p');empty.textContent=kind==='contatos'?'Nenhum contato disponível. Cadastre uma pessoa em Cadastros → Contatos.':'Nenhum sindicato disponível. Configure em Cadastros → Sindicatos.';roots[kind].append(empty);}
      if(kind==='sindicatos'){const clear=document.createElement('button');clear.type='button';clear.textContent='Sem sindicato principal';clear.className='secondary';clear.onclick=()=>{for(const state of states.sindicatos.values())state.principal=false;for(const input of roots.sindicatos.querySelectorAll('[data-principal]'))input.checked=false;};roots[kind].append(clear);}
      for(const option of selectors[kind].options){
        const id=Number(option.value);if(!states[kind].has(id))states[kind].set(id,defaults(kind,id));
        const state=states[kind].get(id),section=document.createElement('fieldset'),title=document.createElement('legend');title.textContent=option.textContent;section.append(title);roots[kind].append(section);
        const prefix='cliente-vinculo-'+kind+'-'+id+'-';
        const linkLabel=document.createElement('label'),link=document.createElement('input');link.type='checkbox';link.id=prefix+'vincular';link.checked=option.selected;linkLabel.append(link,document.createTextNode('Vincular'));section.append(linkLabel);
        const preferences=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div');summary.textContent=kind==='contatos'?'Preferências neste cliente':'Enquadramento neste cliente';preferences.append(summary,body);preferences.hidden=!option.selected;preferences.open=option.selected;section.append(preferences);
        link.onchange=()=>{option.selected=link.checked;preferences.hidden=!link.checked;if(link.checked)preferences.open=true;};
        const parent=body;
        if(kind==='contatos'){
          field(parent,prefix+'funcao','Função neste cliente',state.funcao,'text','funcao',state);
          field(parent,prefix+'email','Receber documentos por e-mail',state.receber_email,'checkbox','receber_email',state);
          const label=document.createElement('label'),types=document.createElement('select'),help=document.createElement('small');label.htmlFor=types.id=prefix+'tipos';label.textContent='Tipos de documento';types.multiple=true;types.size=3;
          for(const original of document.getElementById('monitoramento-tipos').options){const option=original.cloneNode(true);option.selected=state.tipos.includes(option.value);types.append(option);}
          types.onchange=()=>state.tipos=[...types.selectedOptions].map(option=>option.value);help.textContent='Sem seleção, o contato recebe todos os tipos.';parent.append(label,types,help);types.hidden=true;const choices=document.createElement('div');choices.className='registry-type-options';parent.append(choices);for(const option of types.options){const choice=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.value=option.value;check.checked=option.selected;choice.append(check,document.createTextNode(option.textContent));choices.append(choice);check.onchange=()=>{if(check.checked&&check.value==='Todos os tipos')for(const other of types.options)other.selected=false;else if(check.checked)for(const other of types.options)if(other.value==='Todos os tipos')other.selected=false;option.selected=check.checked;types.dispatchEvent(new Event('change'));for(const other of choices.querySelectorAll('input'))other.checked=[...types.selectedOptions].some(o=>o.value===other.value);};}
        }else{
          for(const [key,label] of [['categoria','Categoria do cliente'],['uf','UF do enquadramento'],['municipio','Município do enquadramento']])field(parent,prefix+key,label,state[key],'text',key,state);
          field(parent,prefix+'principal','Sindicato principal',state.principal,'radio','principal',state);
          field(parent,prefix+'confirmado','Enquadramento conferido pelo escritório',state.enquadramento_confirmado,'checkbox','enquadramento_confirmado',state);
        }
      }
    }
    return {
      reset(item,monitoramentos){
        for(const kind of Object.keys(states)){states[kind].clear();for(const value of item?.[kind]||[])states[kind].set(value[kind==='contatos'?'contato_id':'sindicato_id'],{...value,tipos:[...(value.tipos||[])]});}
        defaults=(kind,id)=>kind==='contatos'?{contato_id:id,funcao:'',receber_email:true,tipos:[]}:{sindicato_id:id,categoria:monitoramentos.find(m=>m.sindicato_id===id)?.categoria||'',uf:document.getElementById('cliente-uf').value,municipio:document.getElementById('cliente-municipio').value,principal:false,enquadramento_confirmado:false};
        render('contatos');render('sindicatos');
      },
      read(kind){return [...selectors[kind].selectedOptions].map(option=>{const state=states[kind].get(Number(option.value));const keys=kind==='contatos'?['contato_id','funcao','receber_email','tipos']:['sindicato_id','categoria','uf','municipio','principal','enquadramento_confirmado'];return Object.fromEntries(keys.map(key=>[key,state[key]]));});}
    };
  };
})();
