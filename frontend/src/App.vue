<script setup lang="ts">
import {computed,onMounted,ref} from 'vue';
import RegistryPanel from './components/RegistryPanel.vue';
import WorkspaceSidebar from './components/WorkspaceSidebar.vue';
import DocumentsPanel from './components/DocumentsPanel.vue';
import {createApiTransport} from './services/api';

type ContextOption={id:number;nome:string;tipo:'escritorio'|'cliente';membro?:boolean};
type Session={csrf:string;usuario:{nome:string;email:string;papel_plataforma?:string|null};contextos:{escritorios:Array<{id:number;nome:string;membro?:boolean}>;clientes:Array<{id:number;razao_social:string;membro?:boolean}>}};
const session=ref<Session|null>(null),context=ref<ContextOption|null>(null),notice=ref(''),failure=ref(''),active=ref('inicio');
const options=computed<ContextOption[]>(()=>session.value?[...session.value.contextos.escritorios.map(item=>({id:item.id,nome:item.nome,tipo:'escritorio' as const,membro:item.membro})),...session.value.contextos.clientes.map(item=>({id:item.id,nome:item.razao_social,tipo:'cliente' as const,membro:item.membro}))]:[]);
const areas=[['inicio','Visão geral'],['cadastros','Cadastros'],['monitoramento','Monitoramento'],['documentos','Documentos'],['envios','Envios'],['gestao','Escritório'],['plataforma','Plataforma']] as const;
type ResolvedContext={tipo:'escritorio'|'cliente';escritorio_id:number;cliente_id:number|null;papel:string;concessao?:string};
const resolved=ref<ResolvedContext|null>(null),switching=ref(false);
let noticeTimer:ReturnType<typeof setTimeout>;
function notify(message:string){clearTimeout(noticeTimer);notice.value=message;noticeTimer=setTimeout(()=>{notice.value='';},5000);}
const visibleAreas=computed(()=>areas.filter(([key])=>key!=='plataforma'||session.value?.usuario.papel_plataforma==='administrador_plataforma'));
const selectedValue=computed(()=>context.value?String(options.value.findIndex(item=>item.tipo===context.value?.tipo&&item.id===context.value?.id)):'');
const theme=ref(localStorage.getItem('mediador_tema')==='light'?'light':'dark');
function toggleTheme(){theme.value=theme.value==='dark'?'light':'dark';document.documentElement.dataset.theme=theme.value;localStorage.setItem('mediador_tema',theme.value);}
document.documentElement.dataset.theme=theme.value;
function contextHeaders(current:ResolvedContext):Record<string,string>{return {'x-context-type':current.tipo,'x-context-id':String(current.tipo==='cliente'?current.cliente_id:current.escritorio_id),...(current.concessao?{'x-support-grant':current.concessao}:{})};}
async function contextRequest<T>(path:string,method='GET',body?:unknown){if(!resolved.value)throw new Error('Selecione um escritório.');return api<T>(path,method,body,contextHeaders(resolved.value));}
const transport=createApiTransport({csrf:()=>session.value?.csrf||'',unauthorized:()=>{sessionStorage.removeItem('mediador_contexto');location.assign('/login');}});
async function api<T>(path:string,method='GET',body?:unknown,headers:Record<string,string>={}){return transport.json<T>(path,method,body,headers);}
async function contextDownload(path:string){const current=resolved.value;if(!current)throw new Error('Selecione um escritório.');const file=await transport.file(path,contextHeaders(current));if(resolved.value!==current)throw new Error('O contexto mudou. Abra o documento novamente.');return file;}
async function chooseContext(value:string){if(switching.value)return;failure.value='';notice.value='';const option=value===''?null:options.value[Number(value)],previous=resolved.value;context.value=null;resolved.value=null;sessionStorage.removeItem('mediador_contexto');if(!option)return;switching.value=true;try{if(previous?.concessao)await api('/api/auth/suporte/encerrar','POST',{concessao:previous.concessao});const support=option.tipo==='escritorio'&&!option.membro;const result=await api<{contexto:ResolvedContext}>(support?'/api/auth/suporte/iniciar':'/api/auth/contexto','POST',support?{escritorio_id:option.id,justificativa:'Troca de escritório pela área de trabalho'}:{tipo:option.tipo,id:option.id});resolved.value=result.contexto;context.value=option;sessionStorage.setItem('mediador_contexto',JSON.stringify(result.contexto));notice.value=`Contexto alterado para ${option.nome}.`;setTimeout(()=>{notice.value='';},5000);}catch(error){failure.value=(error as Error).message;}finally{switching.value=false;}}
async function logout(){await api('/api/auth/logout','POST');sessionStorage.removeItem('mediador_contexto');location.assign('/login');}
onMounted(async()=>{try{session.value=await api<Session>('/api/auth/sessao');}catch{location.assign('/login');return;}try{const saved=sessionStorage.getItem('mediador_contexto');if(saved){const current=JSON.parse(saved) as ResolvedContext;const result=await api<{contexto:ResolvedContext}>('/api/auth/contexto','GET',undefined,contextHeaders(current));resolved.value=result.contexto;const id=current.tipo==='cliente'?current.cliente_id:current.escritorio_id;context.value=options.value.find(item=>item.tipo===current.tipo&&item.id===id)||null;}}catch{resolved.value=null;context.value=null;sessionStorage.removeItem('mediador_contexto');}});
</script>

