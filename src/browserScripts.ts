/**
 * Código executado NO CHROME pelo Playwright.
 *
 * IMPORTANTE: use STRING, não callbacks TypeScript. O transpiler do `tsx watch`
 * injeta `__name(...)` em algumas funções serializadas por Playwright. Esse
 * helper existe somente no Node e resulta em `ReferenceError: __name is not defined`
 * quando a função é executada dentro da página do MTE.
 */
export const domInventoryScript = String.raw`function () {
  return {
    url: location.href,
    inputs: Array.from(document.querySelectorAll('input')).map(function(x) {
      return { name:x.name, id:x.id, type:x.type, placeholder:x.placeholder,
        value:x.type === 'password' ? '[redacted]' : x.value };
    }),
    selects: Array.from(document.querySelectorAll('select')).map(function(x) {
      return { name:x.name, id:x.id, value:x.value, options:Array.from(x.options).map(function(o) {
        return { text:o.text, value:o.value };
      }) };
    }),
    actions: Array.from(document.querySelectorAll('a,button,input[type="button"],input[type="submit"],[role="button"]')).map(function(x) {
      return {text:(x.textContent || x.value || '').trim().slice(0,120),
        href:x.getAttribute('href'), onclick:x.getAttribute('onclick')};
    })
  };
}`;

export const controlByLabelScript = String.raw`function (controls, args) {
  function norm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  var wanted = norm(args.label), candidates = [];
  for (var i=0; i<controls.length; i++) {
    var el = controls[i], best = -Infinity;
    for (var depth=0; el && depth<7; depth++, el=el.parentElement) {
      var txt = norm(el.innerText || el.textContent || '');
      if (!txt.includes(wanted) || txt.length > 320) continue;
      var count = el.querySelectorAll(args.selector).length;
      var score = 200 - depth*12 - Math.max(0,txt.length-wanted.length)/6 - Math.max(0,count-1)*30;
      best = Math.max(best,score);
    }
    if (best > -Infinity) candidates.push({ index:i, score:best });
  }
  candidates.sort(function(a,b){ return b.score-a.score; });
  return candidates.length ? candidates[0].index : -1;
}`;

export const selectOptionsScript = String.raw`function (elements) {
  return elements.map(function(o){ return {value:o.value, text:(o.textContent || '').trim()}; });
}`;

export const collectResultActionsScript = String.raw`function (elements) {
  var candidates=[];
  elements.forEach(function(e,index) {
    var text=(e.textContent || e.value || '').replace(/\s+/g,' ').trim();
    var href=e.getAttribute('href') || '';
    var onclick=e.getAttribute('onclick') || '';
    if (!/download|baixar|visualizar\s+instrumento|\.pdf|\.docx?/i.test(text+' '+href+' '+onclick)) return;
    if (/menu|ajuda|manual/i.test(text)) return;
    var node=e, best='';
    for(var depth=0; depth<10 && node; depth++,node=node.parentElement) {
      var raw=node.innerText || node.textContent || '';
      var solicitations=raw.match(/MR\s*\d{4,8}\s*\/\s*\d{4}/gi) || [];
      if (solicitations.length===1 && /N[º°o]?\s*d[ao]\s*Registro|N[º°o]?\s*d[ao]\s*Solicita/i.test(raw)) { best=raw; break; }
      if (!best && solicitations.length===1) best=raw;
    }
    candidates.push({index:index,text:text,href:href,onclick:onclick,block:best});
  });
  return candidates;
}`;
