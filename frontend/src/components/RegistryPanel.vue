<script setup lang="ts">
import {computed,ref,watch} from 'vue';
const props=defineProps<{contextKey:string;request:<T>(path:string)=>Promise<T>}>();
type Row={id:number;nome?:string;razao_social?:string;nome_fantasia?:string;cnpj?:string;email?:string;telefone?:string;uf?:string;municipio?:string;sindicato_nome?:string;ativo:boolean};
const areas=[['clientes','Clientes'],['contatos','Contatos'],['monitoramentos','Sindicatos']] as const;
const active=ref('clientes'),query=ref(''),status=ref('todos'),loading=ref(false),error=ref(''),rows=ref<Row[]>([]);let generation=0;
const filtered=computed(()=>rows.value.filter(row=>(status.value==='todos'||String(row.ativo)===status.value)&&Object.values(row).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').includes(query.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR'))));
async function load(){const current=++generation;rows.value=[];error.value='';loading.value=true;try{const data=await props.request<Row[]>('/api/contexto/'+active.value);if(current===generation)rows.value=data;}catch(cause){if(current===generation)error.value=(cause as Error).message;}finally{if(current===generation)loading.value=false;}}
watch(()=>[props.contextKey,active.value],()=>{query.value='';status.value='todos';void load();},{immediate:true});
</script>
<template>
  <nav class="registry-tabs" aria-label="Tipos de cadastro"><button v-for="[key,label] in areas" :key="key" type="button" :aria-pressed="active===key" @click="active=key">{{ label }}</button></nav>
  <div class="registry-controls"><label>Buscar cadastro<input v-model="query" type="search" placeholder="Nome, CNPJ, e-mail ou localização"></label><label>Situação<select v-model="status"><option value="todos">Todas</option><option value="true">Ativos</option><option value="false">Inativos</option></select></label><button type="button" class="secondary" :disabled="loading" @click="load">Atualizar lista</button></div>
  <p v-if="error" role="alert">{{ error }}</p><p v-else-if="loading" role="status">Carregando cadastros…</p>
  <div v-else class="registry-scroll"><table><caption>{{ areas.find(item=>item[0]===active)?.[1] }} deste escritório</caption><thead><tr><th scope="col">{{ active==='clientes'?'Empresa':active==='contatos'?'Pessoa':'Consulta' }}</th><th scope="col">{{ active==='clientes'?'CNPJ':active==='contatos'?'E-mail':'Sindicato' }}</th><th scope="col">{{ active==='contatos'?'Telefone':'Localização' }}</th><th scope="col">Situação</th></tr></thead><tbody><tr v-for="row in filtered" :key="row.id"><td><strong>{{ row.nome_fantasia||row.razao_social||row.nome }}</strong><small v-if="row.nome_fantasia">{{ row.razao_social }}</small></td><td>{{ row.cnpj||row.email||row.sindicato_nome||'—' }}</td><td>{{ active==='contatos'?row.telefone||'—':[row.municipio,row.uf].filter(Boolean).join(' / ')||'—' }}</td><td><span class="status-badge">{{ row.ativo?'Ativo':'Inativo' }}</span></td></tr><tr v-if="!filtered.length"><td colspan="4">{{ rows.length?'Nenhum resultado para esta busca.':'Ainda não há cadastros neste escritório.' }}</td></tr></tbody></table></div>
</template>