<template>
  <WorkspaceSidebar :active="active" :areas="visibleAreas" @navigate="active=$event">
    <template #context>
      <label class="context-switcher"><span>Seu espaço de trabalho</span><select :value="selectedValue" :disabled="switching" @change="chooseContext(($event.target as HTMLSelectElement).value)"><option value="">Selecione</option><option v-for="(option,index) in options" :key="`${option.tipo}-${option.id}`" :value="index">{{ option.tipo==='escritorio'?'Escritório':'Empresa' }} · {{ option.nome }}</option></select></label>
    </template>
    <template #account><span v-if="session">{{ session.usuario.nome }}</span><button type="button" class="secondary" @click="logout">Sair</button></template>
    <main class="app-shell">
    <header class="sidebar-topbar"><span>{{ context?.nome||'Área de trabalho' }}</span><div class="header-actions"><button type="button" class="secondary" aria-label="Alternar tema" @click="toggleTheme">◐</button></div></header>
    <section v-if="notice" class="toast" role="status"><span>{{ notice }}</span><button type="button" aria-label="Fechar notificação" @click="notice=''">×</button></section>
    <section v-if="failure" class="alert" role="alert">{{ failure }}</section>
    <section class="workspace-content">
      <div class="page-heading"><div><span class="eyebrow">Área de trabalho</span><h1>{{ areas.find(item=>item[0]===active)?.[1] }}</h1><p v-if="context">Trabalhando em {{ context.nome }}.</p><p v-else>Selecione um escritório ou empresa para começar.</p></div></div>
      <section v-if="active==='inicio'" class="bento-grid"><article class="hero-card"><span class="eyebrow">Seu escritório</span><h2>Seu dia, em perspectiva.</h2><p>Organize clientes, acompanhe instrumentos e confira as próximas decisões do escritório.</p></article><article class="metric-card"><span>Organização</span><strong>Cadastros</strong><small>Clientes, contatos e sindicatos.</small></article><article class="metric-card"><span>Consulta e conferência</span><strong>Documentos</strong><small>Instrumentos, análises e evidências.</small></article></section>
      <RegistryPanel v-else-if="active==='cadastros'&&resolved?.tipo==='escritorio'" :key="resolved.escritorio_id" :context-key="String(resolved.escritorio_id)" :can-edit="['administrador','operador'].includes(resolved.papel)" :request="contextRequest" @success="notify" />
      <DocumentsPanel v-else-if="active==='documentos'&&resolved?.tipo==='escritorio'" :key="resolved.escritorio_id" :request="contextRequest" :download="contextDownload" />
      <section v-else-if="active==='documentos'" class="transition-card"><h2>Documentos e revisões</h2><a class="secondary" href="/#documentos">Abrir Documentos na área operacional</a></section>
      <section v-else class="transition-card"><h2>{{ areas.find(item=>item[0]===active)?.[1] }}</h2><p>Este domínio será migrado para componentes Vue preservando suas APIs, permissões e testes de jornada.</p></section>
    </section>
  </main>
  </WorkspaceSidebar>
</template>
