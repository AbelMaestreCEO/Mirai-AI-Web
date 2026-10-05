<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Planes</div>
    <div style="width:40px;"></div>
  </header>
  <div class="purchase-container">
    <div class="purchase-hero">
      <h1>Planes de Mirai AI</h1>
      <p>Elige el plan que mejor se adapte a tus necesidades de generación con IA.</p>
    </div>
    <div class="current-plan-banner">
      <template v-if="loaded">Tu plan actual es <strong>{{ planName }}</strong></template>
      <template v-else>Cargando tu plan actual...</template>
    </div>
    <div v-if="loaded" class="plans-grid">
      <div v-for="p in PLANS" :key="p.id" class="plan-card" :class="{ current: p.id === userPlan }" :data-plan="p.id">
        <div class="plan-icon">{{ p.icon }}</div>
        <div class="plan-name">{{ p.name }}</div>
        <div class="plan-price">{{ p.price }} <span>{{ p.period }}</span></div>
        <p style="font-size:0.78rem;color:var(--text-secondary);margin:0 0 .5rem;">{{ p.desc }}</p>
        <ul class="plan-features">
          <li v-for="f in p.features" :key="f"><span class="plan-check">✓</span> {{ f }}</li>
        </ul>
        <button class="plan-btn">{{ p.id === userPlan ? 'Plan actual' : 'Próximamente' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Migración de public/purchase.html + js/purchase.js.
import { computed, onMounted, ref } from 'vue';
import MenuToggle from '@/components/MenuToggle.vue';
import { api } from '@/lib/api';

const PLANS = [
  { id: 'basic', icon: '🌱', name: 'Basic', price: '?$', period: '/mes',
    desc: 'Ideal para explorar las capacidades de Mirai AI con uso moderado.',
    features: ['10 imágenes por día', '2 pistas de música por día', '1 video por día', 'Chat con IA ilimitado', 'Acceso a DeepSeek V4-Flash'] },
  { id: 'students', icon: '🎓', name: 'Students', price: '?$', period: '/mes',
    desc: 'Pensado para estudiantes que necesitan generar contenido académico y creativo.',
    features: ['25 imágenes por día', '5 pistas de música por día', '3 videos por día', 'Chat con IA ilimitado', 'Acceso a DeepSeek V4-Flash', 'Edición de imágenes con IA'] },
  { id: 'development', icon: '💻', name: 'Development', price: '?$', period: '/mes',
    desc: 'Para desarrolladores y profesionales que integran IA en su flujo de trabajo.',
    features: ['50 imágenes por día', '12 pistas de música por día', '8 videos por día', 'Chat con IA ilimitado', 'Acceso a DeepSeek V4-Flash y V4-Pro', 'Edición y upscale de imágenes', 'Video Replace y Animate'] },
  { id: 'designer', icon: '🎨', name: 'Designer', price: '?$', period: '/mes',
    desc: 'Orientado a diseñadores y creativos con alta demanda de generación visual.',
    features: ['120 imágenes por día', '25 pistas de música por día', '15 videos por día', 'Chat con IA ilimitado', 'Acceso a todos los modelos de IA', 'LoRA personalizado', 'Try-On virtual', 'Video Avatar'] },
  { id: 'max', icon: '👑', name: 'Max', price: '?$', period: '/mes',
    desc: 'Sin límites. Generación ilimitada de imágenes, videos, música y texto.',
    features: ['Imágenes ilimitadas', 'Música ilimitada', 'Videos ilimitados', 'Chat con IA ilimitado', 'Acceso a todos los modelos de IA', 'LoRA y entrenamiento personalizado', 'Try-On virtual ilimitado', 'Video Avatar ilimitado', 'Soporte prioritario'] },
];

const userPlan = ref('basic');
const loaded = ref(false);
const planName = computed(() => userPlan.value.charAt(0).toUpperCase() + userPlan.value.slice(1));

onMounted(async () => {
  try {
    const { data } = await api.get<{ plan?: string }>('/api/user/tokens');
    if (data?.plan) userPlan.value = data.plan;
  } catch {
    // Sin conexión: se queda en Basic, como antes.
  } finally {
    loaded.value = true;
  }
});
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
:where(body[data-page="purchase"]) .purchase-container { max-width: 1200px; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }
:where(body[data-page="purchase"]) .purchase-hero { text-align: center; padding: 1.5rem 1rem 1rem; }
:where(body[data-page="purchase"]) .purchase-hero h1 { font-size: clamp(1.6rem, 4vw, 2.4rem); font-weight: 700; background: var(--accent-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
:where(body[data-page="purchase"]) .purchase-hero p { color: var(--text-secondary); font-size: 0.92rem; margin-top: .3rem; }

:where(body[data-page="purchase"]) .current-plan-banner {
  background: var(--secondary-container);
  border: 1px solid var(--accent-color);
  border-radius: 14px;
  padding: 1rem 1.5rem;
  text-align: center;
  margin: 0 auto 2rem;
  max-width: 480px;
  font-size: 0.9rem;
  color: var(--text-primary);
}
:where(body[data-page="purchase"]) .current-plan-banner strong { color: var(--accent-color); text-transform: capitalize; }

:where(body[data-page="purchase"]) .plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1.25rem;
}

:where(body[data-page="purchase"]) .plan-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 18px;
  padding: 1.5rem 1.25rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  transition: transform .2s, box-shadow .2s;
  position: relative;
}
:where(body[data-page="purchase"]) .plan-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px var(--accent-glow); }
:where(body[data-page="purchase"]) .plan-card.current { border-color: var(--accent-color); border-width: 2px; }
:where(body[data-page="purchase"]) .plan-card.current::after {
  content: 'Tu plan actual';
  position: absolute;
  top: -12px;
  background: var(--accent-gradient);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 3px 12px;
  border-radius: 20px;
}

:where(body[data-page="purchase"]) .plan-icon { font-size: 2.2rem; margin-bottom: .6rem; }
:where(body[data-page="purchase"]) .plan-name { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); text-transform: capitalize; }
:where(body[data-page="purchase"]) .plan-price { font-size: 1.8rem; font-weight: 800; color: var(--accent-color); margin: .6rem 0; }
:where(body[data-page="purchase"]) .plan-price span { font-size: 0.8rem; font-weight: 400; color: var(--text-secondary); }

:where(body[data-page="purchase"]) .plan-features {
  list-style: none;
  padding: 0;
  margin: .8rem 0 1.2rem;
  width: 100%;
  text-align: left;
}
:where(body[data-page="purchase"]) .plan-features li {
  font-size: 0.82rem;
  color: var(--text-primary);
  padding: 4px 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
:where(body[data-page="purchase"]) .plan-features li::before { content: ''; display: none; }
:where(body[data-page="purchase"]) .plan-check { color: var(--accent-color); font-size: 0.9rem; flex-shrink: 0; }

:where(body[data-page="purchase"]) .plan-btn {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: not-allowed;
  background: var(--secondary-container);
  color: var(--text-secondary);
  transition: all .2s;
  margin-top: auto;
}
:where(body[data-page="purchase"]) .plan-card.current .plan-btn {
  background: var(--accent-gradient);
  color: #fff;
  cursor: default;
}

@media (max-width: 600px) {
  :where(body[data-page="purchase"]) .plans-grid { grid-template-columns: 1fr; }
  :where(body[data-page="purchase"]) .purchase-container { padding: 1rem .75rem 3rem; }
}
</style>
