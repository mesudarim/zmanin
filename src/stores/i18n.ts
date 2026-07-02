import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { translations, type Locale } from '@/i18n/translations'

export const useI18nStore = defineStore('i18n', () => {
  const locale = ref<Locale>((localStorage.getItem('zmanin_locale') as Locale) ?? 'en')

  const isRtl = computed(() => locale.value === 'he')
  const t = computed(() => translations[locale.value])

  function setLocale(lang: Locale) {
    locale.value = lang
    localStorage.setItem('zmanin_locale', lang)
  }

  // Apply RTL/LTR and font to <html>
  watch(
    locale,
    (lang) => {
      const html = document.documentElement
      html.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr')
      html.setAttribute('lang', lang)
      html.style.fontFamily = lang === 'he' ? 'Heebo, system-ui, sans-serif' : 'Inter, system-ui, sans-serif'
    },
    { immediate: true }
  )

  return { locale, isRtl, t, setLocale }
})
