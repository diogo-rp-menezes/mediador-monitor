(()=>{
  'use strict';
  const root=document.getElementById('monitoramento-contexto');let context=null,session=null,generation=0;
  const el=(tag,text,parent)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(parent)parent.append(node);return node;};
  const clear=()=>{generation++;context=null;root.replaceChildren();root.hidden=true;};
  const labels={solicitada:'Aguardando consumidor',executando:'Em execução',concluida:'Concluída',falhou:'Falhou',cancelada:'Cancelada'};
  async function refresh(){
    const turn=++generation,ctx=context,csrf=session?.csrf;
    root.replaceChildren();root.hidden=true;
    if(ctx?.tipo!=='escritorio'||!session?.capacidades?.monitoramento_execucoes)return;
    const headers={'content-type':'application/json','x-csrf-token':csrf,'x-context-type':'escritorio','x-context-id':String(ctx.escritorio_id),...(ctx.concessao?{'x-support-grant':ctx.concessao}:{})};
    const api=async(path,method='GET',body)=>{
      const response=await fetch(path,{method,headers,credentials:'same-origin',body:body===undefined?undefined:JSON.stringify(body)});
      const data=await response.json();if(!response.ok)throw new Error(data.erro||'Não foi possível concluir.');return data;
    };
    root.hidden=false;const heading=el('header',null,root);heading.className='monitor-heading';el('h2','Execuções deste escritório',heading);
    el('p','Solicitar coloca a coleta na fila. O consumidor precisa estar em execução; análise e envios são etapas separadas.',root);
    const message=el('p','Carregando…',root);message.setAttribute('role','status');
    const notify=(text,error=false)=>{const status=document.getElementById('auth-mensagem');if(status){status.dataset.erro=String(error);status.textContent=text;}else{message.textContent=text;message.setAttribute('role',error?'alert':'status');}};
    const modal=(parent,title,buttonLabel)=>{
      const dialog=el('dialog',null,parent);dialog.className='workspace-dialog';dialog.setAttribute('aria-label',title);
      el('h2',title,dialog);const close=el('button','Fechar',dialog);close.type='button';close.className='secondary dialog-close';close.onclick=()=>dialog.close();
      const open=el('button',buttonLabel,parent);open.type='button';open.onclick=()=>dialog.showModal();return dialog;
    };
    const action=(button,work,success)=>async event=>{
      event?.preventDefault();if(turn!==generation||button.disabled)return;button.disabled=true;
      try{await work();if(turn===generation){button.closest('dialog')?.close();const feedback=document.getElementById('workspace-feedback');if(feedback&&root.contains(feedback))document.querySelector('.workspace-nav')?.after(feedback);await refresh();if(success&&context===ctx)notify(success);}}catch(error){if(turn===generation){const dialog=button.closest('dialog');if(dialog){let failure=dialog.querySelector('[role=alert]');if(!failure)failure=el('p',null,dialog);failure.setAttribute('role','alert');failure.textContent=error.message;}else notify(error.message,true);}}
      finally{button.disabled=false;}
    };
    try{
      const [monitors,executions,agendas,limits]=await Promise.all([api('/api/contexto/monitoramentos'),api('/api/contexto/execucoes'),api('/api/contexto/agendas'),api('/api/contexto/limites-monitoramento')]);
      if(turn!==generation)return;message.textContent='';
      const editable=['administrador','operador'].includes(ctx.papel);
      const indicators=el('dl',null,root);indicators.className='delivery-indicators monitor-indicators';
      for(const [title,states] of [['Na fila',['solicitada']],['Em execução',['executando']],['Concluídas',['concluida']],['Precisam de atenção',['falhou']]]){const card=el('div',null,indicators);el('dt',title,card);el('dd',String(executions.filter(item=>states.includes(item.status)).length),card);}
      el('p','Indicadores das execuções carregadas neste escritório.',root).className='delivery-note';
      const history=el('section',null,root);history.className='monitor-history';el('h3','Histórico de execuções',history);
      const settingsArea=el('div',null,root);settingsArea.className='monitor-settings';const settings=el('div',null,settingsArea);settings.className='settings-grid';
      const limitsCard=el('article',null,settings);limitsCard.className='settings-card';el('h3','Limites de coleta',limitsCard);
      el('p',`Até ${limits.efetivos.limite_hora} início(s) por hora · ${limits.efetivos.duracao_segundos} segundos · ${limits.efetivos.volume_mib} MiB por execução`,limitsCard);
      if(ctx.papel==='administrador'){
        const dialog=modal(limitsCard,'Limites de coleta','Configurar limites'),form=el('form',null,dialog),inputs={};
        for(const [key,title,min] of [['limite_hora','Inícios por hora',1],['duracao_segundos','Duração em segundos',10],['volume_mib','Volume em MiB',1]]){
          const label=el('label',title,form),input=el('input',null,form);input.id=`monitor-limite-${key}`;label.htmlFor=input.id;
          input.type='number';input.min=String(min);input.max=String(limits.tetos[key]);input.step='1';input.placeholder=String(limits.tetos[key]);
          input.value=limits.configurados[key]===null?'':String(limits.configurados[key]);inputs[key]=input;
        }
        el('p','Campos vazios usam os limites da plataforma. Alterações valem para novas reservas de execução.',form);
        const save=el('button','Salvar limites',form);save.type='submit';
        form.onsubmit=action(save,()=>api('/api/contexto/limites-monitoramento','PUT',Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value===''?null:Number(input.value)]))),'Limites de coleta salvos.');
      }
      if(editable){
        const form=el('form',null,root);form.className='monitor-request';root.insertBefore(form,history);const label=el('label','Monitoramento',form),select=el('select',null,form);select.id='execucao-monitoramento';label.htmlFor=select.id;select.required=true;
        for(const monitor of monitors.filter(m=>m.ativo)){const option=el('option',monitor.nome,select);option.value=String(monitor.id);}
        const submit=el('button','Solicitar coleta',form);submit.type='submit';submit.disabled=!select.options.length;
        form.onsubmit=action(submit,()=>api('/api/contexto/execucoes','POST',{monitoramento_id:Number(select.value)}),'Coleta adicionada à fila.');
      }
      const update=el('button','Atualizar execuções',heading);update.type='button';update.onclick=()=>{void refresh();};
      const agendasSection=el('section',null,settingsArea);agendasSection.className='monitor-agendas';el('h3','Agendas de coleta',agendasSection);const agendaCards=el('div',null,agendasSection);agendaCards.className='settings-grid';
      el('p','Ativar permite uma solicitação já na próxima conferência da agenda. Pausar impede novas solicitações; execuções existentes precisam ser canceladas separadamente.',agendasSection);
      if(!agendas.length)el('p','Nenhum monitoramento para agendar.',agendasSection);
      for(const agenda of agendas){
        const card=el('article',null,agendaCards);card.className='settings-card';el('h4',agenda.nome,card);
        const dayNames=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];el('p',`${agenda.ativa?'Ativa':'Pausada'} · ${agenda.semanal?agenda.semanal.dias.map(d=>dayNames[d]).join(', ')+' às '+agenda.semanal.horario+' · '+agenda.semanal.fuso:'Intervalo de '+agenda.intervalo_minutos+' minutos'}${agenda.monitoramento_ativo?'':' · Monitoramento inativo'}`,card);
        if(ctx.papel==='administrador'){
          const dialog=modal(card,'Agenda · '+agenda.nome,'Editar agenda'),form=el('form',null,dialog),label=el('label','Intervalo em minutos',form),interval=el('input',null,form);
          interval.id=`agenda-intervalo-${agenda.monitoramento_id}`;label.htmlFor=interval.id;interval.type='number';interval.min='60';interval.max='10080';interval.step='1';interval.required=true;interval.value=String(agenda.intervalo_minutos);
          const modeLabel=el('label','Tipo de agenda',form),mode=el('select',null,form);mode.id=`agenda-tipo-${agenda.monitoramento_id}`;modeLabel.htmlFor=mode.id;
          for(const [value,title] of [['intervalo','Por intervalo'],['semanal','Dias e horário']]){const option=el('option',title,mode);option.value=value;}mode.value=agenda.semanal?'semanal':'intervalo';
          const weekly=el('fieldset',null,form);el('legend','Dias da semana',weekly);const days=[];
          for(let day=0;day<7;day++){const label=el('label',null,weekly),input=el('input',null,label);input.type='checkbox';input.checked=(agenda.semanal?.dias||[1,2,3,4,5]).includes(day);label.append(document.createTextNode(dayNames[day]));days.push(input);}
          const timeLabel=el('label','Horário da coleta',weekly),time=el('input',null,weekly);time.type='time';time.id=`agenda-horario-${agenda.monitoramento_id}`;timeLabel.htmlFor=time.id;time.value=agenda.semanal?.horario||'08:00';
          const zoneLabel=el('label','Fuso horário',weekly),zone=el('input',null,weekly);zone.id=`agenda-fuso-${agenda.monitoramento_id}`;zoneLabel.htmlFor=zone.id;zone.value=agenda.semanal?.fuso||'America/Sao_Paulo';zone.maxLength=100;
          el('p','Ex.: America/Sao_Paulo. Uma solicitação por dia selecionado, a partir do horário informado. O agendador precisa estar em execução; dias anteriores não são recuperados.',weekly);
          const syncMode=()=>{weekly.hidden=mode.value!=='semanal';interval.hidden=label.hidden=mode.value==='semanal';interval.required=mode.value==='intervalo';time.required=zone.required=mode.value==='semanal';};mode.onchange=syncMode;syncMode();
          const activeLabel=el('label',null,form),active=el('input',null,activeLabel);active.type='checkbox';active.checked=agenda.ativa;active.disabled=!agenda.monitoramento_ativo;
          activeLabel.append(document.createTextNode(' Agenda ativa'));
          const save=el('button','Salvar agenda',form);save.type='submit';
          form.onsubmit=action(save,()=>api(`/api/contexto/agendas/${agenda.monitoramento_id}`,'PUT',{ativa:active.checked&&agenda.monitoramento_ativo,intervalo_minutos:Number(interval.value),semanal:mode.value==='semanal'?{dias:days.flatMap((input,day)=>input.checked?[day]:[]),horario:time.value,fuso:zone.value}:null}),'Agenda salva.');
        }
      }
      if(!executions.length)el('p','Nenhuma execução neste escritório.',history);
      for(const execution of executions){
        const card=el('article',null,history),monitor=monitors.find(m=>String(m.id)===String(execution.monitoramento_id));
        card.className='settings-card execution-card';card.dataset.status=execution.status;el('h3',`#${execution.id} · ${monitor?.nome||'Monitoramento removido'} · ${labels[execution.status]||execution.status}`,card);
        el('p',`Solicitada em ${new Date(execution.iniciada_em).toLocaleString('pt-BR')}${execution.concluida_em?' · Encerrada em '+new Date(execution.concluida_em).toLocaleString('pt-BR'):''}`,card);
        if(execution.limite_duracao_excedido)el('p','Interrompida por limite de duração.',card);
        if(execution.limite_volume_excedido)el('p','Interrompida por limite de volume de originais.',card);
        if(execution.cancelamento_solicitado&&execution.status==='executando')el('p','Cancelamento solicitado; aguardando encerramento do consumidor.',card);
        if(editable&&['solicitada','executando'].includes(execution.status)&&!execution.cancelamento_solicitado){
          const cancel=el('button','Solicitar cancelamento',card);cancel.type='button';cancel.onclick=action(cancel,()=>api(`/api/contexto/execucoes/${execution.id}/cancelar`,'POST',{}),'Cancelamento solicitado.');
        }
        if(ctx.papel==='administrador'&&execution.status==='executando'){
          const details=el('details',null,card);el('summary','Recuperar execução interrompida',details);
          el('p','Encerre e verifique o processo consumidor anterior antes de recuperar. Resultados coletados serão preservados; a execução será encerrada como falha.',details);
          const form=el('form',null,details),label=el('label','Justificativa',form),reason=el('textarea',null,form);
          reason.id=`execucao-motivo-${execution.id}`;label.htmlFor=reason.id;reason.required=true;reason.minLength=8;reason.maxLength=1000;
          const confirmation=el('label',null,form),check=el('input',null,confirmation);check.type='checkbox';check.required=true;
          confirmation.append(document.createTextNode(' Confirmo que o consumidor anterior foi encerrado e verificado.'));
          const submit=el('button','Recuperar como falha',form);submit.type='submit';
          form.onsubmit=action(submit,()=>api(`/api/contexto/execucoes/${execution.id}/recuperar`,'POST',{justificativa:reason.value,consumidor_encerrado:check.checked}),'Execução recuperada como falha.');
        }
      }
    }catch(error){if(turn===generation){message.textContent=error.message;message.setAttribute('role','alert');}}
  }
  window.addEventListener('mediador:limpar',clear);
  window.addEventListener('mediador:contexto',event=>{context=event.detail.contexto;session=event.detail.sessao;void refresh();});
})();
