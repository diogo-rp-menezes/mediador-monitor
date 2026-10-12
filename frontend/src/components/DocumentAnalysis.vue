<script setup lang="ts">
import {computed,ref} from 'vue';
import AppDialog from './AppDialog.vue';
import AnalysisValue from './AnalysisValue.vue';
type Field={id:string;rotulo:string;valor:string;clausula?:string;citacao?:string};
type Section={titulo:string;grupos:Array<{titulo:string|null;campos:Field[]}>};
const props=defineProps<{view?:{versao?:string;secoes?:Section[]}|null;analysis:unknown}>();
const selected=ref(0),evidence=ref<Field|null>(null);
const sections=computed(()=>props.view?.secoes??[]),fields=computed(()=>sections.value.flatMap(section=>section.grupos.flatMap(group=>group.campos)));
const present=(field:Field)=>field.valor!=='Não consta na CCT';
</script>
<template><header class="document-panel-heading"><div><h3>Análise do instrumento</h3><p>Leitura assistida. Confira as informações no documento original antes de decidir.</p></div><span v-if="view?.versao" class="status-badge">Template {{ view.versao }}</span></header>
<template v-if="sections.length"><div class="document-summary"><article><small>Cobertura do template</small><strong>{{ fields.filter(present).length }}/{{ fields.length }}</strong><span>Campos identificados</span></article><article><small>Evidências</small><strong>{{ fields.filter(field=>field.clausula||field.citacao).length }}</strong><span>Campos com referência à fonte</span></article></div><div class="analysis-layout"><nav aria-label="Seções da análise"><button v-for="(section,index) in sections" :key="section.titulo" type="button" :aria-current="selected===index?'page':undefined" @click="selected=index">{{ section.titulo }}</button></nav><div><h3>{{ sections[selected]?.titulo }}</h3><section v-for="group in sections[selected]?.grupos" :key="group.titulo||'campos'"><h4 v-if="group.titulo">{{ group.titulo }}</h4><div class="analysis-field-grid"><article v-for="field in group.campos" :key="field.id" :class="{'field-absent':!present(field)}"><small>{{ field.rotulo }}</small><p>{{ field.valor }}</p><button v-if="field.clausula||field.citacao" class="secondary" type="button" @click="evidence=field">Ver evidência</button></article></div></section></div></div></template><p v-else-if="!analysis">Ainda não há análise disponível para este instrumento.</p><AnalysisValue v-else :value="analysis" />
<AppDialog v-if="evidence" title="Evidência no documento original" @close="evidence=null"><h3>{{ evidence.rotulo }}</h3><p>{{ evidence.clausula||'Referência textual' }}</p><blockquote>{{ evidence.citacao||'Citação textual não disponível.' }}</blockquote><p>O documento original permanece a fonte de verdade.</p></AppDialog></template>
