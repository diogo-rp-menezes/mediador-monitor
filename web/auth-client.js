(() => {
  'use strict';
  const originalFetch = window.fetch.bind(window);
  let sessao;
  const ready = originalFetch('/api/auth/sessao', { credentials: 'same-origin' }).then(async response => {
    if (response.status === 401) { sessionStorage.removeItem('mediador_contexto'); location.replace('/login'); throw new Error('Entre para continuar.'); }
    if (!response.ok) throw new Error('Não foi possível consultar sua sessão.');
    sessao = await response.json(); return sessao;
  });
  // Consumidores preservam a API fetch existente; token de sessão fica somente no cookie HttpOnly.
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return originalFetch(input, init);
    await ready;
    const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (!['GET', 'HEAD'].includes(method)) headers.set('x-csrf-token', sessao.csrf);
    const response = await originalFetch(input, { ...init, headers });
    if (response.status === 401) { sessionStorage.removeItem('mediador_contexto'); location.replace('/login'); }
    return response;
  };
  ready.then(async data => {
    if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    const header = document.querySelector('header');
    if (header) {
      const area = document.createElement('div'); area.className = 'row';
      const nome = document.createElement('span'); nome.className = 'muted'; nome.textContent = `${data.usuario.nome} · Painel global`;
      const perfil = document.createElement('a'); perfil.href = '/acesso'; perfil.textContent = 'Minha conta';
      const sair = document.createElement('button'); sair.type = 'button'; sair.textContent = 'Sair'; sair.className = 'sm';
      sair.onclick = async () => { sair.disabled = true; try { const r = await window.fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); if (!r.ok) throw new Error('Não foi possível sair.'); sessionStorage.removeItem('mediador_contexto'); location.replace('/login'); } catch { sair.disabled = false; sair.textContent = 'Tentar sair novamente'; } };
      const officeLabel=document.createElement('label');officeLabel.textContent='Abrir escritório';officeLabel.htmlFor='global-escritorio';
      const office=document.createElement('select');office.id='global-escritorio';office.style.maxWidth='240px';
      const empty=document.createElement('option');empty.value='';empty.textContent='Painel global';office.append(empty);
      for(const item of data.contextos.escritorios){const option=document.createElement('option');option.value=String(item.id);option.textContent=item.nome;office.append(option);}
      office.onchange=()=>{if(office.value)location.assign('/acesso?escritorio='+encodeURIComponent(office.value));};
      area.append(nome,officeLabel,office,perfil,sair); header.append(area);
    }
    const identificar = () => { for (const id of ['ev-responsavel', 'dc-responsavel', 'review-revisor']) { const campo = document.getElementById(id); if (campo) { campo.value = data.usuario.nome; campo.readOnly = true; } } };
    identificar(); new MutationObserver(identificar).observe(document.body, { childList: true, subtree: true });
  }).catch(() => { /* O redirecionamento ou as requisições do painel apresentam a falha. */ });
})();
