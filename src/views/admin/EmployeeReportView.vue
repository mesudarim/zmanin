<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Timestamp } from 'firebase/firestore'
import { useI18nStore } from '@/stores/i18n'
import { useSettingsStore } from '@/stores/settings'
import { getUserProfile } from '@/firebase/firestore'
import { useReport } from '@/composables/useReport'
import { splitOvertime } from '@/utils/overtime'
import type { MonthlyReport, UserProfile, TimeLog } from '@/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppBadge from '@/components/ui/AppBadge.vue'

const route = useRoute()
const router = useRouter()
const i18n = useI18nStore()
const settingsStore = useSettingsStore()
const { loading, generateReport, exportCsv } = useReport()
const t = computed(() => i18n.t)

const employee = ref<UserProfile | null>(null)
const report = ref<MonthlyReport | null>(null)

const now = new Date()
const selectedYear  = ref(now.getFullYear())
const selectedMonth = ref(now.getMonth() + 1)

const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i)
const months = computed(() => t.value.months.map((label, i) => ({ value: i + 1, label })))

async function load() {
  await settingsStore.load()
  const uid = route.params.uid as string
  if (!employee.value) {
    employee.value = await getUserProfile(uid)
  }
  if (employee.value) {
    report.value = await generateReport(employee.value, selectedYear.value, selectedMonth.value)
  }
}

onMounted(load)
watch([selectedYear, selectedMonth], load)

function getReasonLabel(id: string) {
  const r = settingsStore.settings.absenceReasons.find(x => x.id === id)
  if (!r) return id
  return i18n.locale === 'he' ? r.labelHe : r.labelEn
}

function isMilouimReason(id: string): boolean {
  const r = settingsStore.settings.absenceReasons.find(x => x.id === id)
  if (!r) return false
  return r.labelEn.toLowerCase().includes('milouim') || r.labelHe.includes('מילואים')
}

