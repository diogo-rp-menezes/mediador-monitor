import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {criarPoolPostgres} from '../dist/postgres.js';
import {migratePostgres} from '../dist/postgres-migrations.js';
import {criarHashSenha} from '../dist/auth-core.js';

const id=randomUUID().replaceAll('-',''),database='mediador_docker_test_'+id,container='mediador-app-test-'+id;
const admin=criarPoolPostgres();let setup,browser,created=false,running=false;
const docker=(args,env=process.env)=>execFileSync('docker',args,{env,windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:60000});
try{
  assert.match(database,/^mediador_docker_test_[a-f0-9]{32}$/);await admin.query(`CREATE DATABASE "${database}"`);created=true;
  setup=criarPoolPostgres({...process.env,PGDATABASE:database});await migratePostgres(setup);
  const role=process.env.PGAPPUSER;assert.match(role,/^[a-z_][a-z0-9_]*$/);
  await setup.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);await setup.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`);await setup.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
  const offices=[];
  for(const name of ['Docker A','Docker B'])offices.push((await setup.query('INSERT INTO escritorios(nome) VALUES($1) RETURNING id',[name])).rows[0].id);
  await setup.query("INSERT INTO clientes(escritorio_id,razao_social,cnpj) VALUES($1,'Cliente somente A','11222333000181')",[offices[0]]);
  const password='Senha longa do teste Docker local 2026!',email='docker@example.invalid';
  const user=(await setup.query("INSERT INTO usuarios(nome,email) VALUES('Usuário Docker',$1) RETURNING id",[email])).rows[0].id;
  await setup.query('INSERT INTO credenciais_usuarios(usuario_id,senha_hash,atualizado_em) VALUES($1,$2,$3)',[user,await criarHashSenha(password),Date.now()]);
  for(const office of offices)await setup.query("INSERT INTO usuarios_escritorios(usuario_id,escritorio_id,papel) VALUES($1,$2,'administrador')",[user,office]);
  const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const origin=`http://127.0.0.1:${port}`,env={...process.env,PGHOST:'host.docker.internal',PGDATABASE:database,AUTH_PUBLIC_URL:origin};
  docker(['run','--detach','--name',container,'--label','mediador.test=app','--publish',`127.0.0.1:${port}:3000`,...['PGHOST','PGPORT','PGDATABASE','PGAPPUSER','PGAPPASSWORD','AUTH_PUBLIC_URL','CREDENTIALS_MASTER_KEY'].flatMap(name=>['--env',name]),'mediador-monitor:local'],env);running=true;
  async function ready(){for(let i=0;i<120;i++){try{if((await fetch(origin+'/api/auth/estado')).ok)return;}catch{}await delay(250);}throw new Error('Aplicação Docker não iniciou.');}
  await ready();
  docker(['exec',container,'node','--input-type=module','-e',`import {createRequire} from 'node:module';import {existsSync} from 'node:fs';import {chromium} from 'playwright';const require=createRequire(import.meta.url);for(const name of ['better-sqlite3','node-cron']){let found=false;try{require.resolve(name);found=true;}catch{}if(found)throw new Error('Dependência legada instalada');}for(const path of ['dist/server-sqlite-dev.js','dist/db.js','web/index.html','.env.docker'])if(existsSync(path))throw new Error('Artefato legado ou segredo na imagem');const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.setContent('<p>PDF Docker local</p>');const bytes=await page.pdf();if(bytes.subarray(0,4).toString()!=='%PDF')throw new Error('PDF inválido');}finally{await browser.close();}`]);
  browser=await chromium.launch({headless:true});const page=await browser.newPage();
  await page.goto(origin+'/login');await page.locator('#login-email').fill(email);await page.locator('#login-senha').fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL(origin+'/');
  await page.getByLabel('Escritório ou empresa',{exact:true}).selectOption({label:'Escritório · Docker A'});
  await page.locator('#lista-clientes-contexto').getByText('Cliente somente A',{exact:true}).waitFor({state:'attached'});
  await page.getByLabel('Escritório ou empresa',{exact:true}).selectOption({label:'Escritório · Docker B'});
  await page.locator('#lista-clientes-contexto').getByText('Nenhum cadastro neste escritório.',{exact:true}).waitFor({state:'attached'});
  assert.equal(await page.locator('#lista-clientes-contexto').getByText('Cliente somente A',{exact:true}).count(),0);
  docker(['restart',container]);await ready();await page.reload();
  await page.locator('#contexto-selecionado').filter({hasText:'Docker B'}).waitFor({state:'attached'});
  assert.equal((await fetch(origin+'/api/clientes')).status,404);assert.equal((await fetch(origin+'/clientes-ui.js')).status,404);
  console.log('OK: imagem sem driver/cron/artefatos legados, Chromium/PDF, login, isolamento de dois escritórios e sessão/contexto após reinício.');
}finally{
  await browser?.close();if(running){assert.match(container,/^mediador-app-test-[a-f0-9]{32}$/);docker(['rm','--force',container]);}
  await setup?.end();if(created){assert.match(database,/^mediador_docker_test_[a-f0-9]{32}$/);await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);}await admin.end();
}
