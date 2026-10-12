<script setup lang="ts">
import {ref} from 'vue';
const props=defineProps<{user:{nome:string;email:string};role:string;save:(nome:string)=>Promise<void>}>();
const nome=ref(props.user.nome),saving=ref(false),error=ref(''),success=ref('');
async function submit(){
  if(saving.value)return;
  error.value='';success.value='';
  const value=nome.value.trim();
  if(value.length<2||value.length>250){error.value='Informe um nome entre 2 e 250 caracteres.';return;}
  saving.value=true;
  try{await props.save(value);nome.value=props.user.nome;success.value='Nome atualizado.';}
  catch(cause){error.value=(cause as Error).message;}
  finally{saving.value=false;}
}
</script>

<template>
  <section class="document-info-grid account-panel">
    <article>
      <h2>Dados pessoais</h2>
      <form class="vue-form" :aria-busy="saving" @submit.prevent="submit">
        <label>Nome<input v-model="nome" autocomplete="name" required minlength="2" maxlength="250" :disabled="saving"></label>
        <label>E-mail<input :value="user.email" type="email" autocomplete="email" readonly aria-describedby="account-email-help"></label>
        <p id="account-email-help">O e-mail desta conta não pode ser alterado por aqui.</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <p v-if="success" role="status">{{ success }}</p>
        <footer><button type="submit" class="primary" :disabled="saving">{{ saving?'Salvando…':'Salvar nome' }}</button></footer>
      </form>
    </article>
    <article><h2>Acesso e segurança</h2><p>{{ role }}</p><p>Para recuperar ou redefinir sua senha, use a opção de recuperação na tela de acesso. Encerre sua sessão pelo botão Sair no topo.</p></article>
  </section>
</template>

<style scoped>
.account-panel{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);max-width:1000px;align-items:start}
@media(max-width:700px){.account-panel{grid-template-columns:minmax(0,1fr)}}
</style>
