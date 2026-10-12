import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createServer} from 'vite';
import vue from '@vitejs/plugin-vue';
import {chromium} from 'playwright';
const dir=mkdtempSync(join(tmpdir(),'mediador-hmr-'));let vite,browser;
try{
 mkdirSync(join(dir,'src'));writeFileSync(join(dir,'index.html'),'<div id="app"></div><script type="module" src="/app/src/main.js"></script>');
 writeFileSync(join(dir,'src/main.js'),`import {createApp} from ${JSON.stringify(resolve('node_modules/vue/dist/vue.esm-bundler.js').replaceAll('\\','/'))};import App from './App.vue';createApp(App).mount('#app');`);
 const source=label=>`<script setup>import {ref} from ${JSON.stringify(resolve('node_modules/vue/dist/vue.esm-bundler.js').replaceAll('\\','/'))};const value=ref('');</script><template><h1>${label}</h1><input aria-label="Estado preservado" v-model="value"></template>`;
 writeFileSync(join(dir,'src/App.vue'),source('Antes da alteração'));
 vite=await createServer({configFile:false,root:dir,base:'/app/',plugins:[vue()],server:{host:'127.0.0.1',port:0,fs:{allow:[dir,resolve('node_modules')]}}});await vite.listen();const address=vite.httpServer.address();
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${address.port}/app/`);await page.getByLabel('Estado preservado').fill('Conteúdo digitado');await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='Antes da alteração');writeFileSync(join(dir,'src/App.vue'),source('Depois da alteração'));await page.getByRole('heading',{name:'Depois da alteração'}).waitFor();assert.equal(await page.getByLabel('Estado preservado').inputValue(),'Conteúdo digitado');console.log('OK: Vue HMR atualiza o template e preserva o estado digitado.');
}finally{await browser?.close();await vite?.close();assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));rmSync(dir,{recursive:true,force:true});}
