<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18nStore } from '@/stores/i18n'
import { useSettingsStore } from '@/stores/settings'
import { getUserProfile, getTimeLogsForDateRange, createOrUpdateTimeLog, deleteTimeLog } from '@/firebase/firestore'
import type { UserProfile } from '@/types'
import AppButton from '@/components/ui/AppButton.vue'

const route  = useRoute()
const router = useRouter()
const i18n   = useI18nStore()
const settingsStore = useSettingsStore()
const t = computed(() => i18n.t)

const employee = ref<UserProfile | null>(null)
const loading  = ref(false)
const saving   = ref(false)
const savedMsg = ref(false)

const now           = new Date()
const selectedYear  = ref(now.getFullYear())
const selectedMonth = ref(now.getMonth() + 1)
const years  = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)
const months = computed(() => t.value.months.map((label, i) => ({ value: i + 1, label })))

interface DayRow {
  date:       string
  weekday:    number  // 0=Sun … 6=Sat
  // '' = no entry | 'work' = work day | any other string = absence reason id
  entryType:  string
  hours:      number
  km:         number
  existingId?: string
}

const rows = ref<DayRow[]>([])

// All options: no-entry + work + each absence reason
const entryOptions = computed(() => [
  { value: '',     label: t.value.admin.noEntry },
  { value: 'work', label: t.value.admin.workEntry },
  ...settingsStore.settings.absenceReasons.map(r => ({
    value: r.id,
    label: i18n.locale === 'he' ? r.labelHe : r.labelEn
  }))
])

const isWeekend = (w: number) => w === 0 || w === 6

function weekdayLabel(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString(
    i18n.locale === 'he' ? 'he-IL' : 'fr-FR',
    { weekday: 'short' }
  )
}

function buildRows(
  year: number, month: number,
  logs: { id?: string; date: string; type: string; totalDecimalHours?: number; kmForDay?: number; absenceReason?: string | null }[]
) {
  const logMap     = new Map(logs.map(l => [l.date, l]))
  const daysInMonth = new Date(year, month, 0).getDate()
  const result: DayRow[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const date    = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const weekday = new Date(year, month - 1, d).getDay()
    const log     = logMap.get(date)
    let entryType = ''
    if (log) {
      entryType = log.type === 'work' ? 'work' : (log.absenceReason ?? 'absence')
    }
    result.push({
      date,
      weekday,
      entryType,
      hours:      log?.totalDecimalHours ?? 0,
      km:         Number(log?.kmForDay ?? employee.value?.dailyKmBase ?? 0),
      existingId: log?.id
    })
  }
  rows.value = result
}

async function load() {
  loading.value = true
  const uid = route.params.uid as string
  if (!employee.value) {
    employee.value = await getUserProfile(uid)
  }
  await settingsStore.load()
  const y = selectedYear.value
  const m = selectedMonth.value
  const from    = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to      = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const logs    = await getTimeLogsForDateRange(uid, from, to)
  buildRows(y, m, logs)
  loading.value = false
}

onMounted(load)
watch([selectedYear, selectedMonth], load)

function onTypeChange(row: DayRow) {
  if (row.entryType === 'work' && row.hours === 0) {
    const weeklyBase = Number(employee.value?.weeklyHoursBase ?? 42)
    row.hours = Math.round((weeklyBase / 5) * 100) / 100
  }
}

async function save() {
  saving.value = true
  const uid = route.params.uid as string
  for (const row of rows.value) {
    if (isWeekend(row.weekday)) continue
    if (row.entryType === 'work') {
      await createOrUpdateTimeLog({
        userId: uid,
        date: row.date,
        type: 'work',
        totalDecimalHours: Number(row.hours) || 0,
        totalMinutes: Math.round((Number(row.hours) || 0) * 60),
        kmForDay: Number(row.km) || 0,
        manualEntry: true
      })
    } else if (row.entryType !== '') {
      // absence: entryType is the reason id
      await createOrUpdateTimeLog({
        userId: uid,
        date: row.date,
        type: 'absence',
        absenceReason: row.entryType,
        manualEntry: true
      })
    } else if (row.existingId) {
      await deleteTimeLog(row.existingId)
      row.existingId = undefined
    }
  }
  saving.value = false
  savedMsg.value = true
  setTimeout(() => { savedMsg.value = false }, 2500)
  await load()
}

