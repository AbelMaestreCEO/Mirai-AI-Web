<template>
  <router-view />
  <InstalarLinux />
  <AppDialog />
</template>

<script setup lang="ts">
import AppDialog from '@/components/AppDialog.vue';
import InstalarLinux from '@/components/InstalarLinux.vue';
</script>
