<template>
  <div v-if="ofrecerInstalar" class="instalar-linux" role="status">
    <span class="instalar-linux__texto">
      Instala <strong>Mirai AI</strong> en Linux para abrirla en su propia ventana.
    </span>

    <button v-if="puedeInstalar" type="button" class="instalar-linux__accion" @click="instalarAplicacion">
      Instalar
    </button>
    <span v-else class="instalar-linux__espera">
      Abre esta página en Chrome o Chromium; si no ves el botón, recárgala.
    </span>

    <button type="button" class="instalar-linux__cerrar" aria-label="Cerrar" @click="cerrarInstalacion">
      &times;
    </button>
  </div>
</template>

<script setup lang="ts">
import { cerrarInstalacion, instalarAplicacion, ofrecerInstalar, puedeInstalar } from '@/lib/instalar';
</script>
