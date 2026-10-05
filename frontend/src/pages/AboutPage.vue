<template>
  <!-- Header -->
  <header class="header">
    <MenuToggle />
    <div class="header-title">Acerca de</div>
  </header>
  <!-- Contenedor Principal -->
  <div class="about-container">
    <!-- Hero -->
    <div class="about-hero">
      <img src="/favicon.ico" alt="Mirai Ecosystem Logo" class="about-logo">
      <h1>Mirai Ecosystem</h1>
      <p>Una plataforma inteligente diseñada para potenciar el aprendizaje, la productividad y la creatividad mediante inteligencia artificial y herramientas integradas.</p>
    </div>
    <!-- Información de la aplicación -->
    <div class="about-card">
      <p class="about-card-title">Información de la aplicación</p>
      <div class="about-info-row">
        <span class="about-info-label">Nombre</span>
        <span class="about-info-value">Mirai Ecosystem</span>
      </div>
      <div class="about-info-row">
        <span class="about-info-label">Versión de compilación</span>
        <span class="about-info-value">
          <span class="about-badge">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            v249 (build 2026-08-06)
          </span>
        </span>
      </div>
      <div class="about-info-row">
        <span class="about-info-label">Plataforma</span>
        <span class="about-info-value">Web · PWA</span>
      </div>
      <div class="about-info-row">
        <span class="about-info-label">Idioma</span>
        <span class="about-info-value">Español</span>
      </div>
    </div>
    <!-- Desarrolladora -->
    <div class="about-card">
      <p class="about-card-title">Desarrolladora</p>
      <div class="about-info-row">
        <span class="about-info-label">Empresa</span>
        <span class="about-info-value">Aberu & Mirai Company</span>
      </div>
      <div class="about-info-row">
        <span class="about-info-label">Sitio web</span>
        <span class="about-info-value">
          <a href="https://aberumirai.com" style="color: var(--accent-color, #6750A4); text-decoration: none;">aberumirai.com</a>
        </span>
      </div>
      <div class="about-info-row">
        <span class="about-info-label">Política de privacidad</span>
        <span class="about-info-value">
          <a href="https://aberumirai.com/privacy" style="color: var(--accent-color, #6750A4); text-decoration: none;">Ver política</a>
        </span>
      </div>
    </div>
    <!-- Legal -->
    <div class="about-card">
      <p class="about-card-title">Legal</p>
      <div class="about-info-row">
        <span class="about-info-label">Licencia</span>
        <span class="about-info-value">Propietaria</span>
      </div>
      <div class="about-info-row">
        <span class="about-info-label">Copyright</span>
        <span class="about-info-value">
          &copy;  Aberu & Mirai Company
        </span>
      </div>
      <!-- La licencia gratuita de Icons8 exige este enlace visible; sin él
        haría falta una licencia de pago. No quitar. -->
      <div class="about-info-row">
        <span class="about-info-label">Iconos</span>
        <span class="about-info-value">
          <a href="https://icons8.com" target="_blank" rel="noopener" style="color: var(--accent-color, #6750A4); text-decoration: none;">Icons8</a>
        </span>
      </div>
      <div class="about-info-row">
        <span class="about-info-label">Todos los derechos reservados</span>
        <span class="about-info-value">✔</span>
      </div>
    </div>
  </div><!-- /about-container -->
</template>

<script setup lang="ts">
// Migración de public/about.html.
import MenuToggle from '@/components/MenuToggle.vue';
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
/* Estilos exclusivos del módulo About — mínimos y necesarios */
:where(body[data-page="about"]) .about-container {
  --page-max: 720px;
  max-width: var(--page-max);
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
}

:where(body[data-page="about"]) .about-hero {
  text-align: center;
  padding: 2.5rem 1rem 2rem;
}

:where(body[data-page="about"]) .about-hero .about-logo {
  width: 80px;
  height: 80px;
  border-radius: 20px;
  margin: 0 auto 1.25rem;
  display: block;
  box-shadow: 0 4px 20px var(--accent-glow, rgba(103,80,164,0.20));
}

:where(body[data-page="about"]) .about-hero h1 {
  font-size: 2rem;
  font-weight: 700;
  color: var(--on-surface, #1C1B1F);
  margin: 0 0 0.5rem;
}

:where(body[data-page="about"]) .about-hero p {
  color: var(--on-surface-variant, #49454F);
  font-size: 1rem;
  line-height: 1.6;
  max-width: 480px;
  margin: 0 auto;
}

:where(body[data-page="about"]) .about-card {
  background: var(--glass-bg, rgba(255,255,255,0.94));
  border: 1px solid var(--glass-border, rgba(103,80,164,0.12));
  border-radius: 16px;
  padding: 1.5rem;
  margin-bottom: 1rem;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

:where(body[data-page="about"]) .about-card-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent-color, #6750A4);
  margin: 0 0 1rem;
}

:where(body[data-page="about"]) .about-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--glass-border, rgba(103,80,164,0.08));
}

:where(body[data-page="about"]) .about-info-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

:where(body[data-page="about"]) .about-info-label {
  font-size: 0.875rem;
  color: var(--on-surface-variant, #49454F);
}

:where(body[data-page="about"]) .about-info-value {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--on-surface, #1C1B1F);
  text-align: right;
}

:where(body[data-page="about"]) .about-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: var(--secondary-container, #E8DEF8);
  color: var(--accent-color, #6750A4);
  border-radius: 999px;
  padding: 0.25rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 600;
}

:where(body[data-page="about"]) .about-divider {
  height: 1px;
  background: var(--glass-border, rgba(103,80,164,0.12));
  margin: 0.25rem 0;
}

[data-theme="dark"] :where(body[data-page="about"]) .about-hero h1 {
  color: var(--on-surface, #E6E1E5);
}

[data-theme="dark"] :where(body[data-page="about"]) .about-hero p,
[data-theme="dark"] :where(body[data-page="about"]) .about-info-label {
  color: var(--on-surface-variant, #CAC4D0);
}

[data-theme="dark"] :where(body[data-page="about"]) .about-info-value {
  color: var(--on-surface, #E6E1E5);
}
</style>