const filledCount = computed(() =>
  rows.value.filter(r => r.entryType !== '' && !isWeekend(r.weekday)).length
)
</script>

<template>
  <div class="page-container space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-3 flex-wrap">
      <button class="text-primary-600 hover:underline text-sm" @click="router.push('/admin/employees')">
        ← {{ t.admin.employees }}
      </button>
      <h1 class="text-2xl font-bold text-gray-900">
        {{ employee?.firstName }} {{ employee?.name }}
        <span class="ml-2 text-sm font-normal text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
          {{ t.admin.temporary }}
        </span>
      </h1>
    </div>

    <!-- Month/Year selector -->
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
    </div>

    <!-- Entry table -->
    <div class="card">
      <div v-if="loading" class="flex justify-center py-10">
        <div class="w-7 h-7 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100 text-xs text-gray-500">
              <th class="pb-2 font-medium text-start w-20">{{ t.report.date }}</th>
              <th class="pb-2 font-medium text-start w-14"></th>
              <th class="pb-2 font-medium text-start">{{ t.report.type }}</th>
              <th class="pb-2 font-medium text-start w-28">{{ t.report.hours }}</th>
              <th class="pb-2 font-medium text-start w-28">km</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.date"
              :class="[
                isWeekend(row.weekday)
                  ? 'opacity-30 bg-gray-50'
                  : row.entryType !== '' ? 'border-b border-gray-50' : 'border-b border-gray-50 hover:bg-gray-50/50'
              ]"
            >
              <!-- Date -->
              <td class="py-1.5 font-mono text-xs text-gray-500">{{ row.date.slice(5) }}</td>
              <!-- Weekday -->
              <td class="py-1.5 text-xs text-gray-400 capitalize">{{ weekdayLabel(row.date) }}</td>

              <!-- Type select -->
              <td class="py-1 pr-2">
                <select
                  v-if="!isWeekend(row.weekday)"
                  v-model="row.entryType"
                  class="text-xs rounded-lg border-gray-200 focus:border-primary-400 focus:ring-primary-400 py-1 pr-6 w-full max-w-[180px]"
                  @change="onTypeChange(row)"
                >
                  <option v-for="opt in entryOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </td>

              <!-- Hours -->
              <td class="py-1 pr-2">
                <input
                  v-if="!isWeekend(row.weekday) && row.entryType === 'work'"
                  v-model="row.hours"
                  type="number"
                  min="0"
                  max="24"
                  step="0.25"
                  class="w-20 text-xs rounded-lg border-gray-200 focus:border-primary-400 focus:ring-primary-400 py-1 text-center"
                />
              </td>

              <!-- KM -->
              <td class="py-1">
                <input
                  v-if="!isWeekend(row.weekday) && row.entryType === 'work'"
                  v-model="row.km"
                  type="number"
                  min="0"
                  step="0.5"
                  class="w-20 text-xs rounded-lg border-gray-200 focus:border-primary-400 focus:ring-primary-400 py-1 text-center"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Footer -->
      <div v-if="!loading" class="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
        <span v-if="savedMsg" class="text-sm text-green-600 font-medium">✓ {{ t.common.success }}</span>
        <span v-else class="text-xs text-gray-400">
          {{ filledCount }} {{ i18n.locale === 'he' ? 'ימים מוזנים' : 'jours saisis' }}
        </span>
        <AppButton :loading="saving" @click="save">{{ t.admin.saveEntries }}</AppButton>
      </div>
    </div>
  </div>
</template>
