<template>
  <button class="mobile-menu-toggle" :class="{ active: shell.open }" aria-label="Abrir menú" @click.stop.prevent="toggleMenu">
    <span class="hamburger-line" />
    <span class="hamburger-line" />
    <span class="hamburger-line" />
  </button>
</template>

<script setup lang="ts">
// Botón hamburguesa de la cabecera de cada página (.mobile-menu-toggle).
import { shell, toggleMenu } from '@/lib/shell';
</script>
