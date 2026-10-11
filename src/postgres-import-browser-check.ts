import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import type {Pool} from 'pg';
import {criarHashSenha} from './auth-core.js';

/** Browser reads imported data only in a disposable database. No imported account is modified. */
export async function validarNavegadorImportacaoIsolada(admin:Pool){
  const database=(await admin.query('SELECT current_database() nome')).rows[0].nome as string;
  assert.match(database,/^mediador_import_test_[a-f0-9]{32}$/);
  const offices=(await admin.query('SELECT id,nome FROM escritorios WHERE ativo ORDER BY id')).rows;
  assert.ok(offices.length>=2,'São necessários dois escritórios ativos para a jornada.');
  const counts=(await admin.query('SELECT (SELECT count(*)::integer FROM clientes WHERE escritorio_id=e.id) clientes FROM escritorios e WHERE ativo ORDER BY id')).rows;
  assert.ok(counts.some(row=>row.clientes===0),'A jornada exige um escritório vazio na cópia.');
  const email=`browser-${randomUUID()}@example.invalid`,password=`Teste-A1!-${randomUUID()}`;
  const user=(await admin.query("INSERT INTO usuarios(nome,email) VALUES('Validação navegador',$1) RETURNING id",[email])).rows[0].id;
  await admin.query('INSERT INTO credenciais_usuarios(usuario_id,senha_hash,atualizado_em) VALUES($1,$2,$3)',[user,await criarHashSenha(password),Date.now()]);
  for(const office of offices)await admin.query("INSERT INTO usuarios_escritorios(usuario_id,escritorio_id,papel) VALUES($1,$2,'operador')",[user,office.id]);
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
  const address=probe.address();assert.ok(address&&typeof address!=='string');const port=address.port;
  await new Promise<void>(resolve=>probe.close(()=>resolve()));
  const origin=`http://127.0.0.1:${port}`;
  const server=spawn(process.execPath,['dist/server.js'],{windowsHide:true,stdio:'ignore',env:{...process.env,
    APP_POSTGRES_CONTEXT:'1',PGDATABASE:database,PGPOOL_MAX:'5',UI_PORT:String(port),AUTH_PUBLIC_URL:origin,
    AUTH_TRUSTED_PROXY_CIDRS:'',AUTH_SMTP_ENABLED:'0'}});
  const closed=new Promise<void>(resolve=>{server.once('exit',()=>resolve());server.once('error',()=>resolve());});
  let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
  try{
    let ready=false;
    for(let i=0;i<200;i++){
      assert.equal(server.exitCode,null,'Servidor deve permanecer ativo.');
      try{if((await fetch(origin+'/api/auth/estado')).status===200){ready=true;break;}}catch{}
      await delay(100);
    }
    assert.ok(ready,'Servidor PostgreSQL deve iniciar.');
    browser=await chromium.launch({headless:true});const page=await browser.newPage();
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    const failed:string[]=[];page.on('response',response=>{if(response.status()>=400)failed.push(`${new URL(response.url()).pathname}:${response.status()}`);});
    await page.goto(origin+'/login');await page.locator('#login-email').fill(email);
    await page.locator('#login-senha').fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.waitForURL(origin+'/');
    assert.equal(await page.locator('#resumo-escritorio').isVisible(),false);
    for(const office of [...offices,...offices.slice(0,1)]){
      const selected=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/contexto'&&response.request().method()==='POST');
      await page.getByLabel('Escritório ou empresa',{exact:true}).selectOption({label:`Escritório · ${office.nome}`});
      assert.equal((await selected).status(),200);
      const expected=(await admin.query('SELECT id FROM clientes WHERE escritorio_id=$1 ORDER BY id',[office.id])).rows.map(row=>String(row.id)).sort();
      try{await page.waitForFunction(()=>document.querySelector('#cadastros-status')?.textContent?.includes('cliente(s)'),undefined,{timeout:15000});}
      catch{
        const diagnostic=await page.evaluate(async id=>{const response=await fetch('/api/contexto/resumo',{headers:{'x-context-type':'escritorio','x-context-id':String(id)}});return (await response.json()).erro;},office.id);
        console.error('Jornada navegador: consultas recusadas',failed.join(','),'erros de script',errors.length,'timeout de conexão',String(diagnostic).includes('timeout'),'pool mínimo',String(diagnostic).includes('duas conexões'));
        throw new Error('Cadastros não carregados na jornada.');
      }
      await page.getByRole('button',{name:'Cadastros',exact:true}).click();
      const actual=await page.locator('#lista-clientes-contexto tr').filter({has:page.getByRole('button',{name:'Documentos',exact:true})}).count();
      // Compare API identifiers exactly; rendered count verifies the same journey without exposing names.
      const ids=await page.evaluate(async id=>{
        const response=await fetch('/api/contexto/clientes',{headers:{'x-context-type':'escritorio','x-context-id':String(id)}});
        if(!response.ok)throw new Error('Consulta contextual recusada.');
        return (await response.json()).map((row:{id:number})=>String(row.id)).sort();
      },office.id);
      assert.deepEqual(ids,expected);
      assert.equal(actual,expected.length);
      await page.locator('#resumo-escritorio .resumo-indicadores').waitFor({state:'attached'});
      const active=(await admin.query('SELECT count(*)::integer n FROM clientes WHERE escritorio_id=$1 AND ativo',[office.id])).rows[0].n;
      assert.equal(await page.locator('#resumo-escritorio dd').first().textContent(),String(active));
      if(expected.length){
        const loaded=page.waitForResponse(response=>/^\/api\/contexto\/clientes\/[1-9]\d*\/documentos$/.test(new URL(response.url()).pathname));
        await page.locator('#lista-clientes-contexto').getByRole('button',{name:'Documentos',exact:true}).first().click();
        const response=await loaded;assert.equal(response.status(),200);const documents=await response.json();
        await page.waitForFunction(()=>document.querySelector('#documentos-status')?.textContent!=='Carregando documentos…');
        assert.equal(await page.locator('#documentos-contexto').isVisible(),true);
        assert.equal(await page.locator('#lista-documentos-contexto li').count(),documents.length||1);
        await page.locator('#documentos-fechar').click();
      }
    }
    await admin.query('UPDATE usuarios_escritorios SET ativo=false WHERE usuario_id=$1 AND escritorio_id=$2',[user,offices[0].id]);
    assert.equal(await page.evaluate(async id=>(await fetch('/api/contexto/resumo',{headers:{'x-context-type':'escritorio','x-context-id':String(id)}})).status,offices[0].id),403);
    await page.getByRole('button',{name:'Minha conta',exact:true}).click();await page.locator('#auth-sair').click();await page.waitForURL(origin+'/login');
    assert.deepEqual(errors,[]);
    return {servidor_real:true,navegador:true,escritorios_verificados:offices.length,escritorio_vazio:true,retorno_ao_contexto:true,resumo:true,consulta_documentos:true,revogacao:true,logout:true};
  }finally{
    await browser?.close();if(server.exitCode===null)server.kill();await closed;
  }
}

