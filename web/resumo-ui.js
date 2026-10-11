(()=>{
  'use strict';
  const root=document.getElementById('resumo-escritorio');let context=null,session=null,generation=0;
  const clear=()=>{generation++;context=null;root.replaceChildren();root.hidden=true;};
  const el=(tag,text,parent)=>{const node=document.createElement(tag);node.textContent=text;parent.append(node);return node;};
  const navigate=area=>window.dispatchEvent(new CustomEvent('mediador:navegar',{detail:{area}}));
  const action=(parent,label,area)=>{const button=el('button',label,parent);button.type='button';button.onclick=()=>navigate(area);return button;};
  async function recentExecutions(turn,ctx){
    const card=el('article','',root);card.className='overview-activity';el('h3','Execuções recentes',card);el('p','Últimas coletas solicitadas neste escritório.',card);
    const status=el('p','Carregando execuções…',card);status.setAttribute('role','status');
    try{
      const response=await fetch('/api/contexto/execucoes',{credentials:'same-origin',headers:{'x-context-type':'escritorio','x-context-id':String(ctx.escritorio_id),...(ctx.concessao?{'x-support-grant':ctx.concessao}:{})}});
      const rows=await response.json();if(turn!==generation)return;if(!response.ok||!Array.isArray(rows))throw new Error(rows.erro||'Não foi possível carregar as execuções recentes.');
      status.textContent=rows.length?'':'Ainda não há execuções neste escritório.';
      const list=el('ul','',card);list.className='overview-activity-list';
      const labels={solicitada:'Coleta na fila',executando:'Coleta em execução',concluida:'Coleta concluída',falhou:'Coleta com falha',cancelada:'Coleta cancelada'};
      for(const row of [...rows].sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,5)){
        const item=el('li','',list);item.dataset.status=row.status;el('strong',labels[row.status]||row.status,item);
        const date=new Date(row.iniciada_em);el('span',`Execução #${row.id} · ${Number.isNaN(date.getTime())?'Data não informada':date.toLocaleString('pt-BR')}`,item);
      }
      action(card,'Ver histórico de execuções','monitoramento').className='overview-link';
    }catch(error){if(turn!==generation)return;status.textContent=error.message;status.setAttribute('role','alert');}
  }
  async function refresh(){
    const turn=++generation,ctx=context;root.replaceChildren();root.hidden=true;
    if(ctx?.tipo!=='escritorio'||!session?.capacidades?.monitoramento_execucoes)return;
    root.hidden=false;root.classList.add('overview-bento');
    const heading=el('div','',root);heading.className='overview-heading';
    el('h2','Seu dia, em perspectiva.',heading);el('p','Clientes, monitoramento e próximas decisões do seu escritório.',heading);
    const status=el('p','Carregando indicadores…',root);status.setAttribute('role','status');
    try{
      const response=await fetch('/api/contexto/resumo',{credentials:'same-origin',headers:{'x-context-type':'escritorio','x-context-id':String(ctx.escritorio_id),...(ctx.concessao?{'x-support-grant':ctx.concessao}:{})}});
      const data=await response.json();if(turn!==generation)return;
      if(!response.ok)throw new Error(data.erro||'Não foi possível carregar o resumo.');
      const hero=el('article','',root);hero.className='overview-hero';
      el('span','PRÓXIMA AÇÃO',hero).className='overview-eyebrow';
      if(data.envios_atencao>0){el('h3','Alguns envios precisam da sua atenção.',hero);el('p','Confira mensagens bloqueadas, com falha ou resultado incerto antes de tentar novamente.',hero);action(hero,'Conferir envios','envios');}
      else if(data.envios_revisao>0){el('h3','Seus clientes aguardam a próxima atualização.',hero);el('p','Confira os envios pendentes de revisão antes de aprovar as mensagens.',hero);action(hero,'Revisar envios','envios');}
      else if(data.clientes_ativos===0){el('h3','Seu escritório começa aqui.',hero);el('p','Cadastre seus clientes para organizar vínculos, contatos e documentos.',hero);action(hero,'Gerenciar clientes','cadastros');}
      else if(data.monitoramentos_ativos===0){el('h3','Acompanhe os sindicatos dos seus clientes.',hero);el('p','Configure consultas para encontrar os instrumentos coletivos relevantes.',hero);action(hero,'Configurar sindicatos','cadastros');}
      else {el('h3','Tudo organizado para a próxima decisão.',hero);el('p','Consulte documentos e acompanhe o monitoramento do seu escritório.',hero);action(hero,'Acompanhar monitoramento','monitoramento');}
      const list=el('dl','',root);list.className='resumo-indicadores';
      for(const [key,label,area] of [['clientes_ativos','Clientes ativos','cadastros'],['monitoramentos_ativos','Monitoramentos ativos','monitoramento'],['envios_revisao','Envios em revisão','envios'],['envios_fila','Envios na fila','envios'],['envios_atencao','Envios que precisam de atenção','envios']]){
        const item=el('div','',list);const top=el('div','',item);top.className='overview-kpi-top';el('dt',label,top);const glyph=el('span','',top);glyph.className='overview-kpi-icon';glyph.setAttribute('aria-hidden','true');const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.classList.add('workspace-icon');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',({clientes_ativos:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 21v-2 M16 3a4 4 0 0 1 0 8',monitoramentos_ativos:'M3 12h4l3-8 4 16 3-8h4',envios_revisao:'M12 8v4l3 2 M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0',envios_fila:'M22 2 9 15 M22 2l-7 20-6-7-7-6z',envios_atencao:'M12 8v5 M12 16h.01 M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0'})[key]);svg.append(path);glyph.append(svg);el('dd',String(data[key]),item);
        item.dataset.indicator=key;action(item,'Consultar '+label.toLocaleLowerCase('pt-BR'),area).className='overview-link';
      }
      status.textContent='Atenção inclui envios bloqueados, com falha ou resultado incerto.';
      status.className='overview-note';root.append(status);
      const shortcuts=el('article','',root);shortcuts.className='overview-shortcuts';el('h3','Seu escritório, sem atalhos complicados.',shortcuts);el('p','Acesse os cadastros e confira os documentos relacionados aos seus clientes.',shortcuts);
      const actions=el('div','',shortcuts);action(actions,'Gerenciar clientes','cadastros');action(actions,'Consultar documentos','documentos');
      void recentExecutions(turn,ctx);
    }catch(error){if(turn!==generation)return;status.textContent=error.message;}
    if(turn===generation){const button=el('button','Atualizar resumo',root);button.className='overview-refresh';heading.append(button);button.type='button';button.onclick=()=>void refresh();}
  }
  window.addEventListener('mediador:limpar',clear);
  window.addEventListener('mediador:contexto',event=>{context=event.detail.contexto;session=event.detail.sessao;void refresh();});
})();
