<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Documentación</div>
    <div style="width:40px;"></div>
  </header>
  <div class="doc-container">
    <div class="doc-hero">
      <h1>Documentación</h1>
      <p>Aprende a utilizar cada módulo del sistema Mirai AI.</p>
    </div>
    <div class="doc-search courses-search" style="margin:0 auto 1.5rem;max-width:480px;">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
      <input v-model="search" type="text" placeholder="Buscar módulo..." autocomplete="off">
    </div>
    <div class="doc-grid">
      <div v-for="m in filtered" :key="m.href" class="doc-card" :class="{ open: openCards.has(m.href) }">
        <div class="doc-card-header" @click="onCard(m)">
          <ModuleIcon :icon="m.icon" class-name="doc-card-icon" />
          <div class="doc-card-info">
            <div class="doc-card-title">{{ m.title }}</div>
            <div class="doc-card-desc">{{ m.desc }}</div>
          </div>
          <span v-if="m.subs.length" class="doc-card-arrow">›</span>
        </div>
        <div v-if="m.subs.length" class="doc-card-subs">
          <div class="doc-sub-list">
            <div v-for="sub in m.subs" :key="sub.key" class="doc-sub-item" @click.stop="openTopic(sub.key)">
              <span class="doc-sub-dot"></span>{{ sub.name }}
            </div>
          </div>
        </div>
      </div>
      <p v-if="!filtered.length" style="text-align:center;color:var(--text-secondary);grid-column:1/-1;padding:2rem;">No se encontraron módulos.</p>
    </div>
  </div>
  <!-- Info Modal -->
  <div class="doc-modal-overlay" :class="{ open: !!modal }" @click.self="modal = null">
    <div class="doc-modal">
      <div class="doc-modal-header">
        <h2>
          <template v-if="modal?.module">
            <ModuleIcon :icon="modal.module.icon" class-name="doc-modal-icon" />
            <span>{{ modal.module.title }}</span>
          </template>
          <template v-else>{{ modal?.title }}</template>
        </h2>
        <button class="doc-modal-close" @click="modal = null">✕</button>
      </div>
      <!-- HTML fijo de lib/docs-content.ts (no viene del usuario). -->
      <div v-if="modal" class="doc-modal-body" v-html="modal.body"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Migración de public/documentation.html.
import { computed, h, onBeforeUnmount, onMounted, reactive, ref, type FunctionalComponent } from 'vue';
import MenuToggle from '@/components/MenuToggle.vue';
import { DOC_MODULES, DOC_TOPICS, type DocModule } from '@/lib/docs-content';
import { pageHref } from '@/lib/legacy';

// Módulos con PNG en /icons/ui; los demás guardan un emoji en `icon`.
const MODULE_ICONS = new Set(['apa', 'attendance', 'chat', 'classroom', 'courses', 'diet', 'docs', 'format', 'generation',
  'home', 'inventory', 'investigation', 'location', 'panel', 'photos', 'plans', 'projects', 'reports', 'sales', 'tasks']);

const ModuleIcon: FunctionalComponent<{ icon: string; className: string }> = ({ icon, className }) => {
  if (!MODULE_ICONS.has(icon)) return h('span', { class: className }, icon);
  const base = `/icons/ui/${icon}`;
  return h('img', {
    class: className, src: `${base}-48.png`, srcset: `${base}-48.png 1x, ${base}-96.png 2x`,
    alt: '', width: 28, height: 28, loading: 'lazy', decoding: 'async',
  });
};

interface Modal {
  module?: DocModule;
  title?: string;
  body: string;
}

const search = ref('');
const openCards = reactive(new Set<string>());
const modal = ref<Modal | null>(null);

const filtered = computed(() => {
  const q = search.value.toLowerCase();
  if (!q) return DOC_MODULES;
  return DOC_MODULES.filter((m) => m.title.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q));
});

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Los textos enlazan a otras páginas por su slug ("purchase"); dentro de /app/
// un enlace relativo apuntaría a /app/purchase aunque no esté migrada.
const withPageLinks = (html: string) => html.replace(/href="([a-z_-]+)"/g, (_m, slug: string) => `href="${pageHref(slug)}"`);

function onCard(m: DocModule) {
  if (m.subs.length) {
    if (openCards.has(m.href)) openCards.delete(m.href);
    else openCards.add(m.href);
    return;
  }
  // Módulo sin apartados: ficha con descripción y enlace.
  const link = `<a href="${pageHref(m.href)}" style="color:var(--accent-color);font-weight:600;">${esc(m.href)}</a>`;
  modal.value = { module: m, body: `<p>${esc(m.desc)}</p><div class="doc-tip">Accede a este módulo desde ${link}</div>` };
}

