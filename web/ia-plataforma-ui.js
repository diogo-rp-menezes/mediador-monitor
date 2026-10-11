(()=>{
  'use strict';
  const root=document.getElementById('ia-plataforma');if(!root)return;
  let session=null,generation=0;
  const el=(tag,text,parent)=>{const node=document.createElement(tag);if(text)node.textContent=text;parent?.append(node);return node;};
  async function attempts(turn,current){
    if(turn!==generation)return;
    const section=el('section',null,root);el('h3','Extrações de documentos',section);
    const requestDialog=el('dialog',null,section);requestDialog.className='workspace-dialog';requestDialog.setAttribute('aria-label','Nova análise de documento');el('h2','Nova análise de documento',requestDialog);
    const closeRequest=el('button','Fechar',requestDialog);closeRequest.type='button';closeRequest.className='secondary dialog-close';closeRequest.onclick=()=>requestDialog.close();
    const openRequest=el('button','Nova análise de documento',section);openRequest.type='button';openRequest.onclick=()=>requestDialog.showModal();
    const requestForm=el('form',null,requestDialog),requestLabel=el('label','Número do registro para análise',requestForm),number=el('input',null,requestForm);
    number.id='ia-solicitar-numero';number.required=true;number.pattern='[A-Z]{2}[0-9]{6}/[0-9]{4}';requestLabel.htmlFor=number.id;
    const reLabel=el('label',null,requestForm),recheck=el('input',null,reLabel);recheck.type='checkbox';reLabel.append(document.createTextNode(' Confirmo nova análise se o documento já foi analisado.'));
    el('p','A solicitação entra na fila. O consumidor de IA precisa estar em execução; o texto do documento público será enviado ao provedor configurado.',requestForm);
    const enqueue=el('button','Solicitar análise de documento',requestForm);enqueue.type='submit';
    const message=el('p','Carregando tentativas…',section);message.setAttribute('role','status');
    requestForm.onsubmit=async event=>{
      event.preventDefault();if(turn!==generation||enqueue.disabled)return;enqueue.disabled=true;
      try{
        const response=await fetch('/api/plataforma/ia/solicitacoes',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':current.csrf},body:JSON.stringify({numero_registro:number.value.trim(),confirmar_reanalise:recheck.checked})});
        const value=await response.json();if(turn!==generation)return;if(!response.ok)throw new Error(value.erro||'Não foi possível solicitar.');requestDialog.close();await refresh();
      }catch(error){if(turn===generation){let errorMessage=requestDialog.querySelector('[role=alert]');if(!errorMessage)errorMessage=el('p',null,requestDialog);errorMessage.setAttribute('role','alert');errorMessage.textContent=error.message;}}
      finally{if(turn===generation)enqueue.disabled=false;}
    };
    try{
      const response=await fetch('/api/plataforma/ia/solicitacoes',{credentials:'same-origin'}),jobs=await response.json();
      if(turn!==generation)return;if(!response.ok||!Array.isArray(jobs))throw new Error(jobs.erro||'Não foi possível carregar a fila.');
      for(const job of jobs){
        el('p',`Solicitação #${job.id} · ${job.numero_registro} · ${job.status}`,section);
        if(job.status!=='executando'||job.tentativa_id)continue;
        const details=el('details',null,section);el('summary',`Recuperar solicitação #${job.id} sem tentativa`,details);
        const form=el('form',null,details),label=el('label','Justificativa para solicitação interrompida',form),reason=el('textarea',null,form);
        reason.id=`ia-solicitacao-recuperar-${job.id}`;label.htmlFor=reason.id;reason.required=true;reason.minLength=8;reason.maxLength=1000;
        const checkLabel=el('label',null,form),check=el('input',null,checkLabel);check.type='checkbox';check.required=true;checkLabel.append(document.createTextNode(' Confirmo que o consumidor da fila IA foi encerrado e verificado.'));
        const save=el('button','Encerrar solicitação interrompida',form);save.type='submit';
        form.onsubmit=async event=>{
          event.preventDefault();if(turn!==generation||save.disabled||!check.checked||reason.value.trim().length<8)return;save.disabled=true;
          try{
            const result=await fetch(`/api/plataforma/ia/solicitacoes/${job.id}/recuperar`,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':current.csrf},body:JSON.stringify({justificativa:reason.value.trim(),consumidor_encerrado:true})});
            const value=await result.json();if(turn!==generation)return;if(!result.ok)throw new Error(value.erro||'Não foi possível recuperar solicitação.');await refresh();
          }catch(error){if(turn===generation)message.textContent=error.message;}
          finally{if(turn===generation)save.disabled=false;}
        };
      }
    }catch(error){if(turn===generation)el('p',error.message,section);}
    try{
      const response=await fetch('/api/plataforma/ia/tentativas',{credentials:'same-origin'}),list=await response.json();
      if(turn!==generation)return;if(!response.ok||!Array.isArray(list))throw new Error(list.erro||'Não foi possível carregar as tentativas.');
      message.textContent=list.length?'':'Nenhuma tentativa de extração.';
      for(const item of list){
        const card=el('article',null,section),labels={executando:'Em processamento',concluida:'Concluída',falhou:'Falhou'};
        el('h4',`#${item.id} · ${item.numero_registro} · ${labels[item.status]||item.status}`,card);
        if(item.status!=='executando')continue;
        const details=el('details',null,card);el('summary','Recuperar extração interrompida',details);
        el('p','Encerre e verifique o processo anterior antes de recuperar. A recuperação preserva o resultado anterior e não inicia outra análise.',details);
        const form=el('form',null,details),label=el('label','Justificativa da recuperação',form),reason=el('textarea',null,form);
        reason.id=`ia-recuperacao-${item.id}`;label.htmlFor=reason.id;reason.required=true;reason.minLength=8;reason.maxLength=1000;
        const confirmedLabel=el('label',null,form),confirmed=el('input',null,confirmedLabel);confirmed.type='checkbox';confirmed.required=true;
        confirmedLabel.append(document.createTextNode(' Confirmo que o processo de extração anterior foi encerrado e verificado.'));
        const save=el('button','Encerrar tentativa interrompida',form);save.type='submit';
        form.onsubmit=async event=>{
          event.preventDefault();if(turn!==generation||save.disabled)return;
          if(!confirmed.checked||reason.value.trim().length<8){message.textContent='Informe uma justificativa e confirme o encerramento do processo.';return;}
          save.disabled=true;
          try{
            const result=await fetch(`/api/plataforma/ia/tentativas/${item.id}/recuperar`,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':current.csrf},body:JSON.stringify({justificativa:reason.value.trim(),consumidor_encerrado:true})});
            const value=await result.json();if(turn!==generation)return;if(!result.ok)throw new Error(value.erro||'Não foi possível recuperar.');
            await refresh();
          }catch(error){if(turn===generation)message.textContent=error.message;}
          finally{if(turn===generation)save.disabled=false;}
        };
      }
    }catch(error){if(turn===generation)message.textContent=error.message;}
  }
  async function refresh(){
    const turn=++generation,current=session;root.replaceChildren();root.hidden=true;
    if(!current?.capacidades?.ia_plataforma||current.usuario?.papel_plataforma!=='administrador_plataforma')return;
    root.hidden=false;el('h2','IA da plataforma',root);
    el('p','Configuração compartilhada para análise de documentos públicos. Salvar não inicia análises.',root);
    const status=el('p','Carregando configuração…',root);status.setAttribute('role','status');
    const reload=el('button','Recarregar configuração de IA',root);reload.type='button';reload.onclick=()=>{void refresh();};
    try{
      const response=await fetch('/api/plataforma/ia',{credentials:'same-origin'}),data=await response.json();
      if(turn!==generation)return;if(!response.ok)throw new Error(data.erro||'Não foi possível carregar a configuração.');
      status.textContent=data.tem_chave?'Chave armazenada.':'Nenhuma chave armazenada.';
      const card=el('article',null,root);card.className='settings-card ia-settings-card';
      el('h3','Provedor e modelo',card);el('p',`${data.ativo?'IA habilitada':'IA desabilitada'} · ${data.modelo||'Modelo não configurado'}`,card);
      const test=el('button','Testar conexão de IA',card);test.type='button';test.disabled=!data.base_url||!data.modelo;
      el('p','O teste usa a configuração salva e envia apenas uma mensagem de teste ao provedor. Pode consumir uma pequena quantidade de créditos.',card);
      const testStatus=el('p','',card);testStatus.setAttribute('role','status');
      test.onclick=async()=>{
        if(test.disabled||turn!==generation)return;test.disabled=true;testStatus.textContent='Testando conexão…';
        try{const response=await fetch('/api/plataforma/ia/testar',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':current.csrf},body:JSON.stringify({versao:data.versao})});
          const result=await response.json();if(turn!==generation)return;
          if(!response.ok)throw new Error(result.erro||'Não foi possível testar a conexão.');
          testStatus.textContent=result.mensagem+(result.ok?` (${result.ms} ms)`:'');testStatus.setAttribute('role',result.ok?'status':'alert');
          const message=document.getElementById('auth-mensagem');if(message&&result.ok){message.dataset.erro='false';message.textContent='Conexão de IA confirmada.';}
        }catch(error){if(turn===generation){testStatus.textContent=error.message;testStatus.setAttribute('role','alert');}}
        finally{if(turn===generation)test.disabled=false;}
      };
      const open=el('button','Editar configuração de IA',card);open.type='button';
      const dialog=el('dialog',null,card);dialog.className='workspace-dialog';dialog.setAttribute('aria-labelledby','ia-settings-title');
      el('h2','Configuração de IA',dialog).id='ia-settings-title';
      const close=el('button','Fechar',dialog);close.type='button';close.className='secondary dialog-close';close.onclick=()=>dialog.close();open.onclick=()=>dialog.showModal();
      const form=el('form',null,dialog);form.dataset.versao=String(data.versao);
      const formStatus=el('p','',dialog);formStatus.setAttribute('role','alert');
      const field=(id,title,type,value)=>{const label=el('label',title,form),input=el('input',null,form);label.htmlFor=id;input.id=id;input.type=type;input.value=value;return input;};
      const active=field('ia-ativa','Habilitar IA','checkbox','');active.checked=data.ativo;
      const url=field('ia-url','URL do provedor de IA','url',data.base_url);url.maxLength=2048;
      const model=field('ia-modelo','Modelo de IA','text',data.modelo);model.maxLength=200;
      const key=field('ia-chave','Nova chave de IA','password','');key.autocomplete='new-password';key.maxLength=4000;
      const clearSecret=()=>{key.value='';};dialog.addEventListener('cancel',clearSecret);dialog.addEventListener('close',clearSecret);
      el('p','Deixe a nova chave vazia para preservar a chave armazenada.',form);
      const clear=field('ia-limpar','Remover chave armazenada','checkbox','');
      const save=el('button','Salvar configuração de IA',form);save.type='submit';
      form.onsubmit=async event=>{
        event.preventDefault();if(turn!==generation||save.disabled)return;
        formStatus.textContent='';if(clear.checked&&key.value){formStatus.textContent='Escolha entre substituir ou remover a chave.';return;}
        const body={ativo:active.checked,base_url:url.value,modelo:model.value,versao:data.versao};
        if(clear.checked)body.limpar_chave=true;else if(key.value)body.api_key=key.value;
        save.disabled=true;
        try{
          const result=await fetch('/api/plataforma/ia',{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':current.csrf},body:JSON.stringify(body)});
          const saved=await result.json();if(turn!==generation)return;
          if(!result.ok){if(result.status===409){key.value='';formStatus.textContent='A configuração foi alterada por outro administrador. Feche esta janela e recarregue antes de editar novamente.';return;}throw new Error(saved.erro||'Não foi possível salvar a configuração.');}
          key.value='';dialog.close();await refresh();const message=document.getElementById('auth-mensagem');if(message){message.dataset.erro='false';message.textContent='Configuração de IA salva.';}
        }catch(error){if(turn===generation)formStatus.textContent=error.message;}
        finally{if(turn===generation)save.disabled=false;}
      };
    }catch(error){if(turn===generation)status.textContent=error.message;}
    if(turn===generation)void attempts(turn,current);
  }
  window.addEventListener('mediador:sessao',event=>{session=event.detail;void refresh();});
  window.addEventListener('mediador:limpar',()=>{const key=root.querySelector('#ia-chave');if(key)key.value='';});
})();
