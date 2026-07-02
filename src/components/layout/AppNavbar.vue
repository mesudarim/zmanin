<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useI18nStore } from '@/stores/i18n'
import LanguageSwitcher from '@/components/ui/LanguageSwitcher.vue'

const authStore    = useAuthStore()
const i18n         = useI18nStore()
const route        = useRoute()
const mobileMenuOpen = ref(false)

const t = computed(() => i18n.t)

// Close mobile menu on navigation
watch(() => route.path, () => { mobileMenuOpen.value = false })

</script>

<template>
  <header class="bg-white border-b border-gray-200 sticky top-0 z-40">
    <div class="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">

      <!-- Logo -->
      <router-link to="/" class="flex items-center gap-2 font-bold text-xl text-primary-700 tracking-tight">
        <span class="bg-primary-600 text-white w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black">Z</span>
        ZmanIn
      </router-link>

      <!-- Desktop nav -->
      <nav class="hidden md:flex items-center gap-1">

        <!-- ── ADMIN ONLY ── -->
        <template v-if="authStore.profile?.role === 'admin'">
          <router-link to="/admin"           class="nav-link" active-class="nav-link-active">{{ t.nav.dashboard }}</router-link>
          <router-link to="/admin/employees" class="nav-link" active-class="nav-link-active">{{ t.nav.employees }}</router-link>
          <router-link to="/admin/config"    class="nav-link" active-class="nav-link-active">{{ t.nav.config }}</router-link>
          <router-link to="/admin/reports"  class="nav-link" active-class="nav-link-active">{{ t.nav.adminReports }}</router-link>
          <div class="w-px h-5 bg-gray-200 mx-1" />
        </template>

        <!-- ── EVERYONE ── -->
        <router-link to="/dashboard" class="nav-link" active-class="nav-link-active">
          {{ authStore.profile?.role === 'admin' ? t.nav.myAttendance : t.nav.dashboard }}
        </router-link>
        <router-link to="/report" class="nav-link" active-class="nav-link-active">
          {{ authStore.profile?.role === 'admin' ? t.nav.myReport : t.nav.reports }}
        </router-link>

      </nav>

      <div class="flex items-center gap-2">
        <LanguageSwitcher />

        <!-- Profile link -->
        <router-link
          to="/profile"
          class="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-gray-100 transition-colors"
        >
          <div class="w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-semibold shrink-0">
            {{ authStore.profile?.firstName?.charAt(0) ?? '?' }}
          </div>
          <span class="text-sm font-medium text-gray-700 max-w-[5rem] md:max-w-[8rem] truncate">
            {{ authStore.profile?.firstName }} {{ authStore.profile?.name }}
          </span>
        </router-link>

        <!-- Hamburger — admin only, mobile only -->
        <button
          v-if="authStore.profile?.role === 'admin'"
          class="md:hidden p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-600"
          @click="mobileMenuOpen = !mobileMenuOpen"
          :aria-label="mobileMenuOpen ? 'Close menu' : 'Open menu'"
        >
          <svg v-if="!mobileMenuOpen" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
          <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Mobile hamburger dropdown — admin only -->
    <nav
      v-if="authStore.profile?.role === 'admin' && mobileMenuOpen"
      class="md:hidden border-t border-gray-100 bg-white shadow-md"
    >
      <div class="py-2 space-y-0.5 px-2">
        <router-link to="/admin"           class="mobile-menu-link" active-class="mobile-menu-link-active">{{ t.nav.dashboard }}</router-link>
        <router-link to="/admin/employees" class="mobile-menu-link" active-class="mobile-menu-link-active">{{ t.nav.employees }}</router-link>
        <router-link to="/admin/config"    class="mobile-menu-link" active-class="mobile-menu-link-active">{{ t.nav.config }}</router-link>
        <router-link to="/admin/reports"  class="mobile-menu-link" active-class="mobile-menu-link-active">{{ t.nav.adminReports }}</router-link>
        <div class="border-t border-gray-100 my-1" />
        <router-link to="/dashboard" class="mobile-menu-link" active-class="mobile-menu-link-active">{{ t.nav.myAttendance }}</router-link>
        <router-link to="/report"    class="mobile-menu-link" active-class="mobile-menu-link-active">{{ t.nav.myReport }}</router-link>
      </div>
    </nav>

    <!-- Mobile tab bar — employees only -->
    <nav v-if="authStore.profile?.role !== 'admin'" class="md:hidden border-t border-gray-100 flex overflow-x-auto">
      <router-link to="/dashboard" class="mobile-nav-link flex-1" active-class="mobile-nav-link-active">
        {{ t.nav.dashboard }}
      </router-link>
      <router-link to="/report" class="mobile-nav-link flex-1" active-class="mobile-nav-link-active">
        {{ t.nav.reports }}
      </router-link>
      <router-link to="/profile" class="mobile-nav-link flex-1" active-class="mobile-nav-link-active">
        {{ t.nav.profile }}
      </router-link>
    </nav>

  </header>
</template>

<style scoped>
.nav-link        { @apply px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-primary-700 hover:bg-primary-50 transition-colors; }
.nav-link-active { @apply text-primary-700 bg-primary-50; }
.mobile-nav-link        { @apply text-center py-2 px-3 text-xs font-medium text-gray-500 hover:text-primary-700 flex-shrink-0; }
.mobile-nav-link-active { @apply text-primary-700 border-b-2 border-primary-600; }
.mobile-menu-link        { @apply block w-full px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:text-primary-700 hover:bg-primary-50 transition-colors; }
.mobile-menu-link-active { @apply text-primary-700 bg-primary-50; }
</style>
