<script setup lang="ts">
import {ref,onBeforeUnmount} from 'vue';
defineProps<{active:string;areas:ReadonlyArray<readonly [string,string]>}>();
const emit=defineEmits<{navigate:[key:string]}>();
const collapsed=ref(false),mobileOpen=ref(false);
const paths:Record<string,string>={inicio:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',cadastros:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',documentos:'M14 2H6v20h14V8z M14 2v6h6 M8 13h8 M8 17h6',monitoramento:'M3 12h4l3-8 4 16 3-8h4',envios:'M22 2 9 15 M22 2l-7 20-6-7-7-6z',gestao:'M4 7h16 M4 17h16 M9 4v6 M15 14v6',plataforma:'M3 21h18 M5 21V7l7-4 7 4v14'};
function select(key:string){emit('navigate',key);mobileOpen.value=false;}
function close(event:KeyboardEvent){if(event.key==='Escape')mobileOpen.value=false;}
window.addEventListener('keydown',close);onBeforeUnmount(()=>window.removeEventListener('keydown',close));
</script>
<template>
  <div class="sidebar-layout" :class="{'sidebar-collapsed':collapsed}">
    <button v-if="mobileOpen" class="sidebar-scrim" aria-label="Fechar menu" @click="mobileOpen=false"></button>
    <aside id="workspace-sidebar" class="workspace-sidebar" :class="{'mobile-open':mobileOpen}">
      <div class="sidebar-brand"><a href="/app/" aria-label="Mediador Monitor"><span class="brand-symbol">◆</span><span class="sidebar-label">Mediador Monitor</span></a></div>
      <button class="sidebar-toggle" :aria-label="collapsed?'Expandir barra lateral':'Recolher barra lateral'" :aria-expanded="!collapsed" @click="collapsed=!collapsed">{{ collapsed?'»':'«' }}</button>
      <div class="sidebar-context sidebar-label"><slot name="context" /></div>
      <nav class="sidebar-nav" aria-label="Áreas de trabalho"><button v-for="[key,label] in areas" :key="key" type="button" :title="label" :aria-label="label" :aria-current="active===key?'page':undefined" @click="select(key)"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="paths[key]" /></svg><span class="sidebar-label">{{ label }}</span></button></nav>
      <div class="sidebar-footer sidebar-label"><slot name="account" /></div>
    </aside>
    <div class="sidebar-main"><button class="mobile-menu secondary" type="button" :aria-expanded="mobileOpen" aria-controls="workspace-sidebar" aria-label="Abrir menu" @click="mobileOpen=true">☰ Menu</button><slot /></div>
  </div>
</template>
