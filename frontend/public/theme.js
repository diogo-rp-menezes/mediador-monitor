// Runs before the stylesheet/application paint under the self-only CSP.
(() => {
  let saved;
  try { saved = localStorage.getItem('mediador_tema'); } catch { /* Storage may be unavailable. */ }
  document.documentElement.dataset.theme = saved === 'light' || saved === 'dark'
    ? saved
    : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
})();
