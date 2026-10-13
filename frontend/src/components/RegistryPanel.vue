<script setup lang="ts">
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import AppDialog from './AppDialog.vue';
import UnionPanel from './UnionPanel.vue';
import ClientEditor from './ClientEditor.vue';
import ClientSheet from './ClientSheet.vue';
const props=defineProps<{contextKey:string;canEdit:boolean;request:<T>(path:string,method?:string,body?:unknown)=>Promise<T>;download:(path:string)=>Promise<{blob:Blob;type:string}>}>();
const emit=defineEmits<{success:[message:string]}>();
type Row={id:number;nome?:string;razao_social?:string;nome_fantasia?:string;cnpj?:string;email?:string;telefone?:string;cargo?:string;uf?:string;municipio?:string;sindicato_nome?:string;ativo:boolean};
const editing=ref(false),editedId=ref<number|null>(null),deleting=ref<Row|null>(null),saving=ref(false),formError=ref('');
const clientEditing=ref(false),clientId=ref<number|null>(null);
const sheetId=ref<number|null>(null),clientDeleting=ref<Row|null>(null);
async function deleteClient(){if(saving.value||!clientDeleting.value||!props.canEdit)return;const current=generation;saving.value=true;formError.value='';try{await props.request('/api/contexto/clientes/'+clientDeleting.value.id,'DELETE');if(current!==generation)return;clientDeleting.value=null;emit('success','Cliente excluído.');await load();}catch(cause){if(current===generation)formError.value=(cause as Error).message;}finally{saving.value=false;}}
function editClient(row?:Row){clientId.value=row?.id??null;clientEditing.value=true;}
async function clientSaved(){clientEditing.value=false;emit('success','Cliente salvo.');await load();}
const contact=ref({nome:'',email:'',telefone:'',cargo:'',ativo:true});
function editContact(row?:Row){editedId.value=row?.id??null;contact.value={nome:row?.nome??'',email:row?.email??'',telefone:row?.telefone??'',cargo:row?.cargo??'',ativo:row?.ativo??true};formError.value='';editing.value=true;}
async function saveContact(){if(saving.value||!props.canEdit)return;const current=generation;saving.value=true;formError.value='';try{await props.request('/api/contexto/contatos'+(editedId.value?'/'+editedId.value:''),editedId.value?'PUT':'POST',contact.value);if(current!==generation)return;editing.value=false;emit('success','Contato salvo.');await load();}catch(cause){if(current===generation)formError.value=(cause as Error).message;}finally{saving.value=false;}}
async function deleteContact(){if(saving.value||!deleting.value||!props.canEdit)return;const current=generation;saving.value=true;formError.value='';try{await props.request('/api/contexto/contatos/'+deleting.value.id,'DELETE');if(current!==generation)return;deleting.value=null;emit('success','Contato excluído.');await load();}catch(cause){if(current===generation)formError.value=(cause as Error).message;}finally{saving.value=false;}}
const areas=[['clientes','Clientes'],['contatos','Contatos'],['monitoramentos','Sindicatos']] as const;
const active=ref('clientes'),query=ref(''),status=ref('todos'),loading=ref(false),error=ref(''),rows=ref<Row[]>([]);let generation=0;
function searchable(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();}
const filtered=computed(()=>rows.value.filter(row=>{
  const term=searchable(query.value);
  const text=[row.nome,row.razao_social,row.nome_fantasia,row.cnpj,row.email,row.telefone,row.cargo,row.municipio,row.uf].filter(Boolean).join(' ');
  const cnpj=term.replace(/[.\/-]/g,'');
  return (status.value==='todos'||String(row.ativo)===status.value)&&(searchable(text).includes(term)||(!!row.cnpj&&!!cnpj&&searchable(row.cnpj).replace(/[.\/-]/g,'').includes(cnpj)));
}));
function clearFilters(){query.value='';status.value='todos';}
async function load(){const current=++generation;rows.value=[];error.value='';if(active.value==='monitoramentos'){loading.value=false;return;}loading.value=true;try{const data=await props.request<Row[]>('/api/contexto/'+active.value);if(current===generation)rows.value=data;}catch(cause){if(current===generation)error.value=(cause as Error).message;}finally{if(current===generation)loading.value=false;}}
watch(()=>[props.contextKey,active.value],()=>{sheetId.value=null;clientDeleting.value=null;clientEditing.value=false;editing.value=false;deleting.value=null;query.value='';status.value='todos';void load();},{immediate:true});
onBeforeUnmount(()=>{generation++;});
</script>
<template>
  <nav class="registry-tabs" aria-label="Tipos de cadastro"><button v-for="[key,label] in areas" :key="key" type="button" :aria-pressed="active===key" @click="active=key">{{ label }}</button></nav>
  <UnionPanel v-if="active==='monitoramentos'" :can-edit="canEdit" :request="request" @success="emit('success',$event)" />
  <template v-else>
  <header class="registry-heading"><div><h2>{{ active==='clientes'?'Clientes do escritório':'Contatos do escritório' }}</h2><p>{{ active==='clientes'?'Consulte empresas, confira a ficha e mantenha os dados cadastrais.':'Consulte as pessoas de contato e seus dados de comunicação.' }}</p></div><button v-if="canEdit" type="button" class="primary" @click="active==='clientes'?editClient():editContact()">{{ active==='clientes'?'Novo cliente':'Novo contato' }}</button></header>
  <ClientEditor v-if="clientEditing" :id="clientId" :request="request" @close="clientEditing=false" @saved="clientSaved" />
  <ClientSheet v-if="sheetId" :id="sheetId" :download="download" :can-edit="canEdit" :request="request" @close="sheetId=null" @edit="clientId=sheetId;sheetId=null;clientEditing=true" />
  <AppDialog v-if="clientDeleting" title="Excluir cliente" :busy="saving" @close="clientDeleting=null"><p>Excluir {{ clientDeleting.razao_social }}? Clientes com vínculos ou histórico devem ser inativados.</p><p v-if="formError" role="alert">{{ formError }}</p><footer><button class="secondary" type="button" autofocus :disabled="saving" @click="clientDeleting=null">Cancelar</button><button class="danger-button" type="button" :disabled="saving" @click="deleteClient">Excluir cliente</button></footer></AppDialog>
  <div class="registry-controls"><label>Buscar cadastro<input v-model="query" type="search" placeholder="Nome, CNPJ, e-mail ou localização"></label><label>Situação<select v-model="status"><option value="todos">Todas</option><option value="true">Ativos</option><option value="false">Inativos</option></select></label><button type="button" class="secondary" :disabled="loading" @click="load">Atualizar lista</button></div>
  <div v-if="!loading&&!error" class="registry-results"><p role="status">{{ filtered.length }} de {{ rows.length }} {{ active==='clientes'?'clientes':'contatos' }}</p><button v-if="query||status!=='todos'" type="button" class="secondary" @click="clearFilters">Limpar filtros</button></div>
  <p v-if="error" role="alert">{{ error }}</p><p v-else-if="loading" role="status">Carregando cadastros…</p>
  <div v-else class="registry-scroll"><table><caption>{{ areas.find(item=>item[0]===active)?.[1] }} deste escritório</caption><thead><tr><th scope="col">{{ active==='clientes'?'Empresa':'Pessoa' }}</th><th scope="col">{{ active==='clientes'?'CNPJ':'E-mail' }}</th><th scope="col">{{ active==='contatos'?'Telefone':'Localização' }}</th><th scope="col">Situação</th><th v-if="canEdit||active==='clientes'" scope="col">Ações</th></tr></thead><tbody><tr v-for="row in filtered" :key="row.id"><td><strong>{{ row.nome_fantasia||row.razao_social||row.nome }}</strong><small v-if="row.nome_fantasia">{{ row.razao_social }}</small><small v-if="active==='contatos'">{{ row.cargo }}</small></td><td>{{ row.cnpj||row.email||'—' }}</td><td>{{ active==='contatos'?row.telefone||'—':[row.municipio,row.uf].filter(Boolean).join(' / ')||'—' }}</td><td><span class="status-badge" :data-tone="row.ativo?'success':'neutral'">{{ row.ativo?'Ativo':'Inativo' }}</span></td><td v-if="canEdit||active==='clientes'" class="contact-row-actions"><button v-if="active==='clientes'" type="button" class="secondary" :aria-label="'Ver ficha de '+row.razao_social" @click="sheetId=row.id">Ver ficha</button><button v-if="active==='clientes'&&canEdit" type="button" class="secondary" :aria-label="'Excluir '+row.razao_social" @click="clientDeleting=row;formError=''">Excluir</button><button v-if="canEdit" type="button" class="secondary" :aria-label="'Editar '+(row.nome||row.razao_social)" @click="active==='clientes'?editClient(row):editContact(row)">Editar</button><button v-if="active==='contatos'" type="button" class="secondary" :aria-label="'Excluir '+row.nome" @click="deleting=row;formError=''">Excluir</button></td></tr><tr v-if="!filtered.length"><td :colspan="canEdit||active==='clientes'?5:4">{{ rows.length?'Nenhum resultado para esta busca.':'Ainda não há cadastros neste escritório.' }}</td></tr></tbody></table></div>
  <AppDialog v-if="editing" :title="editedId?'Editar contato':'Novo contato'" :busy="saving" @close="editing=false"><form class="vue-form" @submit.prevent="saveContact"><label>Nome do contato<input v-model="contact.nome" required minlength="2" maxlength="250" autofocus></label><label>E-mail do contato<input v-model="contact.email" type="email" required maxlength="254"></label><label>Telefone<input v-model="contact.telefone" maxlength="500"></label><label>Cargo<input v-model="contact.cargo" maxlength="500"></label><label>Situação do contato<select v-model="contact.ativo"><option :value="true">Ativo</option><option :value="false">Inativo</option></select></label><p v-if="formError" role="alert">{{ formError }}</p><footer><button type="button" class="secondary" :disabled="saving" @click="editing=false">Cancelar</button><button type="submit" class="primary" :disabled="saving">{{ saving?'Salvando…':'Salvar contato' }}</button></footer></form></AppDialog>
  <AppDialog v-if="deleting" title="Excluir contato" :busy="saving" @close="deleting=null"><p>Excluir {{ deleting.nome }}? Contatos com histórico devem ser inativados para preservar os vínculos.</p><p v-if="formError" role="alert">{{ formError }}</p><footer><button type="button" class="secondary" :disabled="saving" autofocus @click="deleting=null">Cancelar</button><button type="button" class="danger-button" :disabled="saving" @click="deleteContact">Excluir contato</button></footer></AppDialog>
  </template>
</template>

<style scoped>
.registry-heading{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-top:24px}
.registry-heading h2{margin:0 0 8px}.registry-heading p{margin:0;color:var(--muted);font-size:14px}
.registry-heading button{flex-shrink:0}.registry-results{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.registry-results p{margin:0;color:var(--muted);font-size:13px}
@media(max-width:700px){.registry-heading{align-items:stretch;flex-direction:column}}
</style>
