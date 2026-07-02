<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useI18nStore } from '@/stores/i18n'
import AppNavbar from '@/components/layout/AppNavbar.vue'

const auth = useAuthStore()
const i18n = useI18nStore()

onMounted(() => {
  // Trigger the RTL/font watcher from the i18n store
  // init() is handled by the router guard before any view mounts
  i18n.setLocale(i18n.locale)
})
</script>

<template>
  <div :class="i18n.isRtl ? 'font-hebrew' : 'font-sans'">
    <AppNavbar v-if="auth.isAuthenticated" />
    <main>
      <RouterView />
    </main>
  </div>
</template>
