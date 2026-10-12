<script setup lang="ts">
defineProps<{value:unknown;label?:string}>();
const labels:Record<string,string>={campos:'Campos extraídos',topicos:'Tópicos',observacoes:'Observações',alteracoes:'Alterações',clausula:'Cláusula',citacao:'Trecho do documento',valor:'Valor',resumo:'Resumo',acao:'Ação',campo:'Campo',padrao:'Extração estruturada',itens:'Itens',titulo:'Título',piso:'Piso salarial'};
const title=(key:string)=>labels[key]||key.replace(/^s\d+_/,'').replaceAll('_',' ');
</script>
<template><section v-if="value!==null&&value!==undefined" class="analysis-legacy-group"><h4 v-if="label">{{ label }}</h4><div v-if="typeof value==='object'" class="analysis-legacy-grid"><AnalysisValue v-for="(item,key) in (value as Record<string,unknown>)" :key="key" :value="item" :label="Array.isArray(value)?'Item '+(Number(key)+1):title(String(key))" /></div><p v-else>{{ String(value) }}</p></section></template>
