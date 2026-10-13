import {validarLimitesCancelamento} from './limits-cancellation-integrated-checks.mjs';
import {validarRecuperacaoMonitoramento} from './monitoring-recovery-integrated-checks.mjs';
import {validarFilaEnvios} from './deliveries-integrated-checks.mjs';
import {validarAgendas} from './agendas-integrated-checks.mjs';
import {validarSolicitacaoColeta} from './collection-integrated-checks.mjs';
import {validarMonitoramento} from './monitoring-integrated-checks.mjs';
import {validarPreparoCliente} from './client-preparation-integrated-checks.mjs';
import {validarDocumentosCliente} from './client-documents-integrated-checks.mjs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {criarHashSenha} from '../dist/auth-core.js';
import {capturarUiIntegrada,capturarMinhaConta} from './ui-visual-capture.mjs';
import {validarEstruturaWorkspace,validarNavegacaoAreas} from './workspace-shell-checks.mjs';
import {validarListasCadastros,validarEditorCliente} from './registry-integrated-checks.mjs';
import {validarVinculosCliente} from './client-links-integrated.mjs';
import {validarConsultasSindicais} from './union-integrated-checks.mjs';
import {validarOriginaisIntegrados} from './instrument-integrated-checks.mjs';
import {validarAnalisesIntegradas} from './analysis-integrated-checks.mjs';
import {validarAditivosIntegrados,validarPapelAditivos} from './amendment-integrated-checks.mjs';
import {validarConsolidacaoIntegrada} from './consolidation-integrated-checks.mjs';

/** Shared synthetic identities. Refuses every database outside the HTTPS test namespace. */
export async function prepararFixtureUiIntegrada(setup){
  assert.match((await setup.query('SELECT current_database() nome')).rows[0].nome,/^mediador_https_test_[a-f0-9]{32}$/);
  const office=(await setup.query("INSERT INTO escritorios(nome) VALUES('Escritório HTTPS A') RETURNING id")).rows[0].id;
  const other=(await setup.query("INSERT INTO escritorios(nome) VALUES('Escritório HTTPS B') RETURNING id")).rows[0].id;
  const customer=(await setup.query("INSERT INTO clientes(escritorio_id,razao_social,cnpj) VALUES($1,'Empresa HTTPS A','11222333000181') RETURNING id",[office])).rows[0].id;
  const otherCustomer=(await setup.query("INSERT INTO clientes(escritorio_id,razao_social,cnpj) VALUES($1,'Empresa HTTPS B','11444777000161') RETURNING id",[other])).rows[0].id;
  const password='Ensaio UI '+randomBytes(24).toString('hex');
  const hash=await criarHashSenha(password);
  async function identity(key,name){
    const email=`${key}-https@example.invalid`;
    const id=(await setup.query('INSERT INTO usuarios(nome,email) VALUES($1,$2) RETURNING id',[name,email])).rows[0].id;
    await setup.query('INSERT INTO credenciais_usuarios(usuario_id,senha_hash,atualizado_em) VALUES($1,$2,$3)',[id,hash,Date.now()]);
    return {id,email,password};
  }
  const users={};
  users.customer=await identity('representante','Representante HTTPS');
  users.admin=await identity('administrador','Administrador HTTPS');
  users.operator=await identity('operador','Operador HTTPS');
  users.support=await identity('suporte','Suporte HTTPS');
  users.platform=await identity('plataforma','Plataforma HTTPS');
  await setup.query('INSERT INTO usuarios_clientes(usuario_id,cliente_id,escritorio_id) VALUES($1,$2,$3)',[users.customer.id,customer,office]);
  for(const id of [office,other])await setup.query("INSERT INTO usuarios_escritorios(usuario_id,escritorio_id,papel) VALUES($1,$2,'administrador')",[users.admin.id,id]);
  await setup.query("INSERT INTO usuarios_escritorios(usuario_id,escritorio_id,papel) VALUES($1,$2,'operador')",[users.operator.id,office]);
  for(const [user,role] of [[users.support,'suporte'],[users.platform,'administrador_plataforma']]){
    await setup.query('INSERT INTO papeis_plataforma(usuario_id,papel,ativo) VALUES($1,$2,true)',[user.id,role]);
  }
  return {office,other,customer,otherCustomer,users};
}

