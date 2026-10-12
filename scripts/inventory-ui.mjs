import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
const roots=['web','frontend/src/components','src'];
const files=roots.flatMap(root=>readdirSync(root).filter(name=>/\.(html|js|vue|ts)$/.test(name)).map(name=>`${root}/${name}`));
const rows=[];
for(const file of files){
  const content=readFileSync(file,'utf8');
  if(file.startsWith('src/')&&!file.includes('http')&&!file.endsWith('/server.ts'))continue;
  const routes=[...new Set([...content.matchAll(/\/api\/[a-zA-Z0-9_/${}?=.%:+,&()\[\]-]+/g)].map(match=>match[0]))].sort();
  if(routes.length)rows.push(`## ${file}\n\n${routes.map(route=>`- \`${route}\``).join('\n')}`);
}
mkdirSync('docs/06-frontend-design',{recursive:true});
writeFileSync('docs/06-frontend-design/UI_FUNCTIONAL_SOURCE_INVENTORY.md',`# Inventário de referências funcionais\n\nGerado por \`node scripts/inventory-ui.mjs\`. Extrai referências literais de rotas das interfaces históricas, Vue e handlers HTTP atuais. Expressões dinâmicas são preservadas; esta lista é rastreabilidade de código, não prova de cobertura nem lista exaustiva de comportamentos. Complementa a matriz funcional revisada manualmente.\n\n${rows.join('\n\n')}\n`);
