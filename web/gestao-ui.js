(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  let sessao,contexto=null,geracao=0,modalSequence=0;
  function el(tag,text,parent){const n=document.createElement(tag);if(text)n.textContent=text;if(parent)parent.append(n);return n;}
  function botao(text,parent,acao){const b=el('button',text,parent);b.type='button';b.onclick=async()=>{b.disabled=true;try{await acao();}catch(e){erro(e.message,true);}finally{b.disabled=false;}};return b;}
  function erro(text,falha=false){$('auth-mensagem').textContent=text;$('auth-mensagem').dataset.erro=String(falha);}
  function campo(form,id,label,type='text',options){const l=el('label',label,form);l.htmlFor=id;const n=el(options?'select':type==='textarea'?'textarea':'input',null,form);n.id=id;n.name=id;if(!options&&type!=='textarea')n.type=type;if(options)for(const [v,t] of options){const o=el('option',t,n);o.value=v;}return n;}
  function form(parent,id,submit){const f=el('form',null,parent);f.id=id;f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('[type=submit]');if(b.disabled)return;b.disabled=true;try{await submit();f.closest('dialog')?.close();}catch(e){erro(e.message,true);}finally{b.disabled=false;}};return f;}
  function settingsCard(parent,title,description,buttonLabel){
    const card=el('article',null,parent);card.className='settings-card';el('h3',title,card);el('p',description,card);
    const dialog=el('dialog',null,card);dialog.className='workspace-dialog';
    const heading=el('h2',title,dialog);heading.id='settings-title-'+(++modalSequence);dialog.setAttribute('aria-labelledby',heading.id);
    botao('Fechar',dialog,()=>dialog.close()).className='secondary dialog-close';
    botao(buttonLabel,card,()=>dialog.showModal()).className='settings-open';
    const clearPasswords=()=>{for(const field of dialog.querySelectorAll('input[type=password]'))field.value='';};
    dialog.addEventListener('cancel',clearPasswords);dialog.addEventListener('close',clearPasswords);
    return dialog;
  }
  function registryTable(parent,title,columns,id){const scroll=el('div',null,parent);scroll.className='registry-table-scroll';const table=el('table',null,scroll);table.className='registry-table';table.setAttribute('aria-label',title);const head=el('tr',null,el('thead',null,table));for(const label of columns)el('th',label,head).scope='col';const body=el('tbody',null,table);if(id)body.id=id;return body;}
  function tableCell(row,text){return el('td',text==null?'—':String(text),row);}
  function stateCell(row,active,on='Ativo',off='Inativo'){const badge=el('span',active?on:off,tableCell(row,''));badge.className='registry-badge';badge.dataset.active=String(!!active);}
  function compactSettings(dialog,parent){const card=dialog.parentElement,button=card.querySelector('.settings-open');parent.append(button,dialog);card.remove();parent.classList.add('registry-toolbar');}
  function salvar(f,text){const b=el('button',text,f);b.type='submit';}
  function headers(local=true){return {'content-type':'application/json','x-csrf-token':sessao.csrf,...(local&&contexto?{'x-context-type':'escritorio','x-context-id':String(contexto.escritorio_id),...(contexto.concessao?{'x-support-grant':contexto.concessao}:{})}:{})};}
  async function api(path,method='GET',body,local=true){const r=await fetch(path,{method,headers:headers(local),credentials:'same-origin',body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();if(!r.ok){if(r.status===401)location.replace('/login');throw new Error(d.erro||'Falha na operação.');}return d;}
  const ativoOptions=[['true','Ativo'],['false','Inativo']];
  const papelOptions=[['operador','Operador'],['administrador','Administrador'],['cliente','Representante de empresa']];
  async function plataforma(){
    const parent=$('gestao-plataforma'),feedback=$('workspace-feedback');
    if(feedback&&parent.contains(feedback))document.querySelector('.workspace-nav').after(feedback);
    parent.replaceChildren();if(!sessao.painel_global)return;
    el('h2','Escritórios da plataforma',parent);el('p','Gerencie os escritórios, o catálogo compartilhado e as opções da operação local.',parent);const toolbar=el('div',null,parent);const lista=registryTable(parent,'Escritórios cadastrados',['Escritório','CNPJ','Contato','Situação','Ações'],'escritorios-lista');
    const box=el('section',null,parent);box.className='settings-grid';let edit=null;
    const dialog=settingsCard(box,'Cadastro de escritório','Gerencie os dados cadastrais e a situação dos escritórios da plataforma.','Novo escritório');
    const f=form(dialog,'escritorio-global-form',async()=>{const d={nome:nome.value,cnpj:cnpj.value,email:email.value,telefone:tel.value,ativo:ativo.value==='true'};await api('/api/plataforma/escritorios'+(edit?'/'+edit.id:''),edit?'PUT':'POST',d,false);await plataforma();erro('Escritório salvo. Recarregue a página para atualizar o seletor de contextos.');});
    const nome=campo(f,'escritorio-global-nome','Nome do escritório'),cnpj=campo(f,'escritorio-global-cnpj','CNPJ do escritório'),email=campo(f,'escritorio-global-email','E-mail do escritório','email'),tel=campo(f,'escritorio-global-telefone','Telefone do escritório'),ativo=campo(f,'escritorio-global-ativo','Situação do escritório','text',ativoOptions);
    nome.required=cnpj.required=true;nome.minLength=2;salvar(f,'Salvar escritório');
    dialog.parentElement.querySelector('.settings-open').onclick=()=>{edit=null;f.reset();dialog.querySelector('h2').textContent='Novo escritório';dialog.showModal();};
    compactSettings(dialog,toolbar);box.remove();
    for(const row of await api('/api/plataforma/escritorios','GET',undefined,false)){
      const tr=el('tr',null,lista);tableCell(tr,row.nome);tableCell(tr,row.cnpj||'Sem CNPJ');tableCell(tr,[row.email,row.telefone].filter(Boolean).join(' · ')||'Não informado');stateCell(tr,row.ativo);const li=tableCell(tr,'');li.className='registry-actions';
      botao('Editar escritório',li,()=>{edit=row;nome.value=row.nome;cnpj.value=row.cnpj||'';email.value=row.email;tel.value=row.telefone;ativo.value=String(row.ativo);dialog.querySelector('h2').textContent='Editar escritório';dialog.showModal();});
      botao('Excluir escritório vazio',li,async()=>{await api('/api/plataforma/escritorios/'+row.id,'DELETE',undefined,false);await plataforma();erro('Escritório excluído.');});
    }
    if(sessao.capacidades?.monitoramento_execucoes){
      const collection=await api('/api/plataforma/coleta','GET',undefined,false);
      const operations=el('article',null,parent);operations.className='settings-card';el('h2','Coleta local',operations);
      el('p','Opções carregadas pelo processo da interface. O consumidor deve iniciar com o mesmo ambiente para usar estes valores.',operations);
      const details=el('details',null,operations);el('summary','Ver opções de coleta',details);const fields=el('dl',null,details);
      for(const [title,value] of [['Navegador',collection.canal||'Chromium do Playwright'],['Exibir janela',collection.headless?'Não':'Sim'],['Timeout de navegação',`${collection.timeout_ms/1000} segundos`],['Timeout do formulário',`${collection.formulario_timeout_ms/1000} segundos`],['Máximo de páginas por consulta',String(collection.max_paginas)]]){el('dt',title,fields);el('dd',value,fields);}
      el('p','Ajuste HEADLESS, BROWSER_CHANNEL, REQUEST_TIMEOUT_MS, FORM_TIMEOUT_MS e MAX_PAGES no ambiente local e reinicie os processos. Limites de duração e volume continuam definidos por escritório.',details);
      el('p','Slack está disponível somente no monitor global legado. O fluxo por escritório usa SMTP e disponibilização pelo portal.',details);
      const catalog=el('section',null,parent);catalog.className='platform-catalog';el('h2','Catálogo compartilhado de sindicatos',catalog);el('p','Cadastre a identidade do sindicato. Filtros e consultas são configurados separadamente em cada escritório.',catalog);
      const rows=await api('/api/plataforma/sindicatos','GET',undefined,false);
      const modal=settingsCard(catalog,'Sindicato','O catálogo é compartilhado. Inativar preserva vínculos e histórico.','Novo sindicato');let editing=null;
      const formUnion=form(modal,'sindicato-plataforma-form',async()=>{await api('/api/plataforma/sindicatos'+(editing?'/'+editing.id:''),editing?'PUT':'POST',{nome:unionName.value,cnpj:unionCnpj.value,ativo:unionActive.value==='true'},false);await plataforma();erro('Sindicato salvo no catálogo compartilhado.');});
      const unionName=campo(formUnion,'sindicato-plataforma-nome','Nome do sindicato'),unionCnpj=campo(formUnion,'sindicato-plataforma-cnpj','CNPJ do sindicato'),unionActive=campo(formUnion,'sindicato-plataforma-ativo','Situação do sindicato','text',ativoOptions);unionName.required=true;unionName.minLength=2;unionName.maxLength=250;unionCnpj.maxLength=25;salvar(formUnion,'Salvar sindicato');
      modal.parentElement.querySelector('.settings-open').onclick=()=>{editing=null;formUnion.reset();modal.showModal();};
      const unionToolbar=el('div',null,catalog);compactSettings(modal,unionToolbar);
      const list=registryTable(catalog,'Catálogo de sindicatos',['Sindicato','CNPJ','Situação','Ações'],'sindicatos-plataforma-lista');for(const row of rows){const tr=el('tr',null,list);tableCell(tr,row.nome);tableCell(tr,row.cnpj||'Sem CNPJ');stateCell(tr,row.ativo);const li=tableCell(tr,'');li.className='registry-actions';botao('Editar sindicato',li,()=>{editing=row;unionName.value=row.nome;unionCnpj.value=row.cnpj||'';unionActive.value=String(row.ativo);modal.showModal();});}if(!rows.length)tableCell(el('tr',null,list),'Nenhum sindicato cadastrado.').colSpan=4;
    }
  }
  async function gestao(g){
    const parent=$('gestao-local');parent.replaceChildren();
    if(contexto.tipo!=='escritorio'||contexto.papel!=='administrador')return;
    el('h2','Configurações do escritório',parent);el('p','Organize os dados do escritório, os canais de envio e os acessos da equipe.',parent);
    const [office,users,clientes]=await Promise.all([api('/api/contexto/escritorio'),api('/api/contexto/usuarios'),api('/api/contexto/clientes')]);if(g!==geracao)return;
    const cards=el('div',null,parent);cards.className='settings-grid';
    const officeDialog=settingsCard(cards,'Dados do escritório',`${office.nome} · Informações usadas nos cadastros e no atendimento.`,'Editar dados do escritório');
    const f=form(officeDialog,'escritorio-local-form',async()=>{await api('/api/contexto/escritorio','PUT',{nome:nome.value,email:email.value,telefone:tel.value});if(g===geracao){erro('Dados do escritório salvos.');officeDialog.parentElement.querySelector('p').textContent=`${nome.value} · Informações usadas nos cadastros e no atendimento.`;}});
    const nome=campo(f,'escritorio-local-nome','Nome público do escritório'),email=campo(f,'escritorio-local-email','E-mail de atendimento','email'),tel=campo(f,'escritorio-local-telefone','Telefone de atendimento');nome.value=office.nome;nome.required=true;email.value=office.email;tel.value=office.telefone;salvar(f,'Salvar dados do escritório');
    const smtp=await api('/api/contexto/smtp');if(g!==geracao)return;
    const smtpDialog=settingsCard(cards,'Envio por e-mail',smtp.ativo?'Canal ativo. Ajuste servidor, remetente e credenciais.':'Canal desativado. Configure o servidor e o remetente do escritório.','Configurar envio por e-mail');
    const sf=form(smtpDialog,'smtp-escritorio-form',async()=>{const out=await api('/api/contexto/smtp','PUT',{ativo:sa.value==='true',host:sh.value,port:Number(sp.value),secure:ss.value==='true',user:su.value,password:sx.value||undefined,limparSenha:sl.checked,from:sfrom.value});sx.value='';sl.checked=false;sh.value=out.host;sp.value=String(out.port);ss.value=String(out.secure);su.value=out.user;sfrom.value=out.from;sa.value=String(out.ativo);senhaStatus.textContent=out.temSenha?'Senha cadastrada. Para trocar, digite outra senha.':'Nenhuma senha SMTP cadastrada.';if(g===geracao){erro('Configuração SMTP salva para este escritório.');smtpDialog.parentElement.querySelector('p').textContent=out.ativo?'Canal ativo. Ajuste servidor, remetente e credenciais.':'Canal desativado. Configure o servidor e o remetente do escritório.';}});
    const sa=campo(sf,'smtp-escritorio-ativo','Ativar envio por SMTP','text',[['false','Desativado'],['true','Ativado']]),sh=campo(sf,'smtp-escritorio-host','Servidor SMTP'),sp=campo(sf,'smtp-escritorio-porta','Porta','number'),ss=campo(sf,'smtp-escritorio-secure','TLS implícito (porta 465)','text',[['false','Não'],['true','Sim']]),su=campo(sf,'smtp-escritorio-usuario','Usuário SMTP'),sx=campo(sf,'smtp-escritorio-senha','Senha SMTP','password'),sfrom=campo(sf,'smtp-escritorio-remetente','Remetente');
    const sl=document.createElement('input');sl.type='checkbox';sl.id='smtp-escritorio-limpar';const ll=el('label','Apagar senha salva',sf);ll.htmlFor=sl.id;sf.append(sl);const senhaStatus=el('p',smtp.temSenha?'Senha cadastrada. Para trocar, digite outra senha.':'Nenhuma senha SMTP cadastrada.',sf);
    sa.value=String(smtp.ativo);sh.value=smtp.host;sp.value=String(smtp.port);ss.value=String(smtp.secure);su.value=smtp.user;sfrom.value=smtp.from;sp.min='1';sp.max='65535';sx.autocomplete='new-password';salvar(sf,'Salvar SMTP deste escritório');
    const teamDialog=settingsCard(cards,'Equipe e acessos',`${users.funcionarios.length} vínculo(s) da equipe · ${users.representantes.length} representante(s) de empresas.`,'Gerenciar equipe e acessos');
    el('p','A conta é pessoal. Revogar remove somente o vínculo com este escritório. Vincular uma conta existente preserva sua senha.',teamDialog);
    teamDialog.classList.add('workspace-dialog-wide');
    const lista=registryTable(teamDialog,'Equipe e representantes',['Pessoa','Vínculo','Situação','Permissões e ações'],'usuarios-lista');
    for(const u of [...users.funcionarios,...users.representantes]){
      const tr=el('tr',null,lista),person=tableCell(tr,u.nome);el('small',u.email,person);tableCell(tr,u.cliente_id?'Representante da empresa '+u.cliente_id:({administrador:'Administrador',operador:'Operador'})[u.papel]||u.papel);stateCell(tr,u.ativo,'Ativo','Revogado');const li=tableCell(tr,'');
      let papel;if(!u.cliente_id){papel=campo(li,`papel-usuario-${u.id}`,'Papel de '+u.nome,'text',papelOptions.slice(0,2));papel.value=u.papel;botao('Salvar papel',li,async()=>{await api('/api/contexto/usuarios/'+u.id,'PUT',{ativo:!!u.ativo,papel:papel.value});if(g===geracao)await gestao(g);});}
      botao(u.ativo?'Revogar vínculo':'Reativar vínculo',li,async()=>{await api('/api/contexto/usuarios/'+u.id,'PUT',{ativo:!u.ativo,...(u.cliente_id?{cliente_id:u.cliente_id}:{papel:u.papel})});if(g===geracao)await gestao(g);});
    }
    const uf=form(teamDialog,'usuario-contexto-form',async()=>{
      const d={modo:modo.value,email:ue.value,papel:up.value,...(up.value==='cliente'?{cliente_id:Number(uc.value)}:{}),...(modo.value==='cadastrar'?{nome:un.value,senha:us.value}:{})};
      await api('/api/contexto/usuarios','POST',d);us.value='';if(g===geracao){await gestao(g);erro('Conta e vínculo registrados.');}
    });
    const modo=campo(uf,'usuario-modo','Operação de usuário','text',[['cadastrar','Cadastrar nova conta'],['vincular','Vincular conta existente']]),un=campo(uf,'usuario-nome','Nome do novo usuário'),ue=campo(uf,'usuario-email','E-mail do usuário','email'),us=campo(uf,'usuario-senha','Senha inicial da nova conta','password'),up=campo(uf,'usuario-papel','Tipo de vínculo','text',papelOptions),uc=campo(uf,'usuario-cliente','Empresa representada','text',clientes.map(c=>[String(c.id),c.razao_social]));
    ue.required=true;us.minLength=15;us.maxLength=128;us.autocomplete='new-password';
    const vis=()=>{un.disabled=us.disabled=modo.value!=='cadastrar';un.required=us.required=modo.value==='cadastrar';uc.disabled=up.value!=='cliente';uc.required=up.value==='cliente';if(us.disabled)us.value='';};modo.onchange=up.onchange=vis;vis();salvar(uf,'Salvar usuário e vínculo');
    const historyDialog=settingsCard(cards,'Histórico do escritório','Consulte as ações registradas e seus responsáveis.','Abrir histórico do escritório');historyDialog.classList.add('workspace-dialog-wide');const logs=el('div',null,historyDialog);botao('Consultar histórico deste escritório',historyDialog,async()=>{const rows=await api('/api/contexto/logs');if(g!==geracao)return;logs.replaceChildren();for(const l of rows)el('p',`${new Date(l.criado_em).toLocaleString()} · ${l.acao} · usuário ${l.ator_id}`,logs);});
    if(contexto.escritorio_id===1)botao('Consultar histórico anterior à separação',historyDialog,async()=>{const rows=await api('/api/contexto/interpretacoes/legado');if(g!==geracao)return;logs.replaceChildren();for(const l of rows)el('pre',`${l.entidade}\n${l.conteudo_json}`,logs);});
  }
  async function enviosEscritorio(parent,g){
    let box=parent.querySelector('#envios-contexto');if(!box){box=el('section',null,parent);box.id='envios-contexto';}else box.replaceChildren();
    el('h3','Envios deste escritório',box);
    el('p','Confira destinatários e documentos antes de aprovar. Acompanhe o resultado de cada tentativa.',box);
    const controles=el('div',null,box);controles.className='row delivery-actions';
    if(['administrador','operador'].includes(contexto.papel))botao('Preparar pendentes',controles,async()=>{const r=await api('/api/contexto/envios/preparar','POST',{});if(g!==geracao)return;erro(`${r.preparados} prévia(s) preparada(s); ${r.bloqueados} bloqueio(s).`);await enviosEscritorio(parent,g);});
    if(contexto.papel==='administrador'&&sessao.capacidades?.fila_manual){
      botao('Processar fila aprovada',controles,async()=>{const r=await api('/api/contexto/envios/processar','POST',{});if(g!==geracao)return;erro(`${r.enviados} envio(s) aceito(s); ${r.falhas} falha(s).`);await enviosEscritorio(parent,g);});
      botao('Recuperar envios interrompidos',controles,async()=>{const r=await api('/api/contexto/envios/recuperar','POST',{});if(g!==geracao)return;erro(`${r.recuperados} envio(s) marcado(s) para conferência.`);await enviosEscritorio(parent,g);});
    }
    botao('Atualizar envios',controles,()=>enviosEscritorio(parent,g));
    const lista=el('ul',null,box);lista.id='envios-contexto-lista';
    const linhas=await api('/api/contexto/envios');if(g!==geracao)return;
    if(!linhas.length){el('li','Nenhum envio preparado para este escritório.',lista);return;}
    const rotulos={bloqueado:'Bloqueado',preparando:'Preparando',revisao:'Aguardando revisão',na_fila:'Na fila',enviando:'Enviando',enviado:'Aceito pelo SMTP',falhou:'Falhou',cancelado:'Cancelado',incerto:'Resultado incerto'};
    const indicators=el('dl',null,box);indicators.className='delivery-indicators';box.insertBefore(indicators,controles);
    for(const [label,states] of [['Em revisão',['revisao']],['Na fila',['na_fila','enviando','preparando']],['Aceitos pelo SMTP',['enviado']],['Precisam de atenção',['bloqueado','falhou','incerto']]]){const card=el('div',null,indicators);el('dt',label,card);el('dd',String(linhas.filter(item=>states.includes(item.status)).length),card);}
    el('p','Indicadores dos envios carregados nesta lista. Aceite pelo SMTP não confirma entrega ou abertura pelo destinatário.',box).className='delivery-note';
    const filters=el('div',null,box);filters.className='delivery-filters';box.insertBefore(filters,lista);
    const search=campo(filters,'envios-busca','Buscar empresa, registro ou destinatário','search');search.placeholder='Empresa, registro ou destinatário';
    const state=campo(filters,'envios-situacao','Situação do envio','text',[['','Todas as situações'],...Object.entries(rotulos)]);
    const noResults=el('p','Nenhum envio corresponde aos filtros.',box);noResults.hidden=true;
    const normalized=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
    const applyFilters=()=>{let count=0;const query=normalized(search.value.trim());for(const li of lista.children){li.hidden=!!state.value&&li.dataset.status!==state.value||!!query&&!li.dataset.search.includes(query);if(!li.hidden)count++;}noResults.hidden=count>0;};search.oninput=state.onchange=applyFilters;
    for(const envio of linhas){
      const li=el('li',null,lista);li.dataset.status=envio.status;li.dataset.search=normalized(`${envio.numero_registro} ${envio.razao_social} ${envio.nome} ${envio.email}`);const heading=el('div',null,li);heading.className='delivery-card-heading';el('strong',envio.razao_social,heading);const badge=el('span',rotulos[envio.status]||envio.status,heading);badge.className='delivery-state';badge.dataset.status=envio.status;el('p',`${envio.numero_registro} · ${envio.nome} · ${envio.email}`,li).className='delivery-recipient';
      if(envio.erro||envio.motivo)el('p',envio.erro||envio.motivo,li).className='delivery-diagnostic';
      const detalhe=el('details',null,li);el('summary','Prévia e ações',detalhe);
      const snapshot=envio.snapshot;
      if(snapshot){el('p',snapshot.assunto,detalhe);el('pre',snapshot.texto,detalhe);for(const [i,a] of snapshot.anexos.entries()){const link=el('a',`${a.nome} (${a.bytes} bytes)`,detalhe);link.href=`/api/contexto/envios/${envio.id}/anexos/${i}`;link.onclick=async event=>{event.preventDefault();try{const r=await fetch(link.href,{headers:headers(),credentials:'same-origin'});if(!r.ok)throw new Error('Não foi possível baixar o anexo.');const blob=await r.blob(),url=URL.createObjectURL(blob),download=el('a');download.href=url;download.download=a.nome;download.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){erro(e.message,true);}};}}
      else el('p','Ainda não há prévia. Use Preparar pendentes.',detalhe);
      if(envio.tentativas_historico?.length){const historico=el('details',null,detalhe);el('summary','Histórico de tentativas',historico);for(const item of envio.tentativas_historico)el('p',`${item.criado_em} · ${item.resultado}${item.erro?' · '+item.erro:''}`,historico);}
      if(envio.status==='revisao'&&snapshot&&envio.aplicabilidade==='confirmado'&&contexto.papel==='administrador'){
        const aceite=el('label',null,detalhe),check=el('input',null,aceite);check.type='checkbox';el('span',' Conferi o destinatário, a análise e os anexos.',aceite);
        botao('Aprovar e colocar na fila',detalhe,async()=>{if(!check.checked)throw new Error('Confirme a revisão antes de aprovar.');await api(`/api/contexto/envios/${envio.id}/aprovar`,'POST',{previsualizacao_hash:envio.previsualizacao_hash});if(g===geracao){erro('Envio aprovado pelo usuário autenticado e colocado na fila.');await enviosEscritorio(parent,g);}});
      }
      if(['bloqueado','revisao','falhou','incerto'].includes(envio.status)&&contexto.papel==='administrador')botao(envio.status==='incerto'?'Repreparar após conferir provedor':'Repreparar',detalhe,async()=>{const confirmar_risco=envio.status==='incerto'&&confirm('Confirma que conferiu o provedor SMTP e aceita o risco de duplicidade?');if(envio.status==='incerto'&&!confirmar_risco)return;await api(`/api/contexto/envios/${envio.id}/repreparar`,'POST',{confirmar_risco});if(g===geracao){await enviosEscritorio(parent,g);}});
      if(!['enviado','enviando','preparando','cancelado'].includes(envio.status)&&contexto.papel==='administrador')botao('Cancelar envio',detalhe,async()=>{if(!confirm('Cancelar este envio?'))return;await api(`/api/contexto/envios/${envio.id}/cancelar`,'POST',{});if(g===geracao)await enviosEscritorio(parent,g);});
    }
  }
  async function interpretacoes(g){
    for(const dialog of document.querySelectorAll('[data-document-sheet]')){if(dialog.open)dialog.close();dialog.remove();}const parent=$('interpretacoes-local');parent.replaceChildren();
    if(contexto.tipo!=='escritorio')return;
    const [catalogo,clientes]=await Promise.all([api('/api/contexto/interpretacoes'),api('/api/contexto/clientes')]);if(g!==geracao)return;
    el('h2','Instrumentos do escritório',parent);el('p','Consulte os instrumentos relacionados aos clientes deste escritório. As consolidações e decisões são privadas.',parent);
    const catalog=el('section',null,parent);catalog.className='platform-catalog';catalog.className='instrument-catalog';
    const tools=el('div',null,catalog);tools.className='document-toolbar';
    const query=campo(tools,'instrumentos-busca','Buscar instrumento por número','search');
    const type=campo(tools,'instrumentos-tipo','Tipo de instrumento','text',[['','Todos os tipos'],...[...new Set(catalogo.documentos.map(item=>item.tipo||'Tipo não informado'))].sort().map(value=>[value,value])]);
    const order=campo(tools,'instrumentos-ordem','Ordenar instrumentos','text',[['asc','Número crescente'],['desc','Número decrescente']]);botao('Atualizar lista',tools,()=>interpretacoes(g));const count=el('p','',catalog);count.setAttribute('role','status');
    const metrics=el('div',null,catalog);metrics.className='document-metrics';for(const [label,value] of [['Instrumentos',catalogo.documentos.length],['Convenções coletivas',catalogo.documentos.filter(d=>/conven[çc][ãa]o coletiva/i.test(d.tipo)&&!/aditivo/i.test(d.tipo)).length],['Aditivos',catalogo.documentos.filter(d=>/aditivo/i.test(d.tipo)).length],['Vínculos confirmados',catalogo.vinculos.filter(v=>v.base).length]]){const card=el('article',null,metrics);el('span',label,card);el('strong',String(value),card);}catalog.prepend(metrics);const browser=el('div',null,catalog);browser.className='document-table-scroll';
    const instrumentTable=el('table',null,browser);instrumentTable.className='registry-table';instrumentTable.setAttribute('aria-label','Instrumentos disponíveis');const instrumentHead=el('tr',null,el('thead',null,instrumentTable));for(const title of ['Documento','Tipo','Original','Ações'])el('th',title,instrumentHead).scope='col';const instruments=el('tbody',null,instrumentTable);
    const instrumentPanel=el('dialog',null,document.body);instrumentPanel.dataset.documentSheet='true';instrumentPanel.className='workspace-dialog document-sheet';instrumentPanel.setAttribute('aria-label','Ficha do documento');botao('Fechar',instrumentPanel,()=>instrumentPanel.close()).className='secondary dialog-close';instrumentPanel.setAttribute('aria-label','Ficha do documento');
    const instrumentActions=el('div',null,instrumentPanel);instrumentActions.className='instrument-actions';
    const instrumentContent=el('div',null,instrumentPanel);let detailRequest=0,selectedInstrument=null;
    function markInstrument(){for(const button of instruments.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.number===selectedInstrument));}

    const labels={numero_registro:'Registro no MTE',numero_solicitacao:'Solicitação',tipo:'Tipo de instrumento',vigencia:'Vigência',partes:'Partes',analise_status:'Situação da análise',analise_concluida_em:'Análise concluída em',padrao:'Extração estruturada',campos:'Campos extraídos',topicos:'Tópicos',aditivo:'Alterações do aditivo',alteracoes:'Alterações',observacoes:'Observações',evidencias:'Evidências',resumo:'Resumo',clausula:'Cláusula',citacao:'Trecho do documento',campo:'Campo',acao:'Ação',valor:'Valor'};
    function renderAnalysis(value,parent,key=''){
      if(value===null||value===undefined)return;
      if(typeof value!=='object'){const card=el('article',null,parent);card.className='settings-card';if(key)el('h4',labels[key]||key.replace(/^s\d+_/,'').replaceAll('_',' '),card);el('p',String(value),card);return;}
      for(const [name,item] of Object.entries(value)){if(item===null||item===undefined)continue;if(typeof item==='object'){const section=el('section',null,parent);el('h4',Array.isArray(value)?`Item ${Number(name)+1}`:labels[name]||name.replace(/^s\d+_/,'').replaceAll('_',' '),section);renderAnalysis(item,section);}else renderAnalysis(item,parent,Array.isArray(value)?'':name);}
    }
    async function showInstrument(item){
      if(!instrumentPanel.open)instrumentPanel.showModal();const request=++detailRequest;selectedInstrument=item.numero_registro;markInstrument();instrumentActions.replaceChildren();renderInstrumentActions(item,instrumentActions);instrumentContent.replaceChildren();el('h2',item.numero_registro,instrumentContent);el('p','Carregando detalhes…',instrumentContent).setAttribute('role','status');
      try{const data=await api('/api/contexto/interpretacoes?numero='+encodeURIComponent(item.numero_registro));if(g!==geracao||request!==detailRequest||selectedInstrument!==item.numero_registro)return;instrumentContent.replaceChildren();el('h2',data.numero_registro,instrumentContent);
        const navigation=el('nav',null,instrumentContent);navigation.className='instrument-detail-nav';navigation.setAttribute('aria-label','Conteúdo do instrumento');
        const panes=new Map(),tabs=new Map();
        const cct=/conven[çc][ãa]o coletiva/i.test(item.tipo)&&!/aditivo/i.test(item.tipo);
        const selectTab=async key=>{for(const [name,pane] of panes)pane.hidden=name!==key;for(const [name,button] of tabs)button.setAttribute('aria-pressed',String(name===key));if(key==='consolidacao'){base.value=item.numero_registro;panes.get(key).append(detalhe);detalhe.hidden=false;await mostrar();}};
        for(const [key,label] of [['info','Visão geral'],['original','Original'],['analysis','Análise'],...(cct?[['consolidacao','Consolidação']]:[]),['aditivos','Aditivos'],['clientes','Clientes']]){const pane=el('section',null,instrumentContent);pane.hidden=true;panes.set(key,pane);const button=botao(label,navigation,()=>selectTab(key));button.dataset.documentTab=key;tabs.set(key,button);}
        const info=panes.get('info'),analysis=panes.get('analysis');await selectTab('info');
        el('h3','Documento original',panes.get('original'));renderInstrumentActions(item,panes.get('original'));
        const related=panes.get('aditivos');el('h3','Vínculos confirmados',related);const links=catalogo.vinculos.filter(v=>v.base===item.numero_registro||v.aditivo===item.numero_registro);if(!links.length)el('p','Nenhum vínculo confirmado.',related);for(const link of links)el('p',`${link.aditivo} · CCT ${link.base||'não vinculada'} · ${link.justificativa}`,related);
        const clientPane=panes.get('clientes');el('h3','Clientes relacionados',clientPane);const relatedClients=clientes.filter(c=>(item.clientes_ids||[item.cliente_original_id]).map(String).includes(String(c.id)));for(const client of relatedClients)el('p',client.nome_fantasia||client.razao_social,clientPane);if(!relatedClients.length)el('p','Nenhum cliente relacionado disponível.',clientPane);
        const fields=el('div',null,info);fields.className='record-fields';for(const key of ['numero_solicitacao','tipo','vigencia','partes','analise_status','analise_concluida_em'])renderAnalysis(data[key]||'Não informado',fields,key);
        el('h3','Análise do instrumento',analysis);el('p','Confira as informações no documento original antes de tomar decisões. Esta extração não substitui a revisão do escritório.',analysis);
        if(data.analise)renderAnalysis(data.analise,analysis);else el('p','Ainda não há análise disponível para este instrumento.',analysis);
      }catch(error){if(g===geracao&&request===detailRequest&&selectedInstrument===item.numero_registro){instrumentContent.replaceChildren();el('p',error.message,instrumentContent).setAttribute('role','alert');}}
    }
    function renderInstrumentActions(item,li){if(item.original_disponivel&&item.cliente_original_id)botao('Baixar original',li,async()=>{const response=await fetch(`/api/contexto/clientes/${encodeURIComponent(item.cliente_original_id)}/documentos/original?numero=${encodeURIComponent(item.numero_registro)}`,{headers:headers(),credentials:'same-origin'});if(g!==geracao)return;if(!response.ok)throw new Error((await response.json()).erro||'Não foi possível baixar o original.');const blob=await response.blob();if(g!==geracao)return;const url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=item.numero_registro.replace(/[^A-Z0-9_-]/gi,'_')+(response.headers.get('content-type')==='application/pdf'?'.pdf':'.doc');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});else el('p','Original ainda não disponível.',li);const cct=/conven[çc][ãa]o coletiva/i.test(item.tipo)&&!/aditivo/i.test(item.tipo);if(cct)botao('Consultar consolidação',li,async()=>{await showInstrument(item);instrumentContent.querySelector('[data-document-tab=consolidacao]')?.click();});else{const link=catalogo.vinculos.find(v=>v.aditivo===item.numero_registro);el('p',link?.base?`CCT vinculada: ${link.base}`:'Consulte o original e a aplicabilidade na área de documentos do cliente.',li);}}
    const renderCatalog=()=>{
      instruments.replaceChildren();const rows=catalogo.documentos.filter(item=>item.numero_registro.toLowerCase().includes(query.value.trim().toLowerCase())&&(!type.value||(item.tipo||'Tipo não informado')===type.value)).sort((a,b)=>a.numero_registro.localeCompare(b.numero_registro,'pt-BR')*(order.value==='desc'?-1:1));
      count.textContent=`${rows.length} instrumento(s) de ${catalogo.documentos.length} disponíveis neste escritório.`;
      for(const item of rows){const row=el('tr',null,instruments);tableCell(row,item.numero_registro);tableCell(row,item.tipo||'Tipo não informado');stateCell(row,item.original_disponivel,'Disponível','Pendente');const actions=tableCell(row,'');const select=botao('Abrir ficha',actions,()=>showInstrument(item));select.dataset.number=item.numero_registro;select.setAttribute('aria-label',`Abrir ficha de ${item.numero_registro}`);}
      if(!rows.length){detailRequest++;selectedInstrument=null;instrumentActions.replaceChildren();instrumentContent.replaceChildren();const empty=tableCell(el('tr',null,instruments),catalogo.documentos.length?'Nenhum instrumento corresponde aos filtros.':'Nenhum instrumento relacionado aos clientes deste escritório.');empty.colSpan=4;}
      else if(!rows.some(item=>item.numero_registro===selectedInstrument))selectedInstrument=null;
      markInstrument();
    };
    query.oninput=type.onchange=order.onchange=renderCatalog;
    const consolidation=el('section',null,parent);consolidation.id='consolidacoes-contexto';consolidation.hidden=true;
    el('h3','Consolidações e revisões',consolidation);el('p','Selecione uma CCT para conferir as alterações e revisar as regras antes da publicação.',consolidation);
    const bases=catalogo.documentos.filter(d=>/conven[çc][ãa]o coletiva/i.test(d.tipo)&&!/aditivo/i.test(d.tipo)),aditivos=catalogo.documentos.filter(d=>/aditivo/i.test(d.tipo)&&/conven[çc][ãa]o/i.test(d.tipo));
    const base=campo(consolidation,'interpretacao-base','CCT original','text',[['','Selecione a CCT'],...bases.map(d=>[d.numero_registro,d.numero_registro])]);
    base.hidden=true;base.previousElementSibling.hidden=true;
    const search=campo(consolidation,'interpretacao-busca','Buscar CCT por número','search');search.placeholder='Ex.: DF000001/2026';
    const layout=el('div',null,consolidation);layout.className='document-review-list';
    const list=el('div',null,layout);list.className='document-review-cards';list.setAttribute('aria-label','CCTs disponíveis');
    const detalhe=el('section',null,layout);detalhe.id='interpretacao-detalhe';let revisaoCarga=0;
    const renderList=()=>{list.replaceChildren();const matching=bases.filter(item=>item.numero_registro.toLowerCase().includes(search.value.trim().toLowerCase()));for(const item of matching){const button=botao(item.numero_registro,list,async()=>{await showInstrument(item);instrumentContent.querySelector('[data-document-tab=consolidacao]')?.click();});button.className='record-select';button.setAttribute('aria-pressed',String(base.value===item.numero_registro));el('span','Convenção coletiva',button);}if(!matching.length)el('p',bases.length?'Nenhuma CCT corresponde à busca.':'Nenhuma CCT disponível para consolidação neste escritório.',list);};
    search.oninput=renderList;renderList();detalhe.hidden=true;
    const editar=['administrador','operador'].includes(contexto.papel);
    async function mostrar(){const pedido=++revisaoCarga;detalhe.replaceChildren();if(!base.value){el('p','Selecione uma CCT para consultar a consolidação e as revisões.',detalhe);return;}const numero=base.value;const loading=el('p','Carregando documento…',detalhe);loading.setAttribute('role','status');let r;try{r=await api('/api/contexto/interpretacoes?base='+encodeURIComponent(numero));}catch(error){if(g!==geracao||pedido!==revisaoCarga)return;loading.textContent=error.message;return;}if(g!==geracao||pedido!==revisaoCarga)return;detalhe.replaceChildren();
      el('h3',numero,detalhe);el('p',r.versao?`Versão ${r.versao.slice(0,16)}${r.desatualizado?' · Desatualizada':''}`:'Ainda não consolidada neste escritório.',detalhe);
      if(editar)botao('Consolidar neste escritório',detalhe,async()=>{await api('/api/contexto/interpretacoes/consolidar','POST',{base:numero});if(g===geracao&&base.value===numero)await mostrar();});
      for(const v of r.vinculos)el('p',`Aditivo: ${v.aditivo} · ${v.justificativa}`,detalhe);
      if(r.desatualizado)el('p','Atualize a consolidação antes de revisar ou publicar esta versão.',detalhe).className='document-warning';
      if(r.resultado){if(r.resultado.pendencias.length)el('p',`${r.resultado.pendencias.length} pendência(s) impedem relatórios finais e publicação.`,detalhe).className='document-warning';
        const fieldLabel=name=>{const text=name.replace(/^s\d+_/,'').replaceAll('_',' ');return text.charAt(0).toUpperCase()+text.slice(1);};
        const rules=el('details',null,detalhe);rules.className='consolidated-rules';el('summary',`Regras consolidadas · ${Object.keys(r.resultado.padrao.campos).length} campos`,rules);
        const fields=el('div',null,rules);fields.className='record-fields';for(const [name,value] of Object.entries(r.resultado.padrao.campos)){const card=el('article',null,fields);el('h4',fieldLabel(name),card);el('p',String(value),card);}
        for(const [c,items] of Object.entries(r.resultado.historico))for(const item of items.filter(x=>!x.aplicada)){
          const old=r.revisoes.find(x=>x.campo===c&&x.aditivo===item.instrumento);el('p',`${fieldLabel(c)} · ${item.instrumento} · ${old?'Decisão: '+old.acao+' — '+old.justificativa:'Pendente'} · Evidência: ${item.citacao}`,detalhe);
          if(!editar||r.desatualizado)continue;
          const reviewDialog=el('dialog',null,detalhe);reviewDialog.className='workspace-dialog';reviewDialog.setAttribute('aria-label','Revisar '+fieldLabel(c));el('h2','Revisar '+fieldLabel(c),reviewDialog);el('h3','Regra atual',reviewDialog);el('p',String(r.resultado.padrao.campos[c]??'Não informada'),reviewDialog);el('h3','Alteração proposta',reviewDialog);el('p',`Aditivo ${item.instrumento} · Evidência: ${item.citacao}`,reviewDialog);botao('Fechar',reviewDialog,()=>reviewDialog.close()).className='secondary dialog-close';botao('Revisar '+fieldLabel(c),detalhe,()=>reviewDialog.showModal());
          const f=form(reviewDialog,`revisao-${c}-${item.instrumento.replace(/\W/g,'')}`,async()=>{await api('/api/contexto/revisoes','POST',{base:numero,campo:c,aditivo:item.instrumento,acao:acao.value,valor:valor.value,justificativa:just.value,versao:r.versao});if(g===geracao&&base.value===numero){await mostrar();erro('Revisão registrada.');}});
          const acao=campo(f,f.id+'-acao','Decisão para '+fieldLabel(c),'text',[['manter','Manter regra anterior'],['aplicar_aditivo','Usar trecho literal do aditivo'],['manual','Informar regra revisada']]),valor=campo(f,f.id+'-valor','Texto da regra revisada','textarea'),just=campo(f,f.id+'-justificativa','Justificativa da revisão','textarea');just.required=true;just.minLength=8;just.maxLength=2500;valor.maxLength=3000;valor.hidden=true;valor.previousElementSibling.hidden=true;acao.onchange=()=>{valor.hidden=acao.value!=='manual';valor.previousElementSibling.hidden=valor.hidden;valor.required=!valor.hidden;};salvar(f,'Registrar revisão');
        }
        if(!r.desatualizado&&!r.resultado.pendencias.length){
          if(contexto.papel==='administrador')botao('Publicar para cliente',detalhe,()=>{instrumentPanel.close();window.dispatchEvent(new CustomEvent('mediador:documentos-area',{detail:{area:'publicacoes'}}));window.dispatchEvent(new CustomEvent('mediador:publicar-documento',{detail:{base:numero}}));});
          const cliente=campo(detalhe,'relatorio-cliente','Cliente do relatório','text',clientes.map(c=>[String(c.id),c.razao_social]));
          for(const formato of ['pdf','md'])botao('Baixar relatório '+formato.toUpperCase(),detalhe,async()=>{
            const resp=await fetch(`/api/contexto/relatorio?base=${encodeURIComponent(numero)}&cliente=${cliente.value}&formato=${formato}`,{headers:headers(),credentials:'same-origin'});
            if(!resp.ok)throw new Error((await resp.json()).erro);const blob=await resp.blob();if(g!==geracao||base.value!==numero)return;
            const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=numero.replace(/\W/g,'_')+'.'+formato;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
          });
        }
        const history=el('details',null,detalhe);el('summary',`Histórico · ${r.historico.length} versão(ões) preservada(s)`,history);for(const version of r.historico)renderAnalysis(version,history);
      }
    }
    base.onchange=()=>{renderList();void mostrar().catch(e=>erro(e.message,true));};
    renderCatalog();
    window.dispatchEvent(new CustomEvent('mediador:documentos-prontos')); 
    if(editar){
      const dialog=settingsCard(catalog,'Vínculos de aditivos','Relacione os termos aditivos à CCT correspondente para conferir as alterações.','Gerenciar vínculos de aditivos');
      const f=form(dialog,'vinculo-aditivo-form',async()=>{const old=catalogo.vinculos.find(v=>v.aditivo===aditivo.value);await api('/api/contexto/vinculos','POST',{aditivo:aditivo.value,base:destino.value||null,justificativa:just.value,revisao:old?.revisao??0});if(g===geracao){await interpretacoes(g);erro('Vínculo privado atualizado.');}});
      const aditivo=campo(f,'vinculo-aditivo','Termo aditivo','text',aditivos.map(d=>[d.numero_registro,d.numero_registro])),destino=campo(f,'vinculo-base','Vincular à CCT','text',[['','Rejeitar ou remover vínculo'],...bases.map(d=>[d.numero_registro,d.numero_registro])]),just=campo(f,'vinculo-justificativa','Justificativa do vínculo','textarea');aditivo.required=true;just.required=true;just.minLength=8;just.maxLength=2000;salvar(f,'Salvar vínculo de aditivo');
      const existing=el('p','',dialog);existing.setAttribute('role','status');
      const loadLink=()=>{const link=catalogo.vinculos.find(item=>item.aditivo===aditivo.value);destino.value=link?.base||'';just.value='';existing.textContent=link?.base?`Vínculo atual: ${link.base}.`:'Este aditivo não possui vínculo confirmado com uma CCT.';};aditivo.onchange=loadLink;loadLink();
      if(!aditivos.length){el('p','Nenhum termo aditivo disponível neste escritório.',dialog);f.querySelector('[type=submit]').disabled=true;}compactSettings(dialog,tools);
    }
  }
  window.addEventListener('mediador:sessao',e=>{sessao=e.detail;void plataforma().catch(e=>erro(e.message,true));});
  window.addEventListener('mediador:limpar',()=>{geracao++;contexto=null;for(const dialog of document.querySelectorAll('[data-document-sheet]')){for(const nested of dialog.querySelectorAll('dialog[open]'))nested.close();if(dialog.open)dialog.close();dialog.remove();}for(const id of ['gestao-local','interpretacoes-local','envios-local'])$(id)?.replaceChildren();});
  window.addEventListener('mediador:contexto',e=>{contexto=e.detail.contexto;sessao=e.detail.sessao;const g=geracao;void gestao(g).catch(e=>{if(g===geracao)erro(e.message,true);});void interpretacoes(g).catch(e=>{if(g===geracao)erro(e.message,true);});if(contexto.tipo==='escritorio'&&sessao.capacidades?.monitoramento_execucoes)void enviosEscritorio($('envios-local'),g).catch(e=>{if(g===geracao)erro(e.message,true);});});
})();
