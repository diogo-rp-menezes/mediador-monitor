(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const chaveContexto = 'mediador_contexto';
  let sessao, tokenRecuperacao = '';
  const mensagem = (texto, erro = false) => { $('auth-mensagem').textContent = texto; $('auth-mensagem').dataset.erro = String(erro); };
  async function api(path, method = 'GET', body, adicionais = {}) {
    const headers = { 'content-type': 'application/json', ...adicionais };
    if (sessao && method !== 'GET') headers['x-csrf-token'] = sessao.csrf;
    if (sessao && method !== 'GET') headers['x-csrf-token'] = sessao.csrf;
    const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 && document.body.dataset.page !== 'login') { sessionStorage.removeItem(chaveContexto); location.replace('/login'); }
      throw new Error(data.erro || 'Não foi possível concluir.');
    }
    return data;
  }
  const formulario = (id, acao) => { $(id).addEventListener('submit', async e => {
    e.preventDefault(); const botao = e.currentTarget.querySelector('[type=submit]'); if(botao.disabled)return;botao.disabled = true; mensagem('');
    try { await acao(); } catch (erro) { mensagem(erro.message, true); } finally { botao.disabled = false; }
  }); };
  if (document.body.dataset.page === 'login') {
    const mostrar = alvo => { for (const id of ['entrar','solicitar','redefinir']) $(id).hidden = id !== alvo; mensagem(''); };
    tokenRecuperacao = new URLSearchParams(location.hash.slice(1)).get('recuperar') || '';
    if (tokenRecuperacao) { history.replaceState(null, '', location.pathname); mostrar('redefinir'); }
    $('esqueci').onclick = () => mostrar('solicitar'); document.querySelectorAll('.voltar').forEach(b => b.onclick = () => { tokenRecuperacao = ''; mostrar('entrar'); });
    formulario('login-form', async () => {
      await api('/api/auth/login', 'POST', { email: $('login-email').value, senha: $('login-senha').value });
      sessionStorage.removeItem(chaveContexto); $('login-senha').value = ''; location.assign('/');
    });
    formulario('recuperacao-form', async () => { const result = await api('/api/auth/recuperacao', 'POST', { email: $('recuperacao-email').value }); mensagem(result.mensagem); });
    formulario('redefinir-form', async () => {
      if ($('nova-senha').value !== $('confirmar-senha').value) throw new Error('As senhas precisam ser iguais.');
      const result = await api('/api/auth/recuperar', 'POST', { token: tokenRecuperacao, senha: $('nova-senha').value });
      tokenRecuperacao = ''; $('nova-senha').value = ''; $('confirmar-senha').value = ''; sessionStorage.removeItem(chaveContexto); mostrar('entrar'); mensagem(result.mensagem);
    });
    api('/api/auth/estado').then(data => { $('auth-inicial').hidden = data.configurado; }).catch(() => mensagem('Não foi possível consultar a instalação.', true));
    return;
  }
  let opcoes = [], selecionado = null;
  let geracaoCadastros = 0, contatos = [], monitoramentos = [], catalogo = [], editandoMonitoramento = null, editandoCliente = null, editandoContato = null;
  let geracaoDocumentos=0,clienteDocumentos=null,decisaoDocumento=null;
  function limparDocumentos(){geracaoDocumentos++;clienteDocumentos=null;decisaoDocumento=null;$('documentos-contexto').hidden=true;$('lista-documentos-contexto').replaceChildren();$('decisao-contexto-form').reset();$('decisao-contexto-form').hidden=true;$('documentos-status').textContent='';}
  function limparCadastros(preservarNavegacao=false) {
    window.dispatchEvent(new CustomEvent('mediador:limpar',{detail:{preservarNavegacao}}));
    limparDocumentos();
    geracaoCadastros++; contatos = []; monitoramentos = []; catalogo = []; editandoMonitoramento = editandoCliente = editandoContato = null;
    $('cadastros-escritorio').hidden = true;
    for (const id of ['lista-clientes-contexto','lista-contatos-contexto','lista-monitoramentos-contexto','cliente-contatos','cliente-sindicatos','monitoramento-sindicato']) $(id).replaceChildren();
    editorVinculos?.reset(null,[]);
    for (const id of ['cliente-contexto-form','contato-contexto-form','monitoramento-contexto-form']) { $(id).reset(); $(id).hidden = true; }
  }
  const headersContexto = () => {
    if (!selecionado || selecionado.tipo !== 'escritorio') throw new Error('Selecione um escritório.');
    return { 'x-context-type': 'escritorio', 'x-context-id': String(selecionado.escritorio_id),
      ...(selecionado.concessao ? { 'x-support-grant': selecionado.concessao } : {}) };
  };
  const podeEditar = () => selecionado && ['administrador','operador'].includes(selecionado.papel);
  const acaoCadastro = acao => async () => { try { await acao(); } catch (erro) { mensagem(erro.message,true); } };
  async function carregarCadastros() {
    limparCadastros(true);
    if(selecionado)window.dispatchEvent(new CustomEvent('mediador:contexto',{detail:{contexto:selecionado,sessao}}));
    if (!selecionado || selecionado.tipo !== 'escritorio') return;
    const geracao = geracaoCadastros, headers = headersContexto();
    $('cadastros-escritorio').hidden = false; $('cadastros-status').textContent = 'Carregando cadastros…';
    $('monitoramentos-explicacao').textContent = sessao?.capacidades?.monitoramento_execucoes
      ? 'Configure os sindicatos e filtros deste escritório. Solicite coletas na seção de monitoramento; a execução depende do worker local.'
      : 'Configure consultas para este escritório usando o catálogo compartilhado de sindicatos. O monitoramento global mantém seus filtros anteriores.';
    $('novo-cliente-contexto').hidden = $('novo-contato-contexto').hidden = $('novo-monitoramento-contexto').hidden = !podeEditar();
    try {
      const [clientes, listaContatos, listaMonitoramentos, listaCatalogo] = await Promise.all([
        api('/api/contexto/clientes','GET',undefined,headers), api('/api/contexto/contatos','GET',undefined,headers),
        api('/api/contexto/monitoramentos','GET',undefined,headers), api('/api/contexto/sindicatos','GET',undefined,headers)
      ]);
      if (geracao !== geracaoCadastros) return;
      contatos = listaContatos; monitoramentos = listaMonitoramentos; catalogo = listaCatalogo;
      const listar = (id,itens,tipo) => {
        const cell=(row,text,secondary)=>{const td=document.createElement('td');td.textContent=text||'—';if(secondary){const small=document.createElement('small');small.textContent=secondary;td.append(small);}row.append(td);return td;};
        if (!itens.length) { const row=document.createElement('tr');row.dataset.empty='true';const td=cell(row,'Nenhum cadastro neste escritório.');td.colSpan=$(id).closest('table').querySelectorAll('th').length;$(id).append(row); }
        for (const item of itens) {
          const li=document.createElement('tr');li.dataset.active=String(!!item.ativo);li.dataset.nome=item.razao_social||item.nome;
          if(tipo==='clientes'){
            cell(li,item.nome_fantasia||item.razao_social,item.nome_fantasia?item.razao_social:null);cell(li,item.cnpj?.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/,'$1.$2.$3/$4-$5'));cell(li,[item.municipio,item.uf].filter(Boolean).join(' / '));cell(li,({revisao:'Com revisão',automatico:'Automático',manual:'Manual'})[item.modo_envio]||item.modo_envio);
          }else if(tipo==='contatos'){
            cell(li,item.nome,item.cargo);cell(li,item.email);cell(li,item.telefone);
          }else{
            cell(li,item.nome,item.sindicato_nome);cell(li,[item.cnpj_filtro,item.categoria,item.uf,item.vigencia,item.titulo].filter(Boolean).join(' · ')||'Sem filtros adicionais');cell(li,item.tipos.join(', '));
          }
          const state=cell(li,'');const badge=document.createElement('span');badge.className='registry-badge';badge.dataset.active=String(!!item.ativo);badge.textContent=item.ativo?'Ativo':'Inativo';state.replaceChildren(badge);
          const actions=cell(li,'');actions.replaceChildren();actions.className='registry-actions';
          if(tipo==='clientes') {const ficha=document.createElement('button');ficha.type='button';ficha.textContent='Ver ficha';ficha.className='secondary';ficha.onclick=acaoCadastro(async()=>{const detalhe=await api(`/api/contexto/clientes/${item.id}`,'GET',undefined,headers);if(geracao!==geracaoCadastros)return;window.dispatchEvent(new CustomEvent('mediador:cliente-ficha',{detail:{cliente:detalhe,editar:podeEditar()?()=>abrirCliente(detalhe):null,documentos:()=>abrirDocumentos(item)}}));});actions.append(ficha);const documentos=document.createElement('button');documentos.type='button';documentos.textContent='Documentos';documentos.className='secondary';documentos.onclick=acaoCadastro(()=>abrirDocumentos(item));documentos.hidden=true;actions.append(documentos);}
          if (podeEditar()) {
            const editar=document.createElement('button');editar.type='button';editar.textContent='Editar';editar.className='secondary';
            editar.onclick=acaoCadastro(async()=>{
              if (tipo==='clientes') { const detalhes=await api(`/api/contexto/clientes/${item.id}`,'GET',undefined,headers);if(geracao===geracaoCadastros)abrirCliente(detalhes); }
              else if(tipo==='monitoramentos')abrirMonitoramento(item);else abrirContato(item);
            });actions.append(editar);
            const excluir=document.createElement('button');excluir.type='button';excluir.textContent='Excluir';excluir.className='secondary';
            excluir.onclick=acaoCadastro(async()=>{
              if (!await window.confirmarExclusaoCadastro(`Excluir ${item.razao_social || item.nome}? Cadastros com histórico devem ser inativados.`)) return;
              if(geracao!==geracaoCadastros)return;
              await api(`/api/contexto/${tipo}/${item.id}`,'DELETE',undefined,headers);
              if (geracao===geracaoCadastros) { await carregarCadastros();mensagem('Cadastro excluído.'); }
            });const more=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Mais ações';more.className='registry-more';more.append(summary,excluir);actions.append(more);
          }
          $(id).append(li);
        }
      };
      listar('lista-clientes-contexto',clientes,'clientes');listar('lista-contatos-contexto',contatos,'contatos');
      listar('lista-monitoramentos-contexto',monitoramentos,'monitoramentos');
      window.dispatchEvent(new CustomEvent('mediador:cadastros',{detail:{clientes,contatos,monitoramentos}}));
      $('cadastros-status').textContent=`${clientes.length} cliente(s) e ${contatos.length} contato(s) neste escritório.${podeEditar()?'':' Acesso somente para consulta.'}`;
    } catch (erro) { if (geracao===geracaoCadastros) { limparCadastros();mensagem(erro.message,true); } }
  }
  let editorVinculos,consultaCnpjCliente;
  function abrirCliente(item=null) {
    editandoCliente=item;$('cliente-contexto-form').reset();$('cliente-contexto-form').hidden=false;
    $('cliente-contexto-titulo').textContent=item?'Editar cliente':'Novo cliente';
    for(const [campo,chave] of [['razao','razao_social'],['cnpj','cnpj'],['fantasia','nome_fantasia'],['uf','uf'],['municipio','municipio']]) $('cliente-'+campo).value=item?.[chave] || '';
    $('cliente-ativo').value=String(item?.ativo ?? true);$('cliente-modo').value=item?.modo_envio || 'revisao';
    $('cliente-contatos').replaceChildren();
    for(const contato of contatos){const opcao=document.createElement('option');opcao.value=String(contato.id);opcao.textContent=`${contato.nome} · ${contato.email}`;opcao.selected=!!item?.contatos.some(c=>c.contato_id===contato.id);$('cliente-contatos').append(opcao);}
    $('cliente-sindicatos').replaceChildren();
    for(const monitor of monitoramentos){if([...$('cliente-sindicatos').options].some(o=>o.value===String(monitor.sindicato_id)))continue;const opcao=document.createElement('option');opcao.value=String(monitor.sindicato_id);opcao.textContent=monitor.sindicato_nome;opcao.selected=!!item?.sindicatos.some(s=>s.sindicato_id===monitor.sindicato_id);$('cliente-sindicatos').append(opcao);}
    for(const antigo of item?.sindicatos || []){
      if(monitoramentos.some(m=>m.sindicato_id===antigo.sindicato_id))continue;
      const opcao=document.createElement('option');opcao.value=String(antigo.sindicato_id);opcao.textContent=`${antigo.nome} · vínculo anterior`;opcao.selected=true;$('cliente-sindicatos').append(opcao);
    }
    editorVinculos ||= window.criarEditorVinculosCliente();
    editorVinculos.reset(item,monitoramentos);
    consultaCnpjCliente ||= window.criarConsultaCnpjCliente((path)=>api(path,'GET',undefined,headersContexto()),mensagem);
    consultaCnpjCliente.reset(item);
    window.dispatchEvent(new CustomEvent('mediador:cadastro-editar',{detail:{tipo:'cliente',item}}));
    $('cliente-razao').focus();
  }
  function abrirContato(item=null) {
    editandoContato=item;$('contato-contexto-form').reset();$('contato-contexto-form').hidden=false;
    $('contato-contexto-titulo').textContent=item?'Editar contato':'Novo contato';
    for(const campo of ['nome','email','telefone','cargo']) $('contato-'+campo).value=item?.[campo] || '';
    $('contato-ativo').value=String(item?.ativo ?? true);window.dispatchEvent(new CustomEvent('mediador:cadastro-editar',{detail:{tipo:'contato',item}}));$('contato-nome').focus();
  }
  function renderizarDocumentos(lista){
    $('lista-documentos-contexto').replaceChildren();$('decisao-contexto-form').hidden=true;decisaoDocumento=null;
    $('documentos-status').textContent=lista.length?`${lista.length} documento(s) relacionado(s).`:'Nenhum documento relacionado. Atualize os candidatos após conferir os vínculos do cliente.';
    const cliente=clienteDocumentos,geracao=geracaoDocumentos,headers=headersContexto();
    for(const documento of lista){
      const li=document.createElement('li'),titulo=document.createElement('strong'),texto=document.createElement('p');
      titulo.textContent=`${documento.numero_registro} · ${{confirmado:'Aplicabilidade confirmada',rejeitado:'Não se aplica',candidato:'Conferir aplicabilidade'}[documento.status]}`;
      texto.textContent=`${documento.tipo || ''} · ${documento.vigencia || 'Vigência a conferir'}. ${documento.motivo}`;li.append(titulo,texto);
      if(documento.responsavel){const decisao=document.createElement('p');decisao.textContent=`Decisão: ${documento.responsavel} · ${documento.justificativa || ''}`;li.append(decisao);}
      if(documento.arquivo_disponivel){const baixar=document.createElement('button');baixar.type='button';baixar.className='secondary';baixar.textContent='Baixar original';
        baixar.onclick=acaoCadastro(async()=>{
          const resposta=await fetch(`/api/contexto/clientes/${cliente.id}/documentos/original?numero=${encodeURIComponent(documento.numero_registro)}`,{headers,credentials:'same-origin'});
          if(!resposta.ok)throw new Error((await resposta.json()).erro || 'Não foi possível baixar o original.');
          const blob=await resposta.blob();if(geracao!==geracaoDocumentos)return;
          const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=documento.numero_registro.replace(/[^A-Z0-9_-]/gi,'_')+(resposta.headers.get('content-type')==='application/pdf'?'.pdf':'.doc');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        });li.append(baixar);}
      if(podeEditar()){const decidir=document.createElement('button');decidir.type='button';decidir.textContent='Decidir aplicabilidade';decidir.disabled=documento.desatualizado;
        decidir.onclick=()=>{decisaoDocumento=documento;$('decisao-contexto-form').reset();$('decisao-contexto-form').hidden=false;$('decisao-contexto-titulo').textContent=`Decisão · ${documento.numero_registro}`;$('decisao-responsavel').value=sessao.usuario.nome;$('decisao-status').value=documento.status==='rejeitado'?'rejeitado':'confirmado';$('decisao-justificativa').focus();};li.append(decidir);}
      $('lista-documentos-contexto').append(li);
    }
  }
  async function abrirDocumentos(cliente){
    limparDocumentos();clienteDocumentos=cliente;const geracao=geracaoDocumentos;
    $('documentos-contexto').hidden=false;$('documentos-contexto-titulo').textContent=`Documentos · ${cliente.razao_social}`;$('documentos-atualizar').hidden=!podeEditar();$('documentos-status').textContent='Carregando documentos…';
    try{const lista=await api(`/api/contexto/clientes/${cliente.id}/documentos`,'GET',undefined,headersContexto());if(geracao===geracaoDocumentos)renderizarDocumentos(lista);}
    catch(erro){if(geracao===geracaoDocumentos){limparDocumentos();throw erro;}}
  }
  $('documentos-fechar').onclick=limparDocumentos;
  $('decisao-cancelar').onclick=()=>{decisaoDocumento=null;$('decisao-contexto-form').reset();$('decisao-contexto-form').hidden=true;};
  $('documentos-atualizar').onclick=acaoCadastro(async()=>{const geracao=++geracaoDocumentos;const lista=await api(`/api/contexto/clientes/${clienteDocumentos.id}/documentos/atualizar`,'POST',{},headersContexto());if(geracao===geracaoDocumentos)renderizarDocumentos(lista);});
  formulario('decisao-contexto-form',async()=>{
    if(!decisaoDocumento||!clienteDocumentos)throw new Error('Selecione o documento novamente.');
    const geracao=geracaoDocumentos;
    const lista=await api(`/api/contexto/clientes/${clienteDocumentos.id}/documentos/decidir`,'POST',
      {numero:decisaoDocumento.numero_registro,versao:decisaoDocumento.versao,status:$('decisao-status').value,justificativa:$('decisao-justificativa').value},headersContexto());
    if(geracao===geracaoDocumentos){renderizarDocumentos(lista);mensagem('Decisão registrada sem inclusão na fila de e-mail.');}
  });
  function abrirMonitoramento(item=null){
    editandoMonitoramento=item;$('monitoramento-contexto-form').reset();$('monitoramento-contexto-form').hidden=false;
    $('monitoramento-contexto-titulo').textContent=item?'Editar configuração':'Configurar sindicato';$('monitoramento-sindicato').replaceChildren();
    for(const sindicato of catalogo){const opcao=document.createElement('option');opcao.value=String(sindicato.id);opcao.textContent=sindicato.nome;$('monitoramento-sindicato').append(opcao);}
    if(item)$('monitoramento-sindicato').value=String(item.sindicato_id);
    $('monitoramento-sindicato').disabled=!!item;
    for(const [campo,chave] of [['nome','nome'],['cnpj','cnpj_filtro'],['categoria','categoria'],['uf','uf'],['titulo','titulo'],['vigencia','vigencia']])$('monitoramento-'+campo).value=item?.[chave] || '';
    $('monitoramento-ativo').value=String(item?.ativo ?? true);
    for(const opcao of $('monitoramento-tipos').options)opcao.selected=(item?.tipos || ['Convenção Coletiva']).includes(opcao.value);
    window.dispatchEvent(new CustomEvent('mediador:cadastro-editar',{detail:{tipo:'monitoramento',item}}));$('monitoramento-nome').focus();
  }
  $('novo-monitoramento-contexto').onclick=()=>abrirMonitoramento();
  $('monitoramento-cancelar').onclick=()=>{$('monitoramento-contexto-form').reset();$('monitoramento-contexto-form').hidden=true;editandoMonitoramento=null;};
  formulario('monitoramento-contexto-form',async()=>{
    const geracao=geracaoCadastros,id=editandoMonitoramento?.id,dados={sindicato_id:Number($('monitoramento-sindicato').value),
      nome:$('monitoramento-nome').value,cnpj_filtro:$('monitoramento-cnpj').value,categoria:$('monitoramento-categoria').value,uf:$('monitoramento-uf').value,
      titulo:$('monitoramento-titulo').value,vigencia:$('monitoramento-vigencia').value,tipos:[...$('monitoramento-tipos').selectedOptions].map(o=>o.value),ativo:$('monitoramento-ativo').value==='true'};
    await api('/api/contexto/monitoramentos'+(id?'/'+id:''),id?'PUT':'POST',dados,headersContexto());
    if(geracao===geracaoCadastros){await carregarCadastros();mensagem('Configuração salva.');}
  });
  $('novo-cliente-contexto').onclick=()=>abrirCliente();$('novo-contato-contexto').onclick=()=>abrirContato();
  $('cliente-cancelar').onclick=()=>{$('cliente-contexto-form').reset();$('cliente-contexto-form').hidden=true;editandoCliente=null;};
  $('contato-cancelar').onclick=()=>{$('contato-contexto-form').reset();$('contato-contexto-form').hidden=true;editandoContato=null;};
  formulario('cliente-contexto-form',async()=>{
    const geracao=geracaoCadastros, id=editandoCliente?.id;
    const dados={razao_social:$('cliente-razao').value,cnpj:$('cliente-cnpj').value,nome_fantasia:$('cliente-fantasia').value,
      uf:$('cliente-uf').value,municipio:$('cliente-municipio').value,ativo:$('cliente-ativo').value==='true',modo_envio:$('cliente-modo').value,
      contatos:editorVinculos.read('contatos'),sindicatos:editorVinculos.read('sindicatos'),dados_cnpj:consultaCnpjCliente.read()};
    await api('/api/contexto/clientes'+(id?'/'+id:''),id?'PUT':'POST',dados,headersContexto());
    if(geracao===geracaoCadastros){await carregarCadastros();mensagem('Cliente salvo.');}
  });
  formulario('contato-contexto-form',async()=>{
    const geracao=geracaoCadastros,id=editandoContato?.id,dados={ativo:$('contato-ativo').value==='true'};
    for(const campo of ['nome','email','telefone','cargo'])dados[campo]=$('contato-'+campo).value;
    await api('/api/contexto/contatos'+(id?'/'+id:''),id?'PUT':'POST',dados,headersContexto());
    if(geracao===geracaoCadastros){await carregarCadastros();mensagem('Contato salvo.');}
  });
  const salvarContexto = contexto => {
    selecionado = contexto; sessionStorage.setItem(chaveContexto, JSON.stringify(contexto));
    const opcao = opcoes.find(o => o.tipo === contexto.tipo && o.id === (contexto.cliente_id || contexto.escritorio_id));
    $('contexto-selecionado').textContent = `Contexto selecionado: ${opcao?.nome || 'Acesso confirmado'}${contexto.concessao ? ' · acesso administrativo' : ''}.`;
    $('suporte-encerrar').hidden = !contexto.concessao;

    void carregarCadastros();
  };
  $('contexto').onchange = () => {
    limparCadastros();
    const opcao = opcoes[Number($('contexto').value)]; const suporte = !!opcao && !opcao.membro && opcao.tipo === 'escritorio';
    $('suporte-campos').hidden = !suporte; $('suporte-justificativa').required = suporte;
  };
  formulario('contexto-form', async () => {
    const opcao = $('contexto').value === '' ? null : opcoes[Number($('contexto').value)]; if (!opcao) throw new Error('Selecione um contexto.');
    const anterior=selecionado;selecionado=null;sessionStorage.removeItem(chaveContexto);$('contexto-selecionado').textContent='Alterando escritório…';$('suporte-encerrar').hidden=true;
    limparCadastros();
    $('contexto').disabled=true;
    try {
    if (anterior?.concessao) await api('/api/auth/suporte/encerrar', 'POST', { concessao: anterior.concessao });
    const result = !opcao.membro && opcao.tipo === 'escritorio'
      ? await api('/api/auth/suporte/iniciar', 'POST', { escritorio_id: opcao.id, justificativa: $('suporte-justificativa').value })
      : await api('/api/auth/contexto', 'POST', { tipo: opcao.tipo, id: opcao.id });
    salvarContexto(result.contexto); mensagem('Contexto confirmado.');
    } finally { $('contexto').disabled=false; }
  });
  formulario('perfil-form', async () => { sessao = await api('/api/auth/perfil', 'PUT', { nome: $('perfil-nome').value }); $('auth-identidade').textContent = `${sessao.usuario.nome} · ${sessao.usuario.email}`; mensagem('Nome atualizado.'); });
  $('suporte-encerrar').onclick = async () => {
    try { await api('/api/auth/suporte/encerrar', 'POST', { concessao: selecionado.concessao }); selecionado = null; limparCadastros(); sessionStorage.removeItem(chaveContexto); $('contexto-selecionado').textContent = 'Acesso administrativo encerrado.'; $('suporte-encerrar').hidden = true; }
    catch (erro) { mensagem(erro.message, true); }
  };
  $('auth-sair').onclick = async () => {
    try { await api('/api/auth/logout', 'POST'); sessionStorage.removeItem(chaveContexto); location.replace('/login'); } catch (erro) { mensagem(erro.message, true); }
  };
  api('/api/auth/sessao').then(async data => {
    window.dispatchEvent(new CustomEvent('mediador:sessao',{detail:data}));
    sessao = data; $('auth-identidade').textContent = `${data.usuario.nome} · ${data.usuario.email}`; $('perfil-nome').value = data.usuario.nome;
    $('painel-global').hidden = !data.painel_global;
    opcoes = [...data.contextos.escritorios.map(e => ({ ...e, tipo: 'escritorio' })), ...data.contextos.clientes.map(c => ({ ...c, nome: c.razao_social, tipo: 'cliente', membro: true }))];
    opcoes.forEach((o, i) => { const el = document.createElement('option'); el.value = String(i); el.textContent = `${o.tipo === 'cliente' ? 'Empresa' : 'Escritório'} · ${o.nome}`; $('contexto').append(el); });
    if (!opcoes.length) $('contexto-selecionado').textContent = 'Sua conta ainda não tem vínculo com um escritório ou empresa. Consulte o responsável pelo seu cadastro.';
    const requested=Number(new URLSearchParams(location.search).get('escritorio'));
    const requestedIndex=opcoes.findIndex(option=>option.tipo==='escritorio'&&option.id===requested);
    if(requestedIndex>=0){
      $('contexto').value=String(requestedIndex);$('contexto').onchange();
      $('suporte-justificativa').value='Troca de escritório pela área de trabalho';$('contexto-form').requestSubmit();
      return;
    }
    try {
      const salvo = JSON.parse(sessionStorage.getItem(chaveContexto) || 'null');
      if (salvo) {
        const headers = { 'x-context-type': salvo.tipo, 'x-context-id': String(salvo.cliente_id || salvo.escritorio_id) };
        if (salvo.concessao) headers['x-support-grant'] = salvo.concessao;
        const result = await api('/api/auth/contexto', 'GET', undefined, headers);
        const idx = opcoes.findIndex(o => o.tipo === salvo.tipo && o.id === (salvo.cliente_id || salvo.escritorio_id));
        if (idx >= 0) { $('contexto').value = String(idx); $('contexto').onchange(); }
        salvarContexto(result.contexto);
      }
    } catch { sessionStorage.removeItem(chaveContexto); }
    if(!selecionado&&opcoes.length===1&&opcoes[0].membro){$('contexto').value='0';$('contexto').onchange();$('contexto-form').requestSubmit();}
  }).catch(erro => mensagem(erro.message, true));
})();