/** Real login, context changes and permission boundaries through the operational Vue/HTTP app. */
export async function validarFixtureUiIntegrada(browser,origin,fixture,setup){
  const {office,other,customer,users}=fixture;
  for(const key of ['admin','operator','support','platform']){
    const context=await browser.newContext();
    try{
      const page=await context.newPage();
      await page.goto(origin+'/login');
      await page.locator('#login-email').fill(users[key].email);
      await page.getByLabel('Senha',{exact:true}).fill(users[key].password);
      await page.getByRole('button',{name:'Entrar',exact:true}).click();
      await page.waitForURL(origin+'/');
      await page.getByRole('button',{name:'Minha conta',exact:true}).click();
      const profileName=`Conta conferida ${key}`;
      await page.getByLabel('Nome',{exact:true}).fill(profileName);
      assert.equal(await page.getByLabel('E-mail',{exact:true}).getAttribute('readonly'),'');
      await page.getByRole('button',{name:'Salvar nome',exact:true}).click();
      await page.getByRole('status').getByText('Nome atualizado.',{exact:true}).waitFor();
      assert.equal(await page.evaluate(async()=>(await (await fetch('/api/auth/sessao')).json()).usuario.nome),profileName);
      await page.reload();
      await page.getByRole('heading',{name:'Dados pessoais',exact:true}).waitFor();
      assert.equal(await page.getByLabel('Nome',{exact:true}).inputValue(),profileName);
      assert.equal(await page.getByLabel('E-mail',{exact:true}).inputValue(),users[key].email);
      if(key==='admin')await capturarMinhaConta(page);
      const selector=page.getByLabel('Seu espaço de trabalho');
      await selector.selectOption({label:'Escritório · Escritório HTTPS A'});
      await page.getByRole('status').filter({hasText:'Contexto alterado'}).waitFor();
      await page.getByRole('button',{name:'Cadastros',exact:true}).click();
      await page.getByText('Empresa HTTPS A',{exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Novo cliente',exact:true}).count(),key==='support'?0:1);
      assert.equal(await page.getByRole('button',{name:'Plataforma',exact:true}).count(),key==='platform'?1:0);
      assert.equal(await page.getByRole('button',{name:'Escritório',exact:true}).count(),['admin','platform'].includes(key)?1:0);
      const checks=await page.evaluate(async({other,customer,key})=>{
        const current=JSON.parse(sessionStorage.getItem('mediador_contexto'));
        const session=await (await fetch('/api/auth/sessao')).json();
        const headers={'content-type':'application/json','x-csrf-token':session.csrf,'x-context-type':'escritorio','x-context-id':String(current.escritorio_id),...(current.concessao?{'x-support-grant':current.concessao}:{})};
        const status=async(path,options={})=>(await fetch(path,{headers,...options})).status;
        return {
          role:current.papel,grant:current.concessao,
          office:await status('/api/contexto/escritorio'),
          platform:await status('/api/plataforma/escritorios'),
          cross:await status('/api/contexto/clientes/'+customer,{headers:{...headers,'x-context-id':String(other)}}),
          // Invalid payload: read-only support must be rejected by authorization before validation.
          write:key==='support'?await status('/api/contexto/clientes',{method:'POST',body:'{}'}):null
        };
      },{other,customer,key});
      assert.equal(checks.role,key==='support'?'suporte':key==='operator'?'operador':'administrador');
      assert.equal(checks.office,['admin','platform'].includes(key)?200:403);
      assert.equal(checks.platform,key==='platform'?200:403);
      assert.ok([403,404].includes(checks.cross));
      if(key==='support')assert.equal(checks.write,403);
      if(key==='support'){
        await page.getByRole('button',{name:'Ver ficha de Empresa HTTPS A',exact:true}).click();
        const sheet=page.getByRole('dialog',{name:'Ficha do cliente',exact:true});
        await sheet.getByRole('heading',{name:'Dados e envio',exact:true}).waitFor();
        assert.equal(await sheet.getByRole('button',{name:'Editar cliente',exact:true}).count(),0);await sheet.getByRole('table').waitFor();assert.equal(await sheet.getByRole('button',{name:/^Decidir aplicabilidade de /}).count(),0);assert.equal(await sheet.getByRole('button',{name:/^Alterar participação de /}).count(),0);assert.equal(await sheet.getByRole('button',{name:'Preparar envios do cliente',exact:true}).count(),0);
        await sheet.getByRole('button',{name:'Fechar modal',exact:true}).click();
        await page.getByRole('button',{name:'Contatos',exact:true}).click();
        assert.equal(await page.getByRole('button',{name:'Novo contato',exact:true}).count(),0);
        await page.getByRole('button',{name:'Clientes',exact:true}).click();
      }
      await validarNavegacaoAreas(page,{restricted:['operator','support'].includes(key)});
      await validarPapelAditivos(page,key,office);
      await validarSolicitacaoColeta(page,setup,fixture,key);
      await validarAgendas(page,setup,fixture,key);
      await validarLimitesCancelamento(page,setup,fixture,key);
      await validarRecuperacaoMonitoramento(page,setup,fixture,key);
      await validarFilaEnvios(page,setup,fixture,key);
      if(key==='admin'){await validarListasCadastros(page);await validarEditorCliente(page);await validarVinculosCliente(page,setup,fixture);await validarConsultasSindicais(page,setup,fixture);await validarOriginaisIntegrados(page,setup,fixture);await validarAnalisesIntegradas(page,setup);await validarAditivosIntegrados(page,setup,fixture);await validarConsolidacaoIntegrada(page,setup,fixture);await validarDocumentosCliente(page,setup,fixture);await validarPreparoCliente(page,setup,fixture);await validarMonitoramento(page,setup,fixture);await validarEstruturaWorkspace(page);await capturarUiIntegrada(page);}
      if(key!=='operator'){
        await page.getByLabel('Buscar cadastro',{exact:true}).fill('Empresa HTTPS A');
        await selector.selectOption({label:'Escritório · Escritório HTTPS B'});
        await page.getByText('Empresa HTTPS B',{exact:true}).waitFor();
        assert.equal(await page.getByLabel('Buscar cadastro',{exact:true}).inputValue(),'');
        assert.equal(await page.getByText('Empresa HTTPS A',{exact:true}).count(),0);
        await page.getByRole('button',{name:'Minha conta',exact:true}).click();
        await page.goBack();await page.getByText('Empresa HTTPS B',{exact:true}).waitFor();
        assert.equal(await selector.inputValue(),'1');
        await page.reload();
        await page.getByLabel('Seu espaço de trabalho').waitFor();
        await page.getByRole('button',{name:'Cadastros',exact:true}).click();
        await page.getByText('Empresa HTTPS B',{exact:true}).waitFor();
        if(checks.grant){
          const revoked=(await setup.query('SELECT revogada FROM concessoes_suporte WHERE id=$1',[checks.grant])).rows[0];
          assert.equal(revoked.revogada,true);
        }
      }
      // End through the UI: deselection and the explicit button must revoke the grant.
      if(['support','platform'].includes(key)){
        const current=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mediador_contexto')));
        if(key==='support')await selector.selectOption('');
        else await page.getByRole('button',{name:'Encerrar acesso de suporte'}).click();
        await page.getByRole('status').getByText('Acesso de suporte encerrado.').waitFor();
        assert.equal(await page.evaluate(()=>sessionStorage.getItem('mediador_contexto')),null);
        assert.equal((await setup.query('SELECT revogada FROM concessoes_suporte WHERE id=$1',[current.concessao])).rows[0].revogada,true);
        const read=await page.evaluate(async current=>(await fetch('/api/contexto/clientes',{headers:{'x-context-type':'escritorio','x-context-id':String(current.escritorio_id),'x-support-grant':current.concessao}})).status,current);
        assert.equal(read,403);
      }
      await page.getByRole('button',{name:'Sair',exact:true}).click();
      await page.waitForURL(origin+'/login');
      console.log(`OK: fixture integrada — ${key}: login real, papel, permissões, isolamento e logout.`);
    }finally{await context.close();}
  }
  const audit=(await setup.query("SELECT DISTINCT acao FROM auditoria_seguranca WHERE acao IN ('SUPORTE_CONTEXTO_INICIADO','SUPORTE_CONTEXTO_ENCERRADO')")).rows;
  assert.equal(audit.length,2);
}
