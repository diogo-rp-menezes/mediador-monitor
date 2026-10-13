<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref,watchEffect} from 'vue';
import MonitoringPanel from './components/MonitoringPanel.vue';
import RegistryPanel from './components/RegistryPanel.vue';
import WorkspaceSidebar from './components/WorkspaceSidebar.vue';
import DocumentsPanel from './components/DocumentsPanel.vue';
import PendingPanel from './components/PendingPanel.vue';
import ClientPortal from './components/ClientPortal.vue';
import AccountPanel from './components/AccountPanel.vue';
import DeliveriesPanel from './components/DeliveriesPanel.vue';
import {pending} from './pending';
import {createApiTransport} from './services/api';

type ContextOption={id:number;nome:string;tipo:'escritorio'|'cliente';membro?:boolean};
type Session={csrf:string;usuario:{nome:string;email:string;papel_plataforma?:string|null};contextos:{escritorios:Array<{id:number;nome:string;membro?:boolean}>;clientes:Array<{id:number;razao_social:string;membro?:boolean}>}};
const session=ref<Session|null>(null),context=ref<ContextOption|null>(null),notice=ref(''),failure=ref(''),active=ref('inicio');
const options=computed<ContextOption[]>(()=>session.value?[...session.value.contextos.escritorios.map(item=>({id:item.id,nome:item.nome,tipo:'escritorio' as const,membro:item.membro})),...session.value.contextos.clientes.map(item=>({id:item.id,nome:item.razao_social,tipo:'cliente' as const,membro:item.membro}))]:[]);
const areas=[['inicio','Visão geral'],['cadastros','Cadastros'],['monitoramento','Monitoramento'],['documentos','Documentos'],['envios','Envios'],['gestao','Escritório'],['plataforma','Plataforma'],['perfil','Minha conta']] as const;
type ResolvedContext={tipo:'escritorio'|'cliente';escritorio_id:number;cliente_id:number|null;papel:string;concessao?:string};
const resolved=ref<ResolvedContext|null>(null),switching=ref(false),booting=ref(true),loggingOut=ref(false);
const contextSelect=ref<HTMLSelectElement>();
let noticeTimer:ReturnType<typeof setTimeout>;
function notify(message:string){clearTimeout(noticeTimer);notice.value=message;noticeTimer=setTimeout(()=>{notice.value='';},5000);}
const visibleAreas=computed(()=>areas.filter(([key])=>{
  if(key==='inicio'||key==='perfil')return true;
  if(key==='plataforma')return session.value?.usuario.papel_plataforma==='administrador_plataforma'&&resolved.value?.tipo!=='cliente';
  if(!resolved.value)return false;
  if(resolved.value.tipo==='cliente')return key==='documentos';
  if(key==='gestao')return resolved.value.papel==='administrador';
  return true;
}));
// The URL selects an area only; permissions and context always come from the server.
const requestedArea=ref(location.hash.startsWith('#/')?location.hash.slice(2):'');
function syncArea(){
  if(switching.value||booting.value)return;
  const area=visibleAreas.value.some(([key])=>key===requestedArea.value)?requestedArea.value:'inicio';
  active.value=area;
  if(location.hash!==`#/${area}`)history.replaceState(null,'',`${location.pathname}${location.search}#/${area}`);
  requestedArea.value=area;
}
function readArea(){requestedArea.value=location.hash.startsWith('#/')?location.hash.slice(2):'';syncArea();}
function navigate(area:string){
  if(switching.value||booting.value||!visibleAreas.value.some(([key])=>key===area))return;
  if(location.hash!==`#/${area}`)history.pushState(null,'',`${location.pathname}${location.search}#/${area}`);
  requestedArea.value=area;syncArea();
}
window.addEventListener('hashchange',readArea);
window.addEventListener('popstate',readArea);
watchEffect(syncArea);
const roleLabel=computed(()=>({administrador:'Administrador',operador:'Operador',suporte:'Suporte · somente leitura',cliente:'Representante da empresa'}[resolved.value?.papel||'']||''));
const globalRoleLabel=computed(()=>session.value?.usuario.papel_plataforma==='administrador_plataforma'?'Administrador da plataforma':session.value?.usuario.papel_plataforma==='suporte'?'Suporte':'Conta autenticada');
const initials=computed(()=>session.value?.usuario.nome.trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toLocaleUpperCase('pt-BR')||'');
const selectedValue=computed(()=>context.value?String(options.value.findIndex(item=>item.tipo===context.value?.tipo&&item.id===context.value?.id)):'');
const theme=ref(document.documentElement.dataset.theme==='dark'?'dark':'light');
function toggleTheme(){theme.value=theme.value==='dark'?'light':'dark';document.documentElement.dataset.theme=theme.value;try{localStorage.setItem('mediador_tema',theme.value);}catch{/* Theme remains usable without storage. */}}
document.documentElement.dataset.theme=theme.value;
function contextHeaders(current:ResolvedContext):Record<string,string>{return {'x-context-type':current.tipo,'x-context-id':String(current.tipo==='cliente'?current.cliente_id:current.escritorio_id),...(current.concessao?{'x-support-grant':current.concessao}:{})};}
async function contextRequest<T>(path:string,method='GET',body?:unknown,signal?:AbortSignal){const current=resolved.value;if(!current||switching.value)throw new Error('Selecione um escritório.');const result=await transport.json<T>(path,method,body,contextHeaders(current),signal);if(resolved.value!==current)throw new Error('O contexto mudou. Atualize a tela para continuar.');return result;}
const transport=createApiTransport({csrf:()=>session.value?.csrf||'',unauthorized:()=>{sessionStorage.removeItem('mediador_contexto');location.assign('/login');}});
async function api<T>(path:string,method='GET',body?:unknown,headers:Record<string,string>={}){return transport.json<T>(path,method,body,headers);}
async function saveProfile(nome:string){session.value=await api<Session>('/api/auth/perfil','PUT',{nome});}
async function contextDownload(path:string){const current=resolved.value;if(!current)throw new Error('Selecione um escritório.');const file=await transport.file(path,contextHeaders(current));if(resolved.value!==current)throw new Error('O contexto mudou. Abra o documento novamente.');return file;}
async function chooseContext(value:string){
  if(switching.value||booting.value||loggingOut.value)return;
  const option=value===''?null:options.value[Number(value)],previous=resolved.value;
  if(value!==''&&!option)return;
  failure.value='';notice.value='';switching.value=true;
  try{
    // Keep the previous grant available for retry if the server cannot end it.
    if(previous?.concessao)await api('/api/auth/suporte/encerrar','POST',{concessao:previous.concessao});
    context.value=null;resolved.value=null;sessionStorage.removeItem('mediador_contexto');
    if(!option){notify(previous?.concessao?'Acesso de suporte encerrado.':'Espaço de trabalho desmarcado.');return;}
    const support=option.tipo==='escritorio'&&!option.membro;
    const result=await api<{contexto:ResolvedContext}>(support?'/api/auth/suporte/iniciar':'/api/auth/contexto','POST',support?{escritorio_id:option.id,justificativa:'Troca de escritório pela área de trabalho'}:{tipo:option.tipo,id:option.id});
    resolved.value=result.contexto;context.value=option;
    sessionStorage.setItem('mediador_contexto',JSON.stringify(result.contexto));notify(`Contexto alterado para ${option.nome}.`);
  }catch(error){failure.value=(error as Error).message;}
  finally{switching.value=false;}
}
async function logout(){if(loggingOut.value||switching.value)return;loggingOut.value=true;failure.value='';try{await api('/api/auth/logout','POST');sessionStorage.removeItem('mediador_contexto');location.assign('/login');}catch(error){failure.value=(error as Error).message;loggingOut.value=false;}}
onMounted(async()=>{
  try{
    session.value=await api<Session>('/api/auth/sessao');
    const saved=sessionStorage.getItem('mediador_contexto');
    if(saved){const current=JSON.parse(saved) as ResolvedContext;const result=await api<{contexto:ResolvedContext}>('/api/auth/contexto','GET',undefined,contextHeaders(current));const id=current.tipo==='cliente'?current.cliente_id:current.escritorio_id;const option=options.value.find(item=>item.tipo===current.tipo&&item.id===id);if(option){resolved.value=result.contexto;context.value=option;}else sessionStorage.removeItem('mediador_contexto');}
  }catch{resolved.value=null;context.value=null;sessionStorage.removeItem('mediador_contexto');if(!session.value)location.assign('/login');}
  finally{booting.value=false;}
});
onBeforeUnmount(()=>{clearTimeout(noticeTimer);window.removeEventListener('hashchange',readArea);window.removeEventListener('popstate',readArea);});
</script>