function tsToTime(ts: Timestamp | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const logOvertimeMap = computed(() => {
  if (!report.value) return new Map<string, { normal: number; h125: number; h150: number }>()
  const t125 = settingsStore.settings.overtimeThreshold125 ?? 8.6
  const t150 = settingsStore.settings.overtimeThreshold150 ?? 12
  const map = new Map<string, { normal: number; h125: number; h150: number }>()
  for (const l of report.value.logs) {
    if (l.type === 'work') map.set(l.date, splitOvertime(l.date, l.totalDecimalHours ?? 0, t125, t150))
  }
  return map
})

function isUnclosed(log: TimeLog): boolean {
  if (log.type !== 'work') return false
  if (log.sessions?.length) return log.sessions.some(s => s.clockIn && !s.clockOut)
  return !!(log.clockIn && !log.clockOut)
}

function isWeekend(date: string): boolean {
  const day = new Date(date + 'T12:00:00').getDay()
  return day === 5 || day === 6 // Friday or Saturday
}

const milouimHoursTotal = computed(() => {
  if (!report.value) return 0
  return Math.round(
    report.value.logs
      .filter(l => l.type === 'absence' && isMilouimReason(l.absenceReason ?? '') && (l.milouimTotalDecimalHours ?? 0) > 0)
      .reduce((sum, l) => sum + (l.milouimTotalDecimalHours ?? 0), 0)
    * 100) / 100
})
</script>

<template>
  <div class="page-container space-y-6">
    <div class="flex items-center gap-3 flex-wrap">
      <button class="text-primary-600 hover:underline text-sm" @click="router.push('/admin/employees')">
        ← {{ t.admin.employees }}
      </button>
      <h1 class="text-2xl font-bold text-gray-900">
        {{ employee?.firstName }} {{ employee?.name }} — {{ t.report.title }}
      </h1>
    </div>

    <!-- Filters -->
    <div class="card flex flex-wrap gap-4 items-end">
      <div>
        <label class="text-sm font-medium text-gray-700 block mb-1">{{ t.report.selectMonth }}</label>
        <select v-model="selectedMonth" class="rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500">
          <option v-for="m in months" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </div>
      <div>
        <label class="text-sm font-medium text-gray-700 block mb-1">{{ t.report.selectYear }}</label>
        <select v-model="selectedYear" class="rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500">
          <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
        </select>
      </div>
      <AppButton variant="secondary" size="sm" @click="load">↻</AppButton>
    </div>

    <div v-if="loading" class="card flex items-center justify-center py-12">
      <div class="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>

    <template v-else-if="report">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="card text-center">
          <p class="text-xs text-gray-500 mb-1">{{ t.report.totalHours }}</p>
          <p class="text-2xl font-bold text-primary-700">{{ report.totalDecimalHours }}h</p>
        </div>
        <div v-if="employee?.contractType === 'percentage'" class="card text-center">
          <p class="text-xs text-gray-500 mb-1">{{ t.report.theoreticalHours }}</p>
          <p class="text-2xl font-bold text-gray-700">{{ report.theoreticalHours }}h</p>
        </div>
        <div v-if="employee?.contractType === 'percentage'" class="card text-center">
          <p class="text-xs text-gray-500 mb-1">{{ t.report.difference }}</p>
          <p class="text-2xl font-bold" :class="report.hoursDiff >= 0 ? 'text-green-600' : 'text-red-600'">
            {{ report.hoursDiff >= 0 ? '+' : '' }}{{ report.hoursDiff }}h
          </p>
        </div>
        <div class="card text-center">
          <p class="text-xs text-gray-500 mb-1">{{ t.report.travelReimbursement }}</p>
          <p class="text-2xl font-bold text-green-600">{{ report.totalKmAmount.toFixed(2) }}</p>
        </div>
      </div>

      <div v-if="report.absenceDays.length" class="card">
        <h2 class="text-sm font-semibold text-gray-700 mb-3">{{ t.report.absences }}</h2>
        <div class="flex flex-wrap gap-2">
          <AppBadge v-for="a in report.absenceDays" :key="a.date" variant="yellow">
            {{ a.date }} — {{ getReasonLabel(a.reason) }}
          </AppBadge>
        </div>
      </div>

      <div class="card overflow-x-auto">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold text-gray-700">{{ t.report.detail }}</h2>
          <AppButton variant="secondary" size="sm" @click="exportCsv(report!, i18n.locale)">
            {{ t.report.exportCsv }}
          </AppButton>
        </div>
        <p v-if="!report.logs.length" class="text-sm text-gray-400 py-4 text-center">{{ t.report.noData }}</p>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100 text-xs text-gray-500">
              <th class="pb-2 font-medium text-start">{{ t.report.date }}</th>
              <th class="pb-2 font-medium text-start">{{ t.report.type }}</th>
              <th class="pb-2 font-medium text-start">{{ t.adminReports.sessions }}</th>
              <th class="pb-2 font-medium text-end">{{ t.report.hours }}</th>
              <th class="pb-2 font-medium text-end text-orange-400">{{ t.report.hours125 }}</th>
              <th class="pb-2 font-medium text-end text-red-400">{{ t.report.hours150 }}</th>
              <th class="pb-2 font-medium text-end">{{ t.report.km }}</th>
              <th class="pb-2 font-medium text-end">{{ t.report.amount }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="log in report.logs"
              :key="log.date"
              class="border-b"
              :class="isUnclosed(log)
                ? 'bg-red-50 hover:bg-red-100 border-red-100'
                : log.type === 'holiday'
                  ? 'bg-indigo-50/70 hover:bg-indigo-50 border-indigo-100'
                  : isWeekend(log.date)
                    ? 'bg-slate-100/60 hover:bg-slate-100 border-slate-100'
                    : 'hover:bg-gray-50 border-gray-50'"
            >
              <td class="py-2">
                {{ log.date }}
                <span v-if="isUnclosed(log)" class="ms-1 text-red-400 text-xs" :title="t.report.unclosedSession">●</span>
              </td>
              <td class="py-2">
                <AppBadge v-if="log.type === 'holiday'" variant="purple">
                  {{ log.holidayDayType === 'half' ? t.report.halfPublicHoliday : t.report.publicHoliday }}
                </AppBadge>
                <AppBadge v-else :variant="log.type === 'absence' ? 'yellow' : log.isRemote ? 'blue' : 'green'">
                  {{ log.type === 'absence' ? getReasonLabel(log.absenceReason ?? '') : log.isRemote ? t.report.remote : t.report.work }}
                </AppBadge>
                <span v-if="log.type === 'holiday'" class="ms-1 text-xs text-indigo-500">
                  {{ i18n.locale === 'he' ? log.holidayNameHe : log.holidayNameEn }}
                </span>
              </td>
              <!-- Sessions / Miluim clock times -->
              <td class="py-2">
                <template v-if="log.type === 'work'">
                  <div v-if="log.sessions?.length" class="space-y-0.5">
                    <div v-for="(s, idx) in log.sessions" :key="idx" class="text-xs font-mono text-gray-600 flex items-center gap-1">
                      <span>{{ tsToTime(s.clockIn) }}</span>
                      <span class="text-gray-300">→</span>
                      <span>{{ s.clockOut ? tsToTime(s.clockOut) : '…' }}</span>
                    </div>
                  </div>
                  <span v-else-if="log.clockIn" class="text-xs font-mono text-gray-600">
                    {{ tsToTime(log.clockIn) }} → {{ log.clockOut ? tsToTime(log.clockOut) : '…' }}
                  </span>
                </template>
                <div v-else-if="log.milouimClockIn" class="text-xs font-mono text-purple-600 flex items-center gap-1">
                  <span>{{ tsToTime(log.milouimClockIn) }}</span>
                  <span class="text-purple-300">→</span>
                  <span>{{ log.milouimClockOut ? tsToTime(log.milouimClockOut) : '…' }}</span>
                </div>
                <span v-else class="text-xs text-gray-300">—</span>
              </td>
              <!-- Hours: work hours normal, Miluim hours in purple with asterisk -->
              <td class="py-2 text-end font-mono">
                <span v-if="log.type === 'work'">{{ (log.totalDecimalHours ?? 0) }}h</span>
                <span v-else-if="log.milouimTotalDecimalHours" class="text-purple-600">
                  {{ log.milouimTotalDecimalHours }}h *
                </span>
                <span v-else class="text-gray-300">—</span>
              </td>
              <td class="py-2 text-end font-mono text-orange-500">
                <span v-if="(logOvertimeMap.get(log.date)?.h125 ?? 0) > 0">{{ logOvertimeMap.get(log.date)!.h125 }}h</span>
                <span v-else class="text-gray-300">—</span>
              </td>
              <td class="py-2 text-end font-mono text-red-500">
                <span v-if="(logOvertimeMap.get(log.date)?.h150 ?? 0) > 0">{{ logOvertimeMap.get(log.date)!.h150 }}h</span>
                <span v-else class="text-gray-300">—</span>
              </td>
              <td class="py-2 text-end font-mono">{{ log.type === 'work' ? (log.kmForDay ?? 0) : '—' }}</td>
              <td class="py-2 text-end font-mono text-green-700">
                {{ log.type === 'work' ? ((log.kmForDay ?? 0) * settingsStore.settings.kmPrice).toFixed(2) : '—' }}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="font-semibold border-t border-gray-200">
              <td colspan="3" class="pt-3">{{ t.report.totalAmount }}</td>
              <td class="pt-3 text-end font-mono">{{ report.totalDecimalHours }}h</td>
              <td class="pt-3 text-end font-mono text-orange-500">{{ report.hours125 > 0 ? report.hours125 + 'h' : '—' }}</td>
              <td class="pt-3 text-end font-mono text-red-500">{{ report.hours150 > 0 ? report.hours150 + 'h' : '—' }}</td>
              <td class="pt-3 text-end" />
              <td class="pt-3 text-end font-mono text-green-700">{{ report.totalKmAmount.toFixed(2) }}</td>
            </tr>
            <tr v-if="milouimHoursTotal > 0">
              <td colspan="8" class="pt-1 text-xs text-purple-500 italic">
                * {{ t.report.milouimNote }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Miluim card -->
      <div v-if="milouimHoursTotal > 0" class="card text-center border-2 border-purple-200 bg-purple-50">
        <p class="text-xs text-purple-600 mb-1">{{ t.report.milouimHours }}</p>
        <p class="text-2xl font-bold text-purple-700">{{ milouimHoursTotal }}h</p>
        <p class="text-xs text-purple-400 mt-0.5">{{ t.report.notIncludedInTotal }}</p>
      </div>
    </template>
  </div>
</template>
