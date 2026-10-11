(()=>{
  'use strict';
  const main=document.querySelector('main'),identity=document.getElementById('auth-identidade');
  if(!main||!identity)return;
  document.body.classList.add('workspace');
  const node=(tag,text,parent)=>{const item=document.createElement(tag);if(text)item.textContent=text;parent?.append(item);return item;};
  const iconPaths={inicio:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',cadastros:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 21v-2a4 4 0 0 0-3-4 M16 3a4 4 0 0 1 0 8',monitoramento:'M3 12h4l3-8 4 16 3-8h4',documentos:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h6',envios:'M22 2 9 15 M22 2l-7 20-6-7-7-6z',gestao:'M4 7h16 M4 17h16 M9 4v6 M15 14v6',plataforma:'M3 21h18 M5 21V7l7-4 7 4v14 M9 10h1 M14 10h1 M9 14h1 M14 14h1 M10 21v-4h4v4'};
  const icon=key=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('workspace-icon');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',iconPaths[key]||iconPaths.inicio);svg.append(path);return svg;};
  const header=node('header','',main);header.className='workspace-header';
  const brand=node('div','',header);brand.append(main.querySelector('.auth-brand'),main.querySelector('h1'));
  brand.querySelector('h1').textContent='Área de trabalho';
  const actions=document.querySelector('.auth-actions');header.append(actions);
  main.prepend(header);
  const context=document.getElementById('contexto-form').closest('section');context.classList.add('context-card');
  context.querySelector('h2').textContent='Escritório ou empresa em uso';
  const contextForm=document.getElementById('contexto-form');
  contextForm.classList.add('workspace-switcher');header.insertBefore(contextForm,actions);
  context.hidden=true;
  const contextStatus=document.getElementById('contexto-selecionado');contextStatus.classList.add('workspace-context-status');header.after(contextStatus);
  contextForm.querySelector('label').textContent='Seu espaço de trabalho';
  document.getElementById('contexto').setAttribute('aria-label','Escritório ou empresa');
  contextForm.querySelector('button[type=submit]').hidden=true;
  document.getElementById('suporte-campos').classList.add('workspace-support-internal');
  document.getElementById('contexto').addEventListener('change',()=>{
    if(!document.getElementById('contexto').value)return;
    document.getElementById('suporte-justificativa').value='Troca de escritório pela área de trabalho';
    contextForm.requestSubmit();
  });
  const nav=node('nav','',main);nav.className='workspace-nav';nav.setAttribute('aria-label','Áreas de trabalho');
  header.after(nav);
  const panels=new Map(),buttons=new Map();let active='inicio';
  const groups=[
    ['inicio','Visão geral',['resumo-escritorio']],
    ['cadastros','Cadastros',['cadastros-escritorio']],
    ['monitoramento','Monitoramento',['monitoramento-contexto']],
    ['documentos','Documentos e revisões',['interpretacoes-local','publicacoes-contexto','portal-cliente']],
    ['envios','Envios',['envios-local']],
    ['gestao','Gestão do escritório',['gestao-local']],
    ['plataforma','Administração da plataforma',['gestao-plataforma','ia-plataforma']],
    ['perfil','Minha conta',[]]
  ];
  function select(key){
    if(!panels.has(key)||buttons.get(key)?.hidden)return;
    active=key;for(const [id,panel] of panels)panel.hidden=id!==key;
    for(const [id,button] of buttons)button.setAttribute('aria-current',id===key?'page':'false');
    history.replaceState(null,'',location.pathname+location.search+'#'+key);
  }
  window.addEventListener('mediador:navegar',event=>{const key=event.detail?.area;if(panels.has(key)&&!buttons.get(key).hidden)select(key);});
  for(const [key,label,ids] of groups){
    const button=node('button','',nav);button.setAttribute('aria-label',label);button.append(icon(key));node('span',({documentos:'Documentos',gestao:'Escritório',plataforma:'Plataforma'})[key]||label,button);button.type='button';button.dataset.area=key;button.onclick=()=>select(key);buttons.set(key,button);
    const panel=node('section','',main);panel.className='workspace-panel';panel.id='area-'+key;panel.setAttribute('aria-label',label);panels.set(key,panel);
    for(const id of ids){const target=document.getElementById(id);if(target){target.classList.add('bento-card');panel.append(target);}}
  }
  const platformPanel=panels.get('plataforma'),platformNav=node('nav','',platformPanel);platformNav.className='documents-nav';platformNav.setAttribute('aria-label','Áreas da plataforma');platformPanel.prepend(platformNav);
  const platformRegistry=node('div','',platformPanel),platformAi=node('div','',platformPanel);platformRegistry.append(document.getElementById('gestao-plataforma'));platformAi.append(document.getElementById('ia-plataforma'));
  const registryButton=node('button','Cadastros e operação local',platformNav),aiButton=node('button','IA e extrações',platformNav);
  function selectPlatform(ai){platformRegistry.hidden=ai;platformAi.hidden=!ai;registryButton.setAttribute('aria-pressed',String(!ai));aiButton.setAttribute('aria-pressed',String(ai));}
  registryButton.type=aiButton.type='button';registryButton.onclick=()=>selectPlatform(false);aiButton.onclick=()=>selectPlatform(true);selectPlatform(false);
  window.addEventListener('mediador:sessao',event=>{aiButton.hidden=!event.detail.capacidades?.ia_plataforma;if(aiButton.hidden)selectPlatform(false);});
  const documentPanel=panels.get('documentos'),documentNav=node('nav','',documentPanel);documentNav.className='documents-nav';documentNav.setAttribute('aria-label','Áreas de documentos');documentPanel.prepend(documentNav);
  const publicationWrapper=node('div','',documentPanel);publicationWrapper.id='documents-publications';publicationWrapper.append(document.getElementById('publicacoes-contexto'));
  let documentArea='instrumentos';const documentButtons=new Map();
  function selectDocumentArea(area){
    documentArea=area;for(const [key,button] of documentButtons)button.setAttribute('aria-pressed',String(key===area));
    publicationWrapper.hidden=!['publicacoes','acessos'].includes(area);window.dispatchEvent(new CustomEvent('mediador:publicacoes-area',{detail:{area}}));
    const instrumentRoot=document.getElementById('interpretacoes-local');instrumentRoot.hidden=['publicacoes','acessos'].includes(area);
    for(const child of instrumentRoot.children)child.hidden=child.id==='consolidacoes-contexto'?area!=='consolidacoes':area!=='instrumentos';
  }
  for(const [key,label] of [['instrumentos','Instrumentos'],['consolidacoes','Revisões'],['publicacoes','Publicações'],['acessos','Acessos e ciência']]){const button=node('button',label,documentNav);button.type='button';button.onclick=()=>selectDocumentArea(key);documentButtons.set(key,button);}
  selectDocumentArea('instrumentos');
  window.addEventListener('mediador:documentos-prontos',()=>selectDocumentArea(documentArea));
  window.addEventListener('mediador:documentos-area',event=>selectDocumentArea(event.detail.area));
  window.addEventListener('mediador:limpar',()=>selectDocumentArea('instrumentos'));
  window.addEventListener('mediador:contexto',event=>{documentNav.hidden=event.detail.contexto.tipo==='cliente';documentButtons.get('publicacoes').hidden=event.detail.contexto.papel!=='administrador';documentButtons.get('acessos').hidden=event.detail.contexto.papel!=='administrador';});
  const welcome=node('article','',panels.get('inicio'));welcome.className='bento-card welcome-card';
  node('h2','Seu dia, em perspectiva.',welcome);node('p','Acompanhe documentos, clientes e as próximas decisões do seu escritório.',welcome);
  const shortcuts=node('div','',welcome);shortcuts.className='workspace-shortcuts';
  for(const [key,label] of [['cadastros','Gerenciar clientes'],['documentos','Revisar documentos'],['monitoramento','Acompanhar monitoramento']]){const button=node('button',label,shortcuts);button.type='button';button.onclick=()=>select(key);}
  const summary=document.getElementById('resumo-escritorio');
  let clientView=false;
  new MutationObserver(()=>{welcome.hidden=clientView||!summary.hidden;}).observe(summary,{attributes:true,attributeFilter:['hidden']});
  const account=document.getElementById('perfil-form').closest('section');account.className='bento-card';panels.get('perfil').append(account);
  const status=document.getElementById('auth-mensagem');
  const feedback=node('div','',main);feedback.id='workspace-feedback';feedback.className='workspace-feedback';feedback.hidden=true;nav.after(feedback);feedback.append(status);
  const dismissFeedback=node('button','×',feedback);dismissFeedback.type='button';dismissFeedback.className='feedback-close';dismissFeedback.setAttribute('aria-label','Fechar notificação');
  let feedbackTimer;
  const hideFeedback=()=>{clearTimeout(feedbackTimer);if(feedback.matches(':popover-open'))feedback.hidePopover();feedback.hidden=true;};
  dismissFeedback.onclick=hideFeedback;
  function updateFeedback(){
    hideFeedback();if(!status.textContent.trim())return;
    const error=status.dataset.erro==='true';feedback.dataset.error=String(error);feedback.hidden=false;
    if(error){feedback.removeAttribute('popover');const dialog=main.querySelector('dialog[open]');if(dialog)dialog.prepend(feedback);else nav.after(feedback);status.setAttribute('role','alert');}
    else {nav.after(feedback);feedback.setAttribute('popover','manual');status.setAttribute('role','status');feedback.showPopover();feedbackTimer=setTimeout(hideFeedback,5000);}
  }
  new MutationObserver(updateFeedback).observe(status,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['data-erro']});
  feedback.addEventListener('mouseenter',()=>clearTimeout(feedbackTimer));
  feedback.addEventListener('mouseleave',()=>{if(feedback.dataset.error!=='true')feedbackTimer=setTimeout(hideFeedback,5000);});
  feedback.addEventListener('focusin',()=>clearTimeout(feedbackTimer));
  feedback.addEventListener('focusout',()=>{if(feedback.dataset.error!=='true')feedbackTimer=setTimeout(hideFeedback,5000);});
  document.addEventListener('close',event=>{if(event.target.tagName==='DIALOG'&&event.target.contains(feedback)){nav.after(feedback);hideFeedback();}},true);
  const registry=document.getElementById('cadastros-escritorio');
  const children=Array.from(registry.children);let card;
  for(const child of children){
    if(child.tagName==='H3'){card=node('article','',registry);card.className='bento-card';}
    if(card)card.append(child);
  }
  registry.classList.add('registry-bento');
  const searches=[];
  const normalize=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  for(const [id,label] of [['lista-clientes-contexto','Buscar clientes'],['lista-contatos-contexto','Buscar contatos'],['lista-monitoramentos-contexto','Buscar sindicatos e consultas']]){
    const original=document.getElementById(id),table=node('table'),head=node('thead','',table),row=node('tr','',head),list=node('tbody','',table);
    list.id=id;table.className='registry-table';table.setAttribute('aria-label',label.replace('Buscar ','').replace('clientes','Clientes').replace('contatos','Contatos'));
    const columns=id.includes('clientes')?['Cliente','CNPJ','Localização','Envio','Situação','Ações']:id.includes('contatos')?['Contato','E-mail','Telefone','Situação','Ações']:['Consulta e sindicato','Filtros','Instrumentos','Situação','Ações'];
    for(const title of columns){const th=node('th',title,row);th.scope='col';}
    const scroll=node('div');scroll.className='registry-table-scroll';scroll.append(table);original.replaceWith(scroll);
    const search=node('input');search.type='search';search.placeholder=label;search.setAttribute('aria-label',label);search.className='registry-search';const toolbar=node('div');toolbar.className='registry-toolbar';scroll.before(toolbar);const create=scroll.parentElement.querySelector('button[id^=novo-]');if(create)toolbar.append(create);toolbar.append(search);
    const empty=node('p');empty.className='registry-search-empty';empty.textContent='Nenhum resultado para esta busca.';empty.hidden=true;scroll.after(empty);
    const filter=()=>{const query=normalize(search.value.trim());let matches=0;for(const item of list.children){item.hidden=(!!query&&!normalize(item.textContent).includes(query))||(list.dataset.situacao&&list.dataset.situacao!=='todas'&&item.dataset.active!==list.dataset.situacao);if(!item.hidden)matches++;}empty.hidden=!query||matches>0;};
    search.addEventListener('input',filter);new MutationObserver(filter).observe(list,{childList:true,subtree:true,characterData:true});searches.push({search,filter});
  }
  // Move the original forms, keeping their IDs, fields and event handlers intact.
  for(const id of ['cliente-contexto-form','contato-contexto-form','monitoramento-contexto-form']){
    const form=document.getElementById(id),dialog=node('dialog','',main);dialog.className='workspace-dialog';
    dialog.setAttribute('aria-labelledby',form.querySelector('h3').id);
    const close=node('button','Fechar',dialog);close.type='button';close.className='secondary dialog-close';
    dialog.append(form);
    const dismiss=()=>{form.hidden=true;dialog.close();};close.onclick=dismiss;
    dialog.addEventListener('cancel',()=>{form.hidden=true;});
    const sync=()=>{if(!form.hidden&&!dialog.open){dialog.showModal();form.querySelector('input,select')?.focus();}else if(form.hidden&&dialog.open)dialog.close();};
    new MutationObserver(sync).observe(form,{attributes:true,attributeFilter:['hidden']});
  }
  const profileButton=node('button','Minha conta',actions);profileButton.type='button';profileButton.className='workspace-avatar';profileButton.setAttribute('aria-label','Minha conta');profileButton.textContent='MM';
  const accountDialog=node('dialog','',main);accountDialog.className='workspace-dialog';accountDialog.setAttribute('aria-label','Minha conta');
  const accountClose=node('button','Fechar',accountDialog);accountClose.type='button';accountClose.className='secondary dialog-close';accountClose.onclick=()=>accountDialog.close();accountDialog.append(identity,account);
  const accountActions=node('div','',accountDialog);accountActions.className='workspace-account-actions';accountActions.append(document.getElementById('painel-global'),document.getElementById('auth-sair'));
  const platformLink=document.getElementById('painel-global');platformLink.textContent='Administração da plataforma';platformLink.href='#plataforma';
  platformLink.onclick=event=>{event.preventDefault();if(!buttons.get('plataforma').hidden){accountDialog.close();select('plataforma');}};
  profileButton.onclick=()=>accountDialog.showModal();buttons.get('perfil').hidden=true;
  accountDialog.append(document.getElementById('suporte-encerrar'));
  new MutationObserver(()=>{if(accountDialog.open&&status.textContent==='Nome atualizado.')accountDialog.close();}).observe(status,{childList:true});
  window.addEventListener('mediador:sessao',event=>{
    const name=event.detail.usuario.nome||'Minha conta';profileButton.textContent=name.trim().split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase();profileButton.title=name;
    buttons.get('plataforma').hidden=event.detail.usuario.papel_plataforma!=='administrador_plataforma';
    if(buttons.get(active)?.hidden&&active!=='perfil')select('inicio');
  });
  const clearNavigation=event=>{if(event?.detail?.preservarNavegacao)return;clientView=false;welcome.hidden=false;for(const key of ['cadastros','monitoramento','gestao','envios','documentos'])buttons.get(key).hidden=true;for(const item of searches){item.search.value='';item.filter();}if(buttons.get(active)?.hidden)select('inicio');};
  window.addEventListener('mediador:limpar',clearNavigation);
  window.addEventListener('mediador:contexto',event=>{
    const client=event.detail.contexto.tipo==='cliente';
    clientView=client;
    buttons.get('documentos').hidden=false;
    for(const key of ['cadastros','monitoramento','gestao','envios'])buttons.get(key).hidden=client;
    buttons.get('monitoramento').hidden=client||!event.detail.sessao.capacidades?.monitoramento_execucoes;
    buttons.get('gestao').hidden=client||event.detail.contexto.papel!=='administrador';
    buttons.get('envios').hidden=client||!event.detail.sessao.capacidades?.monitoramento_execucoes;
    welcome.hidden=client;
    if(client)select('documentos');else if(buttons.get(active)?.hidden)select('inicio');
  });
  const initial=location.hash.slice(1);select(panels.has(initial)&&initial!=='perfil'?initial:'inicio');
  buttons.get('plataforma').hidden=true;
  clearNavigation();
  if(initial==='perfil')accountDialog.showModal();
})();
