<script setup lang="ts">
import {onBeforeUnmount,ref} from 'vue';
import WorkspaceSidebarContent from './WorkspaceSidebarContent.vue';
defineProps<{active:string;areas:ReadonlyArray<readonly [string,string]>}>();
const emit=defineEmits<{navigate:[key:string]}>();
const media=window.matchMedia('(max-width:820px)');
const isMobile=ref(media.matches),drawer=ref<HTMLDialogElement>(),drawerOpen=ref(false);
let savedCollapsed=false;
try{savedCollapsed=localStorage.getItem('mediador_sidebar_recolhida')==='true';}catch{/* Optional visual preference. */}
const collapsed=ref(savedCollapsed);
let previousOverflow:string|null=null;
function toggle(){collapsed.value=!collapsed.value;try{localStorage.setItem('mediador_sidebar_recolhida',String(collapsed.value));}catch{/* Optional visual preference. */}}
function openMenu(){if(!isMobile.value||!drawer.value||drawer.value.open)return;drawer.value.showModal();drawerOpen.value=true;previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
function restoreScroll(){drawerOpen.value=false;if(previousOverflow!==null){document.body.style.overflow=previousOverflow;previousOverflow=null;}}
function closeMenu(){drawer.value?.close();restoreScroll();}
function navigate(key:string){emit('navigate',key);closeMenu();}
function resize(event:MediaQueryListEvent){closeMenu();isMobile.value=event.matches;}
media.addEventListener('change',resize);
onBeforeUnmount(()=>{media.removeEventListener('change',resize);closeMenu();});
</script>

<template>
  <div class="sidebar-layout" :class="{'sidebar-collapsed':collapsed&&!isMobile}">
    <aside v-if="!isMobile" id="workspace-sidebar" class="workspace-sidebar" aria-label="Navegação principal">
      <WorkspaceSidebarContent :active="active" :areas="areas" :collapsed="collapsed" @toggle="toggle" @navigate="navigate">
        <template #context><slot name="context" :closeMenu="closeMenu" /></template><template #account><slot name="account" /></template>
      </WorkspaceSidebarContent>
    </aside>
    <dialog v-else id="workspace-sidebar" ref="drawer" class="mobile-drawer" aria-label="Menu principal" @close="restoreScroll" @cancel.prevent="closeMenu" @click.self="closeMenu">
      <div class="workspace-sidebar">
        <WorkspaceSidebarContent :active="active" :areas="areas" :collapsed="false" mobile @close="closeMenu" @navigate="navigate">
          <template #context><slot name="context" :closeMenu="closeMenu" /></template><template #account><slot name="account" /></template>
        </WorkspaceSidebarContent>
      </div>
    </dialog>
    <div class="sidebar-main"><slot :openMenu="openMenu" :isMobile="isMobile" :menuOpen="drawerOpen" /></div>
  </div>
</template>
