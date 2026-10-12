<script setup lang="ts">
import {computed,onMounted,ref} from 'vue';

type ContextOption={id:number;nome:string;tipo:'escritorio'|'cliente';membro?:boolean};
type Session={csrf:string;usuario:{nome:string;email:string;papel_plataforma?:string|null};contextos:{escritorios:Array<{id:number;nome:string;membro?:boolean}>;clientes:Array<{id:number;razao_social:string;membro?:boolean}>}};
const session=ref<Session|null>(null),context=ref<ContextOption|null>(null),notice=ref(''),failure=ref(''),active=ref('inicio');
const options=computed<ContextOption[]>(()=>session.value?[...session.value.contextos.escritorios.map(item=>({id:item.id,nome:item.nome,tipo:'escritorio' as const,membro:item.membro})),...session.value.contextos.clientes.map(item=>({id:item.id,nome:item.razao_social,tipo:'cliente' as const,membro:item.membro}))]:[]);
const areas=[['inicio','Visão geral'],['cadastros','Cadastros'],['monitoramento','Monitoramento'],['documentos','Documentos'],['envios','Envios'],['gestao','Escritório'],['plataforma','Plataforma']] as const;
async function api<T>(path:string,method='GET',body?:unknown,headers:Record<string,string>={}){const response=await fetch(path,{method,credentials:'same-origin',headers:{'content-type':'application/json',...(method==='GET'?{}:{'x-csrf-token':session.value?.csrf||''}),...headers},body:body===undefined?undefined:JSON.stringify(body)});const payload=await response.json() as T&{erro?:string};if(!response.ok)throw new Error(payload.erro||'Não foi possível concluir a operação.');return payload;}
async function chooseContext(value:string){failure.value='';notice.value='';const option=options.value[Number(value)];if(!option)return;try{const result=await api<{contexto:Record<string,unknown>}>('/api/auth/contexto','POST',{tipo:option.tipo,id:option.id});context.value={...option,...result.contexto} as ContextOption;sessionStorage.setItem('mediador_contexto',JSON.stringify(result.contexto));notice.value=`Contexto alterado para ${option.nome}.`;setTimeout(()=>{notice.value='';},5000);}catch(error){failure.value=(error as Error).message;}}
async function logout(){await api('/api/auth/logout','POST');sessionStorage.removeItem('mediador_contexto');location.assign('/login');}
onMounted(async()=>{try{session.value=await api<Session>('/api/auth/sessao');const saved=sessionStorage.getItem('mediador_contexto');if(saved){const current=JSON.parse(saved) as {tipo:string;escritorio_id?:number;cliente_id?:number};const id=current.escritorio_id||current.cliente_id;context.value=options.value.find(item=>item.tipo===current.tipo&&item.id===id)||null;}}catch{location.assign('/login');}});
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <a class="brand" href="/app/" aria-label="Mediador Monitor">◆ <span>Mediador Monitor</span></a>
      <label class="context-switcher"><span>Seu espaço de trabalho</span><select :value="context ? options.indexOf(context) : ''" @change="chooseContext(($event.target as HTMLSelectElement).value)"><option value="">Selecione</option><option v-for="(option,index) in options" :key="`${option.tipo}-${option.id}`" :value="index">{{ option.tipo==='escritorio'?'Escritório':'Empresa' }} · {{ option.nome }}</option></select></label>
      <div class="header-actions"><span v-if="session" class="avatar" :title="session.usuario.nome">{{ session.usuario.nome.split(' ').map(item=>item[0]).slice(0,2).join('') }}</span><button type="button" class="secondary" @click="logout">Sair</button></div>
    </header>
    <nav class="app-nav" aria-label="Áreas de trabalho"><button v-for="([key,label]) in areas" :key="key" type="button" :aria-current="active===key?'page':undefined" :class="{hidden:key==='plataforma'&&session?.usuario.papel_plataforma!=='administrador_plataforma'}" @click="active=key">{{ label }}</button></nav>
    <section v-if="notice" class="toast" role="status"><span>{{ notice }}</span><button type="button" aria-label="Fechar notificação" @click="notice=''">×</button></section>
    <section v-if="failure" class="alert" role="alert">{{ failure }}</section>
    <section class="workspace-content">
      <div class="page-heading"><div><span class="eyebrow">Fundação Vue</span><h1>{{ areas.find(item=>item[0]===active)?.[1] }}</h1><p v-if="context">Trabalhando em {{ context.nome }}.</p><p v-else>Selecione um escritório ou empresa para começar.</p></div></div>
      <section v-if="active==='inicio'" class="bento-grid"><article class="hero-card"><span class="eyebrow">Área de trabalho</span><h2>Seu dia, em perspectiva.</h2><p>O shell Vue já respeita tema, contexto e permissões do Mediador Monitor.</p></article><article class="metric-card"><span>Próxima migração</span><strong>Cadastros</strong><small>Clientes, contatos e sindicatos.</small></article><article class="metric-card"><span>Dados</span><strong>PostgreSQL</strong><small>APIs existentes permanecem inalteradas.</small></article></section>
      <section v-else class="transition-card"><h2>{{ areas.find(item=>item[0]===active)?.[1] }}</h2><p>Este domínio será migrado para componentes Vue preservando suas APIs, permissões e testes de jornada.</p></section>
    </section>
  </main>
</template>
