<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import AppDialog from './AppDialog.vue';
import AnalysisValue from './AnalysisValue.vue';
import {analysisSections,hasAnalysisValue,type AnalysisField as Field,type AnalysisView} from '../analysis';
const props=defineProps<{view?:AnalysisView|null;analysis:unknown;canManageAnalysis?:boolean}>();
const emit=defineEmits<{platform:[]}>();
const selected=ref(0),evidence=ref<Field|null>(null);
const sections=computed(()=>analysisSections(props.view,props.analysis)),fields=computed(()=>sections.value.flatMap(section=>section.grupos.flatMap(group=>group.campos)));
const present=(field:Field)=>hasAnalysisValue(field.valor);
const hasEvidence=(field:Field)=>!!(field.clausula?.trim()||field.citacao?.trim());
watch(()=>[props.view,props.analysis],()=>{selected.value=0;evidence.value=null;});
</script>
<template>
<header class="document-panel-heading"><div><h3>Análise do instrumento</h3><p>Leitura assistida. Confira as informações no documento original antes de decidir.</p></div><span v-if="view?.versao" class="status-badge">Template {{ view.versao }}</span></header>
<template v-if="sections.length">
  <div class="document-summary"><article><small>Cobertura da análise</small><strong>{{ fields.filter(present).length }}/{{ fields.length }}</strong><span>Campos com valor informado</span></article><article><small>Evidências</small><strong>{{ fields.filter(hasEvidence).length }}</strong><span>Campos com referência à fonte</span></article></div>
  <p class="analysis-help">Campos sem valor na análise não confirmam a ausência de uma regra no documento. Confira o original.</p>
  <div class="analysis-layout">
    <nav aria-label="Seções da análise"><button v-for="(section,index) in sections" :key="index" type="button" :aria-current="selected===index?'page':undefined" @click="selected=index">{{ section.titulo }}</button></nav>
    <div><h3>{{ sections[selected]?.titulo }}</h3><section v-for="(group,index) in sections[selected]?.grupos" :key="index"><h4 v-if="group.titulo">{{ group.titulo }}</h4>
      <div class="analysis-field-grid"><article v-for="field in group.campos" :key="field.id" :class="{'field-absent':!present(field)}">
        <small>{{ field.rotulo }}</small><p v-if="field.acao" class="analysis-action">Ação: {{ field.acao }}</p>
        <p>{{ typeof field.valor==='string'&&field.valor.trim()?field.valor:present(field)?field.valor:'Não informado na análise' }}</p>
        <span v-if="!present(field)" class="status-badge" data-tone="neutral">Sem valor informado</span>
        <button v-if="hasEvidence(field)" class="secondary" type="button" :aria-label="'Ver evidência de '+field.rotulo" @click="evidence=field">Ver evidência</button>
        <small v-else class="analysis-source">Sem referência à fonte na análise.</small>
      </article></div>
    </section></div>
  </div>
</template>
<p v-else-if="!hasAnalysisValue(analysis)">Ainda não há análise disponível para este instrumento.</p>
<template v-else><p class="analysis-help">Análise salva em formato anterior.</p><AnalysisValue :value="analysis" /></template>
<section v-if="sections.length&&view?.observacoes?.length" class="document-related"><h4>Observações da análise</h4><p v-for="(item,index) in view.observacoes" :key="index" class="analysis-observation">{{ item }}</p></section>
<footer class="analysis-management"><p>A análise e a reanálise são administradas na Plataforma por um administrador autorizado.</p><button v-if="canManageAnalysis" type="button" class="secondary" @click="emit('platform')">Abrir Plataforma</button></footer>
<AppDialog v-if="evidence" title="Evidência no documento original" @close="evidence=null"><h3>{{ evidence.rotulo }}</h3><p>{{ evidence.clausula?.trim()?evidence.clausula:'Referência textual' }}</p><blockquote>{{ evidence.citacao?.trim()?evidence.citacao:'Citação textual não disponível.' }}</blockquote><p>O documento original permanece a fonte de verdade.</p></AppDialog>
</template>
<style scoped>
.analysis-help,.analysis-management{font-size:13px;color:var(--muted);line-height:1.6}.analysis-management{border-top:1px solid var(--line);margin-top:24px;padding-top:12px}.analysis-source{display:block;margin-top:12px}.analysis-observation{white-space:pre-wrap;overflow-wrap:anywhere}.analysis-field-grid .status-badge{display:table;margin-bottom:12px}
</style>
