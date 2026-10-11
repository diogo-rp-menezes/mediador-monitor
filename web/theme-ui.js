(()=>{
  try{const saved=localStorage.getItem('mediador_tema');if(['light','dark'].includes(saved))document.documentElement.dataset.theme=saved;}catch{}
  new MutationObserver(()=>{try{const value=document.documentElement.dataset.theme;if(['light','dark'].includes(value))localStorage.setItem('mediador_tema',value);}catch{}}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  document.addEventListener('DOMContentLoaded',()=>{
    if(document.getElementById('theme'))return;
    const header=document.querySelector('.workspace-header');if(!header)return;
    if(!document.documentElement.dataset.theme)document.documentElement.dataset.theme='dark';
    const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='◐';button.setAttribute('aria-label','Alternar tema');
    button.onclick=()=>{const root=document.documentElement,dark=root.dataset.theme?root.dataset.theme==='dark':matchMedia('(prefers-color-scheme:dark)').matches;root.dataset.theme=dark?'light':'dark';};
    header.querySelector('.auth-actions').prepend(button);
  });
})();
