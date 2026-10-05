<template>
  <!--
    Fragmento sin contenedor a propósito: styles.css aparta el contenido del
    menú fijo con selectores de hermanos (.mobile-sidebar ~ .home-main, ...),
    así que la barra y la raíz de cada página tienen que ser hermanas, como en
    las páginas antiguas.
  -->
  <nav class="mobile-sidebar" :class="{ active: shell.open, collapsed: shell.collapsed }">
    <div class="sidebar-header">
      <h3>Mirai AI</h3>
      <div style="display: flex; gap: 8px; align-items: center">
        <button class="sidebar-collapse-btn" title="Colapsar barra" @click="toggleCollapsed">
          <svg viewBox="0 0 24 24" width="18" height="18" :style="{ transform: shell.collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </button>
        <button class="close-menu" aria-label="Cerrar menú" @click="closeMenu">&times;</button>
      </div>
    </div>

    <div class="sidebar-content">
      <section class="sidebar-section">
        <h4>Navegación</h4>
        <div class="collapsible-content nav-collapsible-content" style="max-height: 500px; opacity: 1; margin-top: 0.5rem">
          <div class="nav-grid" :class="{ 'nav-expanded': shell.navExpanded }">
            <AppLink
              v-for="(item, i) in NAV_ITEMS"
              :key="item.slug"
              :to="item.slug"
              class="nav-grid-item"
              :class="{ 'nav-extra': i >= 3, 'active-link': isActive(item.slug) }"
              :data-tooltip="item.tooltip"
              @navigate="onNavigate"
            >
              <img
                class="nav-icon"
                :src="`/icons/ui/${item.icon}-48.png`"
                :srcset="`/icons/ui/${item.icon}-48.png 1x, /icons/ui/${item.icon}-96.png 2x`"
                :alt="item.alt"
                width="26"
                height="26"
                loading="lazy"
                decoding="async"
              />
              <span class="nav-label">{{ item.label }}</span>
            </AppLink>
          </div>
          <button class="nav-toggle-expanded" @click="shell.navExpanded = !shell.navExpanded">
            {{ shell.navExpanded ? 'Ver menos ▴' : 'Ver más ▾' }}
          </button>
          <button class="nav-toggle-btn" title="Mostrar más" @click="shell.navExpanded = !shell.navExpanded">
            {{ shell.navExpanded ? '✕' : '···' }}
          </button>
        </div>
      </section>

      <!-- Panel propio de cada página (conversaciones, aula...): lo rellenan con <Teleport>. -->
      <section id="sidebar-page-section" class="sidebar-section" style="flex: 1; display: flex; flex-direction: column; min-height: 0" />

      <AppLink to="settings" class="settings-sidebar-btn" title="Configuración" @navigate="onNavigate">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path
            d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94zM12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"
          />
        </svg>
        <span>Configuración</span>
      </AppLink>
      <button class="logout-btn" title="Cerrar sesión" @click="logout">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="display: block">
          <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
        </svg>
        <span>Cerrar Sesión</span>
      </button>

      <div class="sidebar-logo">
        <a href="https://aberumirai.com">
          <img src="https://assets.aberumirai.com/imgs/icon.webp" alt="Logo Aberu & Mirai" style="max-width: 80px; max-height: 80px" />
        </a>
      </div>
    </div>

    <div class="sidebar-footer">
      <p>&copy; {{ year }} Aberu & Mirai Company</p>
    </div>
  </nav>
  <div class="mobile-overlay" :class="{ active: shell.open }" @click="closeMenu" />

  <router-view />
</template>

<script setup lang="ts">
// Barra lateral de la app (la .mobile-sidebar de las páginas antiguas, que
// manejaban app.js y mirai-boot.js).
import { useRoute } from 'vue-router';
import AppLink from '@/components/AppLink.vue';
import { NAV_ITEMS } from '@/lib/nav';
import { pageHref } from '@/lib/legacy';
import { resetSession } from '@/lib/session';
import { closeMenu, shell, toggleCollapsed } from '@/lib/shell';

const route = useRoute();
const year = new Date().getFullYear();

/** Página actual: el primer segmento de la ruta es el slug antiguo. */
function isActive(slug: string): boolean {
  const current = route.path.replace(/^\/+/, '').split('/')[0] ?? '';
  return current === slug;
}

function onNavigate() {
  if (window.innerWidth <= 768) closeMenu();
}

async function logout() {
  if (!confirm('¿Estás seguro de que deseas cerrar sesión?')) return;
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {
    // Se sale igualmente aunque falle el servidor.
  }
  try {
    localStorage.removeItem('mirai-ai-conversation-id');
    localStorage.removeItem('mirai-ai-course-id');
    localStorage.removeItem('mirai-ai-lesson-id');
  } catch {
    // Almacenamiento bloqueado: no hay nada que limpiar.
  }
  resetSession();
  window.location.href = pageHref('login');
}
</script>
