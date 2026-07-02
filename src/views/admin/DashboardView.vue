<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { useAuthStore } from '@/stores/auth'
import { getAllEmployees } from '@/firebase/firestore'
import type { UserProfile } from '@/types'
import { useRouter } from 'vue-router'

const i18n = useI18nStore()
const auth = useAuthStore()
const router = useRouter()
const t = computed(() => i18n.t)

const employees = ref<UserProfile[]>([])
const loading = ref(true)

onMounted(async () => {
  employees.value = await getAllEmployees()
  loading.value = false
})
</script>

<template>
  <div class="page-container space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900">{{ t.nav.dashboard }}</h1>
      <p class="text-sm text-gray-500">{{ t.dashboard.greeting }}, {{ auth.profile?.firstName }}</p>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
      <div class="card text-center">
        <p class="text-3xl font-bold text-primary-700">{{ employees.length }}</p>
        <p class="text-xs text-gray-500 mt-1">{{ t.admin.employees }}</p>
      </div>
    </div>

    <!-- Employees quick list -->
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-semibold text-gray-800">{{ t.admin.employees }}</h2>
        <button
          class="text-sm text-primary-600 hover:underline font-medium"
          @click="router.push('/admin/employees')"
        >
          {{ t.common.edit }} →
        </button>
      </div>

      <div v-if="loading" class="flex justify-center py-8">
        <div class="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>

      <ul v-else class="divide-y divide-gray-50">
        <li
          v-for="emp in employees"
          :key="emp.uid"
          class="flex items-center justify-between py-3 hover:bg-gray-50 rounded-lg px-2 transition-colors cursor-pointer"
          @click="router.push('/admin/employees/' + emp.uid + '/report')"
        >
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-semibold">
              {{ emp.firstName?.charAt(0) }}
            </div>
            <div>
              <p class="text-sm font-medium text-gray-900">{{ emp.firstName }} {{ emp.name }}</p>
              <p class="text-xs text-gray-400">{{ emp.email }}</p>
            </div>
          </div>
          <span class="text-xs text-gray-400">
            {{ emp.contractType === 'percentage' ? emp.contractRate + '%' : i18n.locale === 'he' ? 'שעתי' : 'Hourly' }}
          </span>
        </li>
        <li v-if="!employees.length" class="py-6 text-center text-sm text-gray-400">
          {{ t.common.loading }}
        </li>
      </ul>
    </div>
  </div>
</template>
