<script setup lang="ts">
import { useI18nStore } from '@/stores/i18n'

const i18n = useI18nStore()
</script>

<template>
  <button
    class="text-xl leading-none p-1 rounded-lg hover:bg-gray-100 transition-colors"
    :title="i18n.locale === 'en' ? 'עברית' : 'English'"
    @click="i18n.setLocale(i18n.locale === 'en' ? 'he' : 'en')"
  >
    {{ i18n.locale === 'en' ? '🇮🇱' : '🇬🇧' }}
  </button>
</template>