function openTopic(key: string) {
  const topic = DOC_TOPICS[key];
  if (topic) modal.value = { title: topic.title, body: withPageLinks(topic.body) };
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') modal.value = null;
}
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
:where(body[data-page="documentation"]) .doc-container { max-width: 1200px; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }
:where(body[data-page="documentation"]) .doc-hero { text-align: center; padding: 1.5rem 1rem 1rem; }
:where(body[data-page="documentation"]) .doc-hero h1 { font-size: clamp(1.6rem, 4vw, 2.4rem); font-weight: 700; background: var(--accent-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
:where(body[data-page="documentation"]) .doc-hero p { color: var(--text-secondary); font-size: 0.92rem; margin-top: .3rem; }
:where(body[data-page="documentation"]) .doc-search { max-width: 480px; margin: 1rem auto 1.5rem; }
:where(body[data-page="documentation"]) .doc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
:where(body[data-page="documentation"]) .doc-card { background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 16px; overflow: hidden; transition: transform .2s, box-shadow .2s; }
:where(body[data-page="documentation"]) .doc-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px var(--accent-glow); }
:where(body[data-page="documentation"]) .doc-card-header { display: flex; align-items: center; gap: .6rem; padding: 1rem 1.1rem; cursor: pointer; }
:where(body[data-page="documentation"]) .doc-card-icon { font-size: 1.6rem; flex-shrink: 0; }
:where(body[data-page="documentation"]) img.doc-card-icon, :where(body[data-page="documentation"]) img.doc-modal-icon { width: 28px; height: 28px; object-fit: contain; display: block; flex-shrink: 0; filter: drop-shadow(0 1px 2px rgba(0,0,0,.18)); }
:where(body[data-page="documentation"]) .doc-card-info { flex: 1; min-width: 0; }
:where(body[data-page="documentation"]) .doc-card-title { font-size: .95rem; font-weight: 700; color: var(--text-primary); }
:where(body[data-page="documentation"]) .doc-card-desc { font-size: .75rem; color: var(--text-secondary); margin-top: 2px; }
:where(body[data-page="documentation"]) .doc-card-arrow { font-size: .85rem; color: var(--text-secondary); transition: transform .2s; flex-shrink: 0; }
:where(body[data-page="documentation"]) .doc-card.open .doc-card-arrow { transform: rotate(90deg); }
:where(body[data-page="documentation"]) .doc-card-subs { max-height: 0; overflow: hidden; transition: max-height .3s ease; }
:where(body[data-page="documentation"]) .doc-card.open .doc-card-subs { max-height: 600px; }
:where(body[data-page="documentation"]) .doc-sub-list { padding: 0 1rem 1rem; display: flex; flex-direction: column; gap: 4px; }
:where(body[data-page="documentation"]) .doc-sub-item { display: flex; align-items: center; gap: .5rem; padding: .45rem .7rem; border-radius: 8px; font-size: .82rem; font-weight: 500; color: var(--text-primary); cursor: pointer; transition: background .15s; }
:where(body[data-page="documentation"]) .doc-sub-item:hover { background: var(--secondary-container); }
:where(body[data-page="documentation"]) .doc-sub-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-color); flex-shrink: 0; }

/* Info modal */
:where(body[data-page="documentation"]) .doc-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); backdrop-filter: blur(4px); z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 1rem; opacity: 0; pointer-events: none; transition: opacity .22s; }
:where(body[data-page="documentation"]) .doc-modal-overlay.open { opacity: 1; pointer-events: all; }
:where(body[data-page="documentation"]) .doc-modal { background: var(--glass-bg, rgba(255,255,255,.97)); border: 1px solid var(--glass-border); border-radius: 18px; padding: 1.5rem; width: 100%; max-width: 520px; max-height: 85vh; overflow-y: auto; transform: translateY(16px) scale(.98); transition: transform .22s; box-shadow: 0 20px 60px rgba(0,0,0,.18); }
:where(body[data-page="documentation"]) .doc-modal-overlay.open .doc-modal { transform: translateY(0) scale(1); }
:where(body[data-page="documentation"]) .doc-modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
:where(body[data-page="documentation"]) .doc-modal-header h2 { font-size: 1.1rem; font-weight: 700; margin: 0; display: flex; align-items: center; gap: .5rem; }
:where(body[data-page="documentation"]) .doc-modal-close { width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--glass-border); background: transparent; font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); transition: all .15s; }
:where(body[data-page="documentation"]) .doc-modal-close:hover { background: var(--secondary-container); color: var(--accent-color); }
:where(body[data-page="documentation"]) .doc-modal-body { font-size: .88rem; line-height: 1.65; color: var(--text-primary); }
:where(body[data-page="documentation"]) .doc-modal-body h3 { font-size: .85rem; font-weight: 700; color: var(--accent-color); margin: 1rem 0 .4rem; }
:where(body[data-page="documentation"]) .doc-modal-body ul { padding-left: 1.2rem; margin: .3rem 0; }
:where(body[data-page="documentation"]) .doc-modal-body li { margin-bottom: .25rem; }
:where(body[data-page="documentation"]) .doc-modal-body .doc-tip { background: var(--secondary-container); border-radius: 10px; padding: .6rem .8rem; font-size: .8rem; margin-top: .75rem; }

@media (max-width: 600px) {
  :where(body[data-page="documentation"]) .doc-grid { grid-template-columns: 1fr; }
  :where(body[data-page="documentation"]) .doc-container { padding: 1rem .75rem 3rem; }
}
</style>
