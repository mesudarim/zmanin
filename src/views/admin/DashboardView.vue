<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { useAdminReport } from '@/composables/useAdminReport'

const i18n   = useI18nStore()
const auth   = useAuthStore()
const router = useRouter()
const t      = computed(() => i18n.t)

const { loading, allEmployees, reportData, loadEmployees, generate } = useAdminReport()

const now           = new Date()
const selectedYear  = ref(now.getFullYear())
const selectedMonth = ref(now.getMonth() + 1)

const months = computed(() => t.value.months.map((label, i) => ({ value: i + 1, label })))
const years  = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

async function loadReport() {
  await loadEmployees()
  const y = selectedYear.value
  const m = selectedMonth.value
  const from    = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to      = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  await generate(allEmployees.value.map(e => e.uid), from, to)
}

onMounted(loadReport)
watch([selectedYear, selectedMonth], loadReport)

const totals = computed(() => reportData.value.reduce(
  (acc, r) => {
    acc.workDays    += r.workDays
    acc.totalHours  += r.totalHours
    acc.effective   += r.totalHours + r.absenceEquivalentHours
    acc.theoretical += r.theoreticalHours
    acc.amount      += r.totalAmount
    return acc
  },
  { workDays: 0, totalHours: 0, effective: 0, theoretical: 0, amount: 0 }
))
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
        <p class="text-3xl font-bold text-primary-700">{{ allEmployees.length }}</p>
        <p class="text-xs text-gray-500 mt-1">{{ t.admin.employees }}</p>
      </div>
    </div>

    <!-- Monthly summary table -->
    <div class="card space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <h2 class="font-semibold text-gray-800">{{ t.adminReports.monthlyOverview }}</h2>
        <div class="flex items-center gap-2">
          <select
            v-model="selectedMonth"
            class="rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500 py-1.5"
          >
            <option v-for="m in months" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
          <select
            v-model="selectedYear"
            class="rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500 py-1.5"
          >
            <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
          </select>
        </div>
      </div>

      <div v-if="loading" class="flex justify-center py-8">
        <div class="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100 text-xs text-gray-500">
              <th class="pb-2 font-medium text-start">{{ t.admin.firstName }}</th>
              <th class="pb-2 font-medium text-end">{{ t.adminReports.daysWorked }}</th>
              <th class="pb-2 font-medium text-end">{{ t.adminReports.hoursWorked }}</th>
              <th class="pb-2 font-medium text-end">{{ t.adminReports.hoursToDo }}</th>
              <th class="pb-2 font-medium text-end">{{ t.adminReports.difference }}</th>
              <th class="pb-2 font-medium text-end">{{ t.adminReports.travelAmount }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in reportData"
              :key="r.employee.uid"
              class="border-b border-gray-50 hover:bg-primary-50/30 transition-colors cursor-pointer"
              @click="router.push('/admin/employees/' + r.employee.uid + '/report')"
            >
              <td class="py-2.5">
                <div class="flex items-center gap-2">
                  <div class="w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-semibold shrink-0">
                    {{ r.employee.firstName?.charAt(0) }}
                  </div>
                  <span class="font-medium text-gray-800">{{ r.employee.firstName }} {{ r.employee.name }}</span>
                </div>
              </td>
              <td class="py-2.5 text-end font-mono text-gray-700">{{ r.workDays }}</td>
              <td class="py-2.5 text-end font-mono text-gray-800 font-medium">{{ r.totalHours }}h</td>
              <td class="py-2.5 text-end font-mono text-gray-500">
                {{ r.employee.contractType === 'percentage' ? r.theoreticalHours + 'h' : '—' }}
              </td>
              <td class="py-2.5 text-end font-mono font-semibold"
                :class="(r.totalHours + r.absenceEquivalentHours - r.theoreticalHours) >= 0 ? 'text-green-600' : 'text-red-500'">
                {{ (() => {
                  const diff = Math.round((r.totalHours + r.absenceEquivalentHours - r.theoreticalHours) * 100) / 100
                  return (diff >= 0 ? '+' : '') + diff + 'h'
                })() }}
              </td>
              <td class="py-2.5 text-end font-mono text-green-700">{{ r.totalAmount.toFixed(2) }}</td>
            </tr>
            <tr v-if="!reportData.length">
              <td colspan="6" class="py-6 text-center text-sm text-gray-400">{{ t.adminReports.noData }}</td>
            </tr>
          </tbody>
          <tfoot v-if="reportData.length">
            <tr class="border-t-2 border-gray-200 font-semibold text-gray-900 text-xs">
              <td class="pt-2.5 text-gray-500">{{ i18n.locale === 'he' ? 'סה״כ' : 'Total' }}</td>
              <td class="pt-2.5 text-end font-mono">{{ totals.workDays }}</td>
              <td class="pt-2.5 text-end font-mono">{{ Math.round(totals.totalHours * 100) / 100 }}h</td>
              <td class="pt-2.5 text-end font-mono text-gray-500">{{ Math.round(totals.theoretical * 100) / 100 }}h</td>
              <td class="pt-2.5 text-end font-mono"
                :class="(totals.effective - totals.theoretical) >= 0 ? 'text-green-600' : 'text-red-500'">
                {{ (() => {
                  const diff = Math.round((totals.effective - totals.theoretical) * 100) / 100
                  return (diff >= 0 ? '+' : '') + diff + 'h'
                })() }}
              </td>
              <td class="pt-2.5 text-end font-mono text-green-700">{{ totals.amount.toFixed(2) }}</td>
            </tr>
          </tfoot>
        </table>
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
          v-for="emp in allEmployees"
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
        <li v-if="!allEmployees.length" class="py-6 text-center text-sm text-gray-400">
          {{ t.common.loading }}
        </li>
      </ul>
    </div>
  </div>
</template>