<template>
  <WorkspaceSidebar :active="active" :areas="visibleAreas" @navigate="navigate">
    <template #context="{closeMenu}">
      <span class="sidebar-section-label">{{ context?.tipo==='cliente'?'Empresa selecionada':'Escritório selecionado' }}</span><strong class="sidebar-context-name">{{ context?.nome||'Nenhum selecionado' }}</strong><small v-if="roleLabel">{{ roleLabel }}</small><button type="button" class="context-shortcut" @click="closeMenu();contextSelect?.focus()">Trocar espaço de trabalho</button>
    </template>
    <template #account><div v-if="session" class="sidebar-account"><span class="account-avatar" aria-hidden="true">{{ initials }}</span><div><strong>{{ session.usuario.nome }}</strong><small>{{ globalRoleLabel }}</small></div></div></template>
    <template #default="{openMenu,isMobile,menuOpen}">
    <main class="app-shell">
    <header class="sidebar-topbar">
      <button v-if="isMobile" type="button" class="secondary mobile-menu" :aria-expanded="menuOpen" aria-controls="workspace-sidebar" aria-label="Abrir menu" @click="openMenu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16 M4 12h16 M4 18h16" /></svg></button>
      <label class="context-switcher"><span>Seu espaço de trabalho</span><select ref="contextSelect" :value="selectedValue" :disabled="booting||switching||loggingOut" @change="chooseContext(($event.target as HTMLSelectElement).value)"><option value="">{{ booting?'Carregando espaços…':'Selecione' }}</option><option v-for="(option,index) in options" :key="`${option.tipo}-${option.id}`" :value="index">{{ option.tipo==='escritorio'?'Escritório':'Empresa' }} · {{ option.nome }}</option></select></label>
      <div class="header-actions"><div v-if="session" class="topbar-account" :title="session.usuario.email"><span class="account-avatar" aria-hidden="true">{{ initials }}</span><div class="topbar-account-text"><strong>{{ session.usuario.nome }}</strong><small>{{ session.usuario.email }}</small></div></div><button type="button" class="secondary icon-button" :aria-label="theme==='dark'?'Ativar tema claro':'Ativar tema escuro'" @click="toggleTheme">◐</button><button type="button" class="secondary logout-button" :disabled="loggingOut||switching" :aria-busy="loggingOut||undefined" @click="logout">{{ loggingOut?'Saindo…':'Sair' }}</button></div>
    </header>
    <div v-if="resolved&&!switching" class="context-status"><span class="status-badge" :data-tone="resolved.concessao?'warning':'neutral'">{{ resolved.concessao?'Acesso de suporte':context?.tipo==='cliente'?'Portal da empresa':'Área do escritório' }}</span><span>{{ roleLabel }}</span><button v-if="resolved.concessao" type="button" class="context-shortcut" @click="chooseContext('')">Encerrar acesso de suporte</button></div>
    <section v-if="notice" class="toast" role="status"><span>{{ notice }}</span><button type="button" aria-label="Fechar notificação" @click="notice=''">×</button></section>
    <section v-if="failure" class="alert" role="alert">{{ failure }}</section>
    <section v-if="booting||switching" class="workspace-content" role="status" aria-live="polite">{{ booting?'Carregando sua sessão…':'Alterando espaço de trabalho…' }}</section>
    <section v-else class="workspace-content">
      <div class="page-heading"><div><span class="eyebrow">Área de trabalho</span><h1>{{ areas.find(item=>item[0]===active)?.[1] }}</h1><p v-if="active==='perfil'">Atualize seus dados pessoais e confira as informações de acesso.</p><p v-else-if="context">Trabalhando em {{ context.nome }}.</p><p v-else>Selecione um escritório ou empresa para começar.</p></div></div>
      <section v-if="active==='inicio'" class="bento-grid"><article class="hero-card"><span class="eyebrow">Seu escritório</span><h2>Seu dia, em perspectiva.</h2><p>Organize clientes, acompanhe instrumentos e confira as próximas decisões do escritório.</p></article><article class="metric-card"><span>Organização</span><strong>Cadastros</strong><small>Clientes, contatos e sindicatos.</small></article><article class="metric-card"><span>Consulta e conferência</span><strong>Documentos</strong><small>Instrumentos, análises e evidências.</small></article></section>
      <RegistryPanel v-else-if="active==='cadastros'&&resolved?.tipo==='escritorio'" :key="resolved.escritorio_id" :download="contextDownload" :context-key="String(resolved.escritorio_id)" :can-edit="['administrador','operador'].includes(resolved.papel)" :request="contextRequest" @success="notify" />
      <MonitoringPanel :can-manage="resolved?.papel==='administrador'" v-else-if="active==='monitoramento'&&resolved?.tipo==='escritorio'" :key="resolved.escritorio_id" :can-edit="['administrador','operador'].includes(resolved.papel)" :request="contextRequest" />
      <DeliveriesPanel v-else-if="active==='envios'&&resolved?.tipo==='escritorio'" :key="resolved.escritorio_id" :request="contextRequest" :download="contextDownload" :can-manage="resolved.papel==='administrador'" />
      <DocumentsPanel v-else-if="active==='documentos'&&resolved?.tipo==='escritorio'" :key="resolved.escritorio_id" :can-edit="['administrador','operador'].includes(resolved.papel)" :can-publish="resolved.papel==='administrador'" :can-manage-analysis="session?.usuario.papel_plataforma==='administrador_plataforma'" @platform="navigate('plataforma')" :request="contextRequest" :download="contextDownload" @success="notify" />
      <ClientPortal v-else-if="active==='documentos'&&resolved?.tipo==='cliente'" :key="'cliente-'+resolved.cliente_id" :request="contextRequest" :download="contextDownload" @success="notify" />
      <AccountPanel v-else-if="active==='perfil'&&session" :user="session.usuario" :role="globalRoleLabel" :save="saveProfile" />
      <PendingPanel v-else-if="pending[active]" :title="areas.find(item=>item[0]===active)?.[1]||''" :items="pending[active]" />
      <section v-else class="transition-card"><h2>Selecione um espaço de trabalho</h2><p>Escolha um escritório ou empresa no seletor do topo para acessar os dados autorizados.</p></section>
    </section>
  </main>
    </template>
  </WorkspaceSidebar>
</template>
