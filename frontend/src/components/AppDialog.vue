<script setup lang="ts">
import {onMounted,onBeforeUnmount,ref} from 'vue';
defineProps<{title:string;busy?:boolean}>();
const emit=defineEmits<{close:[]}>();
const dialog=ref<HTMLDialogElement>();
onMounted(()=>dialog.value?.showModal());
onBeforeUnmount(()=>dialog.value?.close());
</script>
<template><Teleport to="body"><dialog ref="dialog" class="vue-dialog" :aria-label="title" @cancel.prevent="!busy&&emit('close')"><header><h2>{{ title }}</h2><button type="button" class="secondary" :disabled="busy" aria-label="Fechar modal" @click="emit('close')">Fechar</button></header><slot /></dialog></Teleport></template>
