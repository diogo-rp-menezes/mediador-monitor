<script setup lang="ts">
import {onBeforeUnmount,onMounted,ref} from 'vue';
import AppDialog from './AppDialog.vue';

type Office={id:number;nome:string;cnpj:string|null;email:string;telefone:string;ativo:boolean;criado_em?:string;atualizado_em?:string};
const props=defineProps<{request:<T>(path:string,method?:string,body?:unknown,signal?:AbortSignal)=>Promise<T>}>();
const emit=defineEmits<{saved:[office:{id:number;nome:string}]}>();
const office=ref<Office|null>(null),loading=ref(false),loaded=ref(false),error=ref(''),updated=ref(''),editing=ref(false),saving=ref(false),saveError=ref('');
const nome=ref(''),email=ref(''),telefone=ref('');
let alive=true;
function fillForm(value:Office){nome.value=value.nome;email.value=value.email;telefone.value=value.telefone;}
function date(value?:string){if(!value)return 'Não informado';const parsed=new Date(value);return Number.isNaN(parsed.getTime())?'Data indisponível':parsed.toLocaleString('pt-BR');}
async function load(){if(loading.value)return;loading.value=true;error.value='';try{const value=await props.request<Office>('/api/contexto/escritorio');if(!alive)return;office.value=value;loaded.value=true;updated.value=new Date().toLocaleTimeString('pt-BR');if(!editing.value)fillForm(value);}catch(cause){if(alive)error.value=(cause as Error).message||'Não foi possível consultar os dados do escritório.';}finally{if(alive)loading.value=false;}}
function openEditor(){if(!office.value)return;fillForm(office.value);saveError.value='';editing.value=true;}
function closeEditor(){if(!saving.value)editing.value=false;}
async function save(){if(!office.value||saving.value)return;saveError.value='';const value={nome:nome.value.trim(),email:email.value.trim().toLowerCase(),telefone:telefone.value.trim()};if(value.nome.length<2||value.nome.length>250){saveError.value='Informe um nome entre 2 e 250 caracteres.';return;}if(value.email&&(!value.email.includes('@')||value.email.length>254)){saveError.value='Informe um e-mail de atendimento válido.';return;}if(value.telefone.length>500){saveError.value='O telefone deve ter no máximo 500 caracteres.';return;}saving.value=true;try{const saved=await props.request<Office>('/api/contexto/escritorio','PUT',value);if(!alive)return;office.value=saved;fillForm(saved);editing.value=false;updated.value=new Date().toLocaleTimeString('pt-BR');emit('saved',{id:saved.id,nome:saved.nome});}catch(cause){if(alive)saveError.value=(cause as Error).message||'Não foi possível salvar os dados do escritório.';}finally{if(alive)saving.value=false;}}
onMounted(()=>{void load();});
onBeforeUnmount(()=>{alive=false;});
</script>

<template>
  <section class="office-panel" aria-label="Dados do escritório">
    <header class="office-heading"><div><span class="eyebrow">Administração contextual</span><h2>Configurações do escritório</h2><p>Atualize os dados usados na identificação, nos cadastros e no atendimento deste escritório.</p></div><button type="button" class="secondary" :disabled="loading||saving" @click="load">Atualizar dados</button></header>
    <p v-if="loading" role="status">Consultando os dados do escritório…</p>
    <div v-if="error" role="alert" class="office-error"><p>{{ error }}</p><p>{{ loaded?'Os dados exibidos são da última consulta bem-sucedida.':'Nenhuma consulta concluída.' }}</p><button type="button" class="secondary" :disabled="loading" @click="load">Tentar novamente</button></div>
    <article v-if="office" class="office-card"><div class="office-card-heading"><div><span class="eyebrow">Escritório atual</span><h3>{{ office.nome }}</h3><p>{{ office.ativo?'Cadastro ativo':'Cadastro inativo' }}</p></div><button type="button" class="primary" :disabled="loading||saving" @click="openEditor">Editar dados do escritório</button></div><dl class="office-details"><div><dt>Nome público</dt><dd>{{ office.nome }}</dd></div><div><dt>CNPJ</dt><dd>{{ office.cnpj||'Não informado' }}</dd></div><div><dt>E-mail de atendimento</dt><dd>{{ office.email||'Não informado' }}</dd></div><div><dt>Telefone de atendimento</dt><dd>{{ office.telefone||'Não informado' }}</dd></div><div><dt>Última atualização</dt><dd>{{ date(office.atualizado_em) }}</dd></div></dl><p v-if="updated" class="office-updated">Última consulta: {{ updated }}.</p></article>
    <AppDialog v-if="editing" title="Dados do escritório" :busy="saving" @close="closeEditor"><form class="vue-form office-form" :aria-busy="saving" @submit.prevent="save"><p>O nome público aparece no seletor de espaços e na identificação desta área.</p><label>Nome público do escritório<input v-model="nome" type="text" autocomplete="organization" minlength="2" maxlength="250" required :disabled="saving"></label><label>E-mail de atendimento<input v-model="email" type="email" autocomplete="email" maxlength="254" :disabled="saving"></label><label>Telefone de atendimento<input v-model="telefone" type="tel" maxlength="500" :disabled="saving"></label><p v-if="saveError" role="alert">{{ saveError }}</p><footer><button type="button" class="secondary" :disabled="saving" @click="closeEditor">Cancelar</button><button type="submit" class="primary" :disabled="saving">{{ saving?'Salvando…':'Salvar dados do escritório' }}</button></footer></form></AppDialog>
  </section>
</template>

<style scoped>
.office-heading,.office-card-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.office-heading h2,.office-card-heading h3{margin:4px 0 8px}.office-heading p,.office-card-heading p,.office-updated{margin:0;color:var(--muted)}.office-card{max-width:1000px;margin-top:24px;padding:24px;border:1px solid var(--line);border-radius:var(--radius-card);background:var(--surface)}.office-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:24px 0 0}.office-details div{min-width:0;padding:14px;border:1px solid var(--line);border-radius:var(--radius-control);background:var(--surface-muted)}.office-details dt{font-size:.85rem;color:var(--muted)}.office-details dd{margin:6px 0 0;overflow-wrap:anywhere}.office-error{margin-top:20px;padding:12px;border-radius:var(--radius-control);background:color-mix(in srgb,var(--danger) 12%,transparent)}.office-error p{margin:0 0 8px}.office-form{min-width:min(100%,560px)}.office-form footer{display:flex;justify-content:flex-end;gap:12px;margin-top:16px}@media(max-width:560px){.office-card{padding:16px}.office-details{grid-template-columns:1fr}.office-card-heading button{width:100%}}
</style>
