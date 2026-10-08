<template>
  <a :href="href" v-bind="$attrs" @click="onClick"><slot /></a>
</template>

<script setup lang="ts">
// Enlace a una página por su slug. Navega con el router (sin recargar); con
// Ctrl/Cmd/Mayús o el botón central el navegador abre la pestaña como siempre.
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { pageHref } from '@/lib/pages';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  /** Slug de la página ('' = inicio). */
  to: string;
  /** Query string opcional (sin '?'). */
  query?: string;
}>();

const emit = defineEmits<{ navigate: [] }>();

const router = useRouter();
const href = computed(() => pageHref(props.to) + (props.query ? `?${props.query}` : ''));

function onClick(e: MouseEvent) {
  emit('navigate');
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  void router.push(href.value);
}
</script>
