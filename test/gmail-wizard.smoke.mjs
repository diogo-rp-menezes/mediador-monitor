import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { join } from 'node:path';
const root=new URL('..',import.meta.url);
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const server=readFileSync(new URL('../src/server-sqlite-dev.ts',import.meta.url),'utf8');
const settings=readFileSync(new URL('../src/settings.ts',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'Script da interface não encontrado');

function functionText(name){
  const start=script.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' não existe');
  const open=script.indexOf('{',start);
  let depth=0;
  for(let i=open;i<script.length;i++){
    if(script[i]==='{')depth++;
    if(script[i]==='}'&&!--depth)return script.slice(start,i+1);
  }
  throw Error('Função incompleta: '+name);
}
function payload(port){
  const gf={elements:{account:{value:'remetente@gmail.com'},recipient:{value:'rh@example.com'},password:{value:'abcd efgh ijkl mnop'},transport:{value:String(port)}}};
  const context=createContext({GMAIL:{savedSlack:{ativo:true,webhook:'',limparWebhook:false},preset:{host:'smtp.gmail.com',transportes:[{porta:465,secure:true},{porta:587,secure:false}]}},gf});
  new Script(functionText('gmailPayload')).runInContext(context);
  return context.gmailPayload();
}

test('wizard tem três etapas, botões de continuar/voltar, testar e salvar',()=>{
  for(const n of [1,2,3])assert.match(html,new RegExp('data-wstep="'+n+'"'));
  for(const id of ['gmail-account','gmail-recipient','gmail-password','gmail-transport','gmail-next','gmail-back','gmail-test','gmail-save'])
    assert.ok(html.includes('id="'+id+'"'),'Não encontrado: '+id);
});
test('assistente Gmail é acessível em notificações e usa endpoint de preset',()=>{
  assert.match(html,/data-act="gmail-wizard"/);
  assert.match(script,/api\/provedores\/gmail/);
  assert.match(server,/p === '\/api\/provedores\/gmail'/);
  assert.match(server,/host: 'smtp\.gmail\.com'/);
});
test('configuração gera SSL/TLS 465 e normaliza senha sem tocar Slack',()=>{
  const o=payload(465);assert.equal(o.email.port,465);assert.equal(o.email.secure,true);
  assert.equal(o.email.password,'abcdefghijklmnop');assert.equal(o.email.user,'remetente@gmail.com');
  assert.equal(o.email.from,'remetente@gmail.com');assert.equal(o.email.to,'rh@example.com');
  assert.equal(o.email.ativo,true);assert.equal(o.slack.ativo,true);
});
test('configuração gera STARTTLS porta 587',()=>{
  const o=payload(587);assert.equal(o.email.port,587);assert.equal(o.email.secure,false);
});
test('porta fora do preset é rejeitada',()=>assert.throws(()=>payload(25),/Conexão SMTP inválida/));
test('wizard nunca busca senha privada no Google, persiste via endpoint antigo e permite teste',()=>{
  assert.match(script,/send\('PUT','\/api\/notificacoes',gmailPayload\(\)\)/);
  assert.match(script,/send\('POST','\/api\/notificacoes\/testar',\{canal:'email',config:gmailPayload\(\)\}\)/);
  assert.match(settings,/temSenha: !!cfg\.email\.password/);
  assert.doesNotMatch(settings,/vistaNotificacoes[\s\S]*?password: cfg\.email\.password/);
  assert.match(html,/myaccount\.google\.com\/apppasswords/);
});


