<template>
  <a :href="href" v-bind="$attrs" @click="onClick"><slot /></a>
</template>

<script setup lang="ts">
// Enlace a una página por su slug antiguo. Si la página ya está migrada se
// navega con el router (sin recargar); si no, es un enlace normal a public/.
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { isMigrated, pageHref } from '@/lib/legacy';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  /** Slug de la página ('' = inicio). */
  to: string;
  /** Query string opcional (sin '?'). */
  query?: string;
}>();

const emit = defineEmits<{ navigate: [] }>();

const router = useRouter();
const slug = computed(() => (props.to === 'index' ? '' : props.to));
const href = computed(() => pageHref(slug.value) + (props.query ? `?${props.query}` : ''));

function onClick(e: MouseEvent) {
  emit('navigate');
  const migrated = slug.value === '' ? isMigrated('index') : isMigrated(slug.value);
  // Ctrl/Cmd/Shift/clic central: que el navegador abra la pestaña como siempre.
  if (!migrated || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  void router.push(href.value.replace(/^\/app/, '') || '/');
}
</script>
