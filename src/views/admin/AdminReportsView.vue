<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { useAdminReport } from '@/composables/useAdminReport'
import { splitOvertime } from '@/utils/overtime'
import type { TimeLog } from '@/types'
import AppButton from '@/components/ui/AppButton.vue'

const i18n = useI18nStore()
const t    = computed(() => i18n.t)

const { loading, allEmployees, reportData, settings, loadEmployees, generate, exportExcel, exportPdf, exportSalarySplit } = useAdminReport()

// ── Period mode ──────────────────────────────────────────────────────────────
const periodMode = ref<'month' | 'range'>('month')
const now         = new Date()
const selYear     = ref(now.getFullYear())
const selMonth    = ref(now.getMonth() + 1)
const rangeFrom   = ref(now.toISOString().slice(0, 10))
const rangeTo     = ref(now.toISOString().slice(0, 10))
const years       = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i)
const months      = computed(() => t.value.months.map((label, i) => ({ value: i + 1, label })))

function computedFrom(): string {
  if (periodMode.value === 'month') return `${selYear.value}-${String(selMonth.value).padStart(2, '0')}-01`
  return rangeFrom.value
}
function computedTo(): string {
  if (periodMode.value === 'month') {
    const last = new Date(selYear.value, selMonth.value, 0).getDate()
    return `${selYear.value}-${String(selMonth.value).padStart(2, '0')}-${last}`
  }
  return rangeTo.value
}

// ── Employee selection ───────────────────────────────────────────────────────
const selectedUids = ref<string[]>([])
const allSelected  = computed(() =>
  allEmployees.value.length > 0 && selectedUids.value.length === allEmployees.value.length
)
function toggleAll() {
  selectedUids.value = allSelected.value ? [] : allEmployees.value.map(e => e.uid)
}

// ── Report type ──────────────────────────────────────────────────────────────
const reportType = ref<'summary' | 'detailed' | 'salarySplit'>('summary')

// ── Generate ─────────────────────────────────────────────────────────────────
const generated = ref(false)

async function handleGenerate() {
  if (!selectedUids.value.length) return
  await generate(selectedUids.value, computedFrom(), computedTo())
  generated.value = true
}

function doExportExcel() {
  exportExcel(computedFrom(), computedTo(), reportType.value === 'detailed', i18n.locale)
}
function doExportPdf() {
  exportPdf(computedFrom(), computedTo(), reportType.value === 'detailed', i18n.locale)
}

function getReasonLabel(id: string): string {
  const r = settings.value?.absenceReasons?.find(x => x.id === id)
  if (!r) return id
  return i18n.locale === 'he' ? r.labelHe : r.labelEn
}

function logSplit(log: TimeLog) {
  if (log.type !== 'work') return { normal: 0, h125: 0, h150: 0 }
  const t125 = settings.value?.overtimeThreshold125 ?? 8.6
  const t150 = settings.value?.overtimeThreshold150 ?? 12
  return splitOvertime(log.date, log.totalDecimalHours ?? 0, t125, t150)
}

function isUnclosed(log: TimeLog): boolean {
  if (log.type !== 'work') return false
  if (log.sessions?.length) return log.sessions.some(s => s.clockIn && !s.clockOut)
  return !!(log.clockIn && !log.clockOut)
}

function isWeekend(date: string): boolean {
  const day = new Date(date + 'T12:00:00').getDay()
  return day === 5 || day === 6
}

function fmtTime(ts: { toDate(): Date } | null | undefined): string {
  if (!ts) return '…'
  const d = ts.toDate()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── Salary Split helpers ─────────────────────────────────────────────────────
function absenceCategory(reasonId: string): 'vacation' | 'sick' | 'childSick' | 'miluim' | 'other' {
  const r = settings.value?.absenceReasons?.find(x => x.id === reasonId)
  if (!r) return 'other'
  const en = r.labelEn.toLowerCase()
  const he = r.labelHe
  if (en.includes('milouim') || he.includes('מילואים')) return 'miluim'
  if (en.includes('child') || he.includes('ילד')) return 'childSick'
  if (en.includes('sick') || he.includes('מחלה')) return 'sick'
  if (en.includes('vacation') || en.includes('holiday') || he.includes('חופש')) return 'vacation'
  return 'other'
}

function absenceCount(logs: TimeLog[], cat: 'vacation' | 'sick' | 'childSick' | 'miluim'): number {
  return logs.filter(l => l.type === 'absence' && absenceCategory(l.absenceReason ?? '') === cat).length
}

function saturdayHoursForLogs(logs: TimeLog[]): number {
  const sat = logs.filter(l => l.type === 'work' && new Date(l.date + 'T12:00:00').getDay() === 6)
  return Math.round(sat.reduce((sum, l) => sum + (l.totalDecimalHours ?? 0), 0) * 100) / 100
}

const sortBy     = ref<'name' | 'number'>('name')

const sortedEmployees = computed(() =>
  [...allEmployees.value].sort((a, b) => a.name.localeCompare(b.name) || a.firstName.localeCompare(b.firstName))
)
const nameFilter = ref('')
const focusedUid = ref<string | null>(null)

function focusEmployee(uid: string) {
  focusedUid.value = uid
  reportType.value = 'detailed'
  nameFilter.value = ''
}
function clearFocus() {
  focusedUid.value = null
  nameFilter.value = ''
}

const sortedReportData = computed(() => {
  let data = [...reportData.value]

  if (focusedUid.value) {
    data = data.filter(r => r.employee.uid === focusedUid.value)
  } else if (nameFilter.value.trim()) {
    const q = nameFilter.value.trim().toLowerCase()
    data = data.filter(r =>
      r.employee.name.toLowerCase().includes(q) ||
      r.employee.firstName.toLowerCase().includes(q)
    )
  }

  return data.sort((a, b) => {
    if (sortBy.value === 'number') {
      const na = a.employee.employeeNumber ?? ''
      const nb = b.employee.employeeNumber ?? ''
      if (na && nb) return na.localeCompare(nb, undefined, { numeric: true })
      if (na) return -1
      if (nb) return 1
    }
    return a.employee.name.localeCompare(b.employee.name)
  })
})

onMounted(async () => {
  await loadEmployees()
  selectedUids.value = allEmployees.value.map(e => e.uid)
})
</script>

<template>
  <div class="page-container space-y-6">

    <h1 class="text-2xl font-bold text-gray-900">{{ t.adminReports.title }}</h1>

    <!-- ── FILTERS ───────────────────────────────────────────────────────────── -->
    <div class="card space-y-5">

      <!-- Period mode toggle -->
      <div class="flex gap-2">
        <button
          class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          :class="periodMode === 'month' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          @click="periodMode = 'month'; generated = false"
        >{{ t.adminReports.monthMode }}</button>
        <button
          class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          :class="periodMode === 'range' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          @click="periodMode = 'range'; generated = false"
        >{{ t.adminReports.rangeMode }}</button>
      </div>

      <!-- Period controls -->
      <div class="flex flex-wrap gap-4 items-end">
        <template v-if="periodMode === 'month'">
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">{{ t.report.selectMonth }}</label>
            <select v-model="selMonth" class="rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500" @change="generated = false">
              <option v-for="m in months" :key="m.value" :value="m.value">{{ m.label }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">{{ t.report.selectYear }}</label>
            <select v-model="selYear" class="rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500" @change="generated = false">
              <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
            </select>
          </div>
        </template>
        <template v-else>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">{{ t.adminReports.dateFrom }}</label>
            <input v-model="rangeFrom" type="date" class="rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500" @change="generated = false" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">{{ t.adminReports.dateTo }}</label>
            <input v-model="rangeTo" type="date" class="rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500" @change="generated = false" />
          </div>
        </template>
      </div>

      <!-- Employee selection -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="text-xs font-medium text-gray-500 uppercase tracking-wide">{{ t.adminReports.employees }}</label>
          <button class="text-xs text-primary-600 hover:underline" @click="toggleAll">
            {{ allSelected ? t.adminReports.deselectAll : t.adminReports.selectAll }}
          </button>
        </div>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="emp in sortedEmployees"
            :key="emp.uid"
            class="flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded-full border text-sm transition-colors"
            :class="selectedUids.includes(emp.uid)
              ? 'bg-primary-50 border-primary-300 text-primary-800'
              : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'"
          >
            <input type="checkbox" class="hidden" :value="emp.uid" v-model="selectedUids" @change="generated = false" />
            <span class="w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-xs flex items-center justify-center font-semibold shrink-0">
              {{ emp.firstName?.charAt(0) ?? '?' }}
            </span>
            {{ emp.firstName }} {{ emp.name }}
          </label>
        </div>
        <p v-if="!selectedUids.length" class="text-xs text-red-500 mt-1">{{ t.adminReports.selectAtLeastOne }}</p>
      </div>

      <!-- Report type -->
      <div>
        <label class="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{{ t.adminReports.reportType }}</label>
        <div class="flex gap-2">
          <button
            class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            :class="reportType === 'summary' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
            @click="reportType = 'summary'"
          >{{ t.adminReports.summary }}</button>
          <button
            class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            :class="reportType === 'detailed' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
            @click="reportType = 'detailed'"
          >{{ t.adminReports.detailed }}</button>
          <button
            class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            :class="reportType === 'salarySplit' ? 'bg-emerald-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
            @click="reportType = 'salarySplit'"
          >{{ t.adminReports.salarySplit }}</button>
        </div>
        <p class="text-xs text-gray-400 mt-1">
          {{ reportType === 'summary' ? t.adminReports.summaryHint : reportType === 'detailed' ? t.adminReports.detailedHint : t.adminReports.salarySplitHint }}
        </p>
      </div>

      <!-- Generate button -->
      <div>
        <AppButton :loading="loading" :disabled="!selectedUids.length" @click="handleGenerate">
          {{ t.adminReports.generate }}
        </AppButton>
      </div>
    </div>

    <!-- ── RESULTS ────────────────────────────────────────────────────────────── -->
    <template v-if="generated && reportData.length">

      <!-- Search / active-focus strip -->
      <div class="flex flex-wrap gap-2 items-center">
        <!-- Active focus badge -->
        <template v-if="focusedUid">
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-100 text-primary-800 text-sm font-medium">
            {{ sortedReportData[0]?.employee.firstName }} {{ sortedReportData[0]?.employee.name }}
            <button class="ms-1 text-primary-500 hover:text-primary-800 font-bold leading-none" @click="clearFocus">×</button>
          </span>
          <span class="text-xs text-gray-400">{{ t.adminReports.employeesLoaded }}</span>
        </template>
        <!-- Search input -->
        <template v-else>
          <div class="relative">
            <svg class="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
            </svg>
            <input
              v-model="nameFilter"
              type="text"
              :placeholder="i18n.locale === 'he' ? 'חיפוש לפי שם…' : 'Search by name…'"
              class="ps-8 pe-3 py-1 rounded-xl border border-gray-200 text-sm focus:border-primary-400 focus:ring-1 focus:ring-primary-400 focus:outline-none w-48"
            />
            <button v-if="nameFilter" class="absolute end-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" @click="nameFilter = ''">×</button>
          </div>
        </template>
      </div>

      <!-- Export actions -->
      <div class="flex flex-wrap gap-3 items-center">
        <span class="text-sm text-gray-500 font-medium">
          {{ sortedReportData.length }}/{{ reportData.length }} {{ t.adminReports.employeesLoaded }}
          · {{ computedFrom() }} → {{ computedTo() }}
        </span>
        <div v-if="reportType === 'salarySplit'" class="ms-auto">
          <AppButton variant="secondary" size="sm" @click="exportSalarySplit(computedFrom(), computedTo(), i18n.locale)">
            <svg class="w-4 h-4 me-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            </svg>
            {{ t.adminReports.exportExcel }}
          </AppButton>
        </div>
        <div v-else class="flex gap-2 ms-auto">
          <AppButton variant="secondary" size="sm" @click="doExportExcel">
            <svg class="w-4 h-4 me-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            </svg>
            {{ t.adminReports.exportExcel }}
          </AppButton>
          <AppButton variant="secondary" size="sm" @click="doExportPdf">
            <svg class="w-4 h-4 me-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
            </svg>
            {{ t.adminReports.exportPdf }}
          </AppButton>
        </div>
      </div>

      <!-- Summary preview table -->
      <div class="card overflow-x-auto">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-widest">{{ t.adminReports.preview }}</h2>
          <div class="flex gap-1.5">
            <button
              class="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
              :class="sortBy === 'name' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
              @click="sortBy = 'name'"
            >{{ t.adminReports.sortByName }}</button>
            <button
              class="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
              :class="sortBy === 'number' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
              @click="sortBy = 'number'"
            >{{ t.adminReports.sortByNumber }}</button>
          </div>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100 text-xs text-gray-500">
              <th class="pb-2 font-medium text-start">{{ t.admin.firstName }} {{ t.admin.name }}</th>
              <th class="pb-2 font-medium text-end">{{ t.adminReports.daysWorked }}</th>
              <th class="pb-2 font-medium text-end">{{ t.adminReports.hoursWorked }}</th>
              <th class="pb-2 font-medium text-end text-orange-400">125%</th>
              <th class="pb-2 font-medium text-end text-red-400">150%</th>
              <th class="pb-2 font-medium text-end">{{ t.adminReports.hoursToDo }}</th>
              <th class="pb-2 font-medium text-end">{{ t.adminReports.excused }}</th>
              <th class="pb-2 font-medium text-end">{{ t.adminReports.unexcused }}</th>
              <th class="pb-2 font-medium text-end">{{ t.report.km }}</th>
              <th class="pb-2 font-medium text-end">{{ t.report.travelReimbursement }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in sortedReportData"
              :key="r.employee.uid"
              class="border-b border-gray-50 hover:bg-gray-50"
            >
              <td class="py-2.5 font-medium text-gray-800">
                <button class="inline-flex items-center gap-2 hover:text-primary-700 transition-colors group text-start" @click="focusEmployee(r.employee.uid)">
                  <span class="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-xs font-semibold flex items-center justify-center shrink-0 group-hover:bg-primary-200 transition-colors">
                    {{ r.employee.firstName?.charAt(0) }}
                  </span>
                  {{ r.employee.firstName }} {{ r.employee.name }}
                  <span v-if="r.employee.employeeNumber" class="text-xs font-mono text-gray-400">#{{ r.employee.employeeNumber }}</span>
                </button>
              </td>
              <td class="py-2.5 text-end font-mono">{{ r.workDays }}</td>
              <td class="py-2.5 text-end font-mono font-semibold text-primary-700">{{ r.totalHours }}h</td>
              <td class="py-2.5 text-end font-mono text-orange-500">{{ r.hours125 > 0 ? r.hours125 + 'h' : '—' }}</td>
              <td class="py-2.5 text-end font-mono text-red-500">{{ r.hours150 > 0 ? r.hours150 + 'h' : '—' }}</td>
              <td class="py-2.5 text-end font-mono text-gray-500">
                {{ r.employee.contractType === 'percentage' ? r.theoreticalHours + 'h' : '—' }}
              </td>
              <td class="py-2.5 text-end font-mono font-semibold"
                  :class="r.excusedAbsences ? 'text-green-600' : 'text-gray-300'">
                {{ r.excusedAbsences }}
              </td>
              <td class="py-2.5 text-end font-mono font-semibold"
                  :class="r.unexcusedAbsences ? 'text-red-600' : 'text-gray-300'">
                {{ r.unexcusedAbsences }}
              </td>
              <td class="py-2.5 text-end font-mono">{{ r.totalKm }}</td>
              <td class="py-2.5 text-end font-mono text-green-700">{{ r.totalAmount.toFixed(2) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="border-t-2 border-gray-200 font-semibold text-gray-800">
              <td class="pt-3">Total</td>
              <td class="pt-3 text-end font-mono">{{ reportData.reduce((s, r) => s + r.workDays, 0) }}</td>
              <td class="pt-3 text-end font-mono text-primary-700">
                {{ Math.round(reportData.reduce((s, r) => s + r.totalHours, 0) * 100) / 100 }}h
              </td>
              <td class="pt-3 text-end font-mono text-orange-500">
                {{ Math.round(reportData.reduce((s, r) => s + r.hours125, 0) * 100) / 100 }}h
              </td>
              <td class="pt-3 text-end font-mono text-red-500">
                {{ Math.round(reportData.reduce((s, r) => s + r.hours150, 0) * 100) / 100 }}h
              </td>
              <td class="pt-3 text-end font-mono text-gray-500">
                {{ Math.round(reportData.reduce((s, r) => s + r.theoreticalHours, 0) * 100) / 100 }}h
              </td>
              <td class="pt-3 text-end font-mono text-green-600">{{ reportData.reduce((s, r) => s + r.excusedAbsences, 0) }}</td>
              <td class="pt-3 text-end font-mono text-red-600">{{ reportData.reduce((s, r) => s + r.unexcusedAbsences, 0) }}</td>
              <td class="pt-3 text-end font-mono">{{ reportData.reduce((s, r) => s + r.totalKm, 0) }}</td>
              <td class="pt-3 text-end font-mono text-green-700">
                {{ reportData.reduce((s, r) => s + r.totalAmount, 0).toFixed(2) }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- ── Salary Split table ────────────────────────────────────────────────── -->
      <div v-if="reportType === 'salarySplit'" class="card overflow-x-auto">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold text-emerald-800">{{ t.adminReports.salarySplit }}</h2>
          <div class="flex gap-1.5">
            <button
              class="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
              :class="sortBy === 'name' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
              @click="sortBy = 'name'"
            >{{ t.adminReports.sortByName }}</button>
            <button
              class="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
              :class="sortBy === 'number' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
              @click="sortBy = 'number'"
            >{{ t.adminReports.sortByNumber }}</button>
          </div>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-emerald-800 text-white text-xs">
              <th class="px-3 py-2 font-medium text-start">{{ t.admin.employeeNumber }}</th>
              <th class="px-3 py-2 font-medium text-start">{{ t.admin.name }}</th>
              <th class="px-3 py-2 font-medium text-start">{{ t.admin.firstName }}</th>
              <th class="px-3 py-2 font-medium text-end">{{ t.adminReports.daysWorked }}</th>
              <th class="px-3 py-2 font-medium text-end">{{ t.adminReports.hoursWorked }}</th>
              <th class="px-3 py-2 font-medium text-end">{{ t.adminReports.vacationDays }}</th>
              <th class="px-3 py-2 font-medium text-end">{{ t.adminReports.sickDays }}</th>
              <th class="px-3 py-2 font-medium text-end">{{ t.adminReports.childSickDays }}</th>
              <th class="px-3 py-2 font-medium text-end">{{ t.adminReports.miluimDays }}</th>
              <th class="px-3 py-2 font-medium text-end">{{ t.adminReports.travelAmount }}</th>
              <th class="px-3 py-2 font-medium text-end">{{ t.adminReports.saturdayHours150 }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in sortedReportData"
              :key="r.employee.uid"
              class="border-b border-gray-100 hover:bg-emerald-50/40 transition-colors"
            >
              <td class="px-3 py-2 font-mono text-gray-500 text-xs">{{ r.employee.employeeNumber ?? '—' }}</td>
              <td class="px-3 py-2 font-medium text-gray-800">{{ r.employee.name }}</td>
              <td class="px-3 py-2 text-gray-700">{{ r.employee.firstName }}</td>
              <td class="px-3 py-2 text-end font-mono">{{ r.workDays }}</td>
              <td class="px-3 py-2 text-end font-mono font-semibold text-primary-700">{{ r.totalHours }}h</td>
              <td class="px-3 py-2 text-end font-mono">
                <span :class="absenceCount(r.logs, 'vacation') ? 'text-blue-600' : 'text-gray-300'">
                  {{ absenceCount(r.logs, 'vacation') || '—' }}
                </span>
              </td>
              <td class="px-3 py-2 text-end font-mono">
                <span :class="absenceCount(r.logs, 'sick') ? 'text-amber-600' : 'text-gray-300'">
                  {{ absenceCount(r.logs, 'sick') || '—' }}
                </span>
              </td>
              <td class="px-3 py-2 text-end font-mono">
                <span :class="absenceCount(r.logs, 'childSick') ? 'text-amber-600' : 'text-gray-300'">
                  {{ absenceCount(r.logs, 'childSick') || '—' }}
                </span>
              </td>
              <td class="px-3 py-2 text-end font-mono">
                <span :class="absenceCount(r.logs, 'miluim') ? 'text-purple-600' : 'text-gray-300'">
                  {{ absenceCount(r.logs, 'miluim') || '—' }}
                </span>
              </td>
              <td class="px-3 py-2 text-end font-mono text-green-700">{{ r.totalAmount.toFixed(2) }}</td>
              <td class="px-3 py-2 text-end font-mono">
                <span :class="saturdayHoursForLogs(r.logs) ? 'text-red-600 font-semibold' : 'text-gray-300'">
                  {{ saturdayHoursForLogs(r.logs) ? saturdayHoursForLogs(r.logs) + 'h' : '—' }}
                </span>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="bg-emerald-50 border-t-2 border-emerald-200 font-semibold text-gray-800 text-xs">
              <td class="px-3 py-2" colspan="3">Total</td>
              <td class="px-3 py-2 text-end font-mono">{{ reportData.reduce((s, r) => s + r.workDays, 0) }}</td>
              <td class="px-3 py-2 text-end font-mono text-primary-700">
                {{ Math.round(reportData.reduce((s, r) => s + r.totalHours, 0) * 100) / 100 }}h
              </td>
              <td class="px-3 py-2 text-end font-mono text-blue-600">
                {{ reportData.reduce((s, r) => s + absenceCount(r.logs, 'vacation'), 0) || '—' }}
              </td>
              <td class="px-3 py-2 text-end font-mono text-amber-600">
                {{ reportData.reduce((s, r) => s + absenceCount(r.logs, 'sick'), 0) || '—' }}
              </td>
              <td class="px-3 py-2 text-end font-mono text-amber-600">
                {{ reportData.reduce((s, r) => s + absenceCount(r.logs, 'childSick'), 0) || '—' }}
              </td>
              <td class="px-3 py-2 text-end font-mono text-purple-600">
                {{ reportData.reduce((s, r) => s + absenceCount(r.logs, 'miluim'), 0) || '—' }}
              </td>
              <td class="px-3 py-2 text-end font-mono text-green-700">
                {{ reportData.reduce((s, r) => s + r.totalAmount, 0).toFixed(2) }}
              </td>
              <td class="px-3 py-2 text-end font-mono text-red-600">
                {{ Math.round(reportData.reduce((s, r) => s + saturdayHoursForLogs(r.logs), 0) * 100) / 100 || '—' }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Detailed preview (expandable per employee) -->
      <div v-if="reportType === 'detailed'" class="space-y-4">
        <div v-for="r in sortedReportData" :key="r.employee.uid" class="card">
          <h3 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <button class="inline-flex items-center gap-2 hover:text-primary-700 transition-colors group" @click="focusEmployee(r.employee.uid)">
              <span class="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-xs font-semibold flex items-center justify-center group-hover:bg-primary-200 transition-colors">
                {{ r.employee.firstName?.charAt(0) }}
              </span>
              {{ r.employee.firstName }} {{ r.employee.name }}
            </button>
            <span class="ms-auto text-xs text-gray-400 font-normal">
              {{ r.workDays }} {{ t.adminReports.daysWorked }} · {{ Math.round((r.totalHours + r.absenceEquivalentHours) * 100) / 100 }}h
              <template v-if="r.excusedAbsences">   · <span class="text-green-600">{{ r.excusedAbsences }} {{ t.adminReports.excused }}</span></template>
              <template v-if="r.unexcusedAbsences"> · <span class="text-red-600">{{ r.unexcusedAbsences }} {{ t.adminReports.unexcused }}</span></template>
            </span>
          </h3>
          <div v-if="!r.logs.length" class="text-sm text-gray-400 text-center py-2">{{ t.report.noData }}</div>
          <table v-else class="w-full text-xs">
            <thead>
              <tr class="border-b border-gray-100 text-gray-500">
                <th class="pb-1.5 font-medium text-start">{{ t.report.date }}</th>
                <th class="pb-1.5 font-medium text-start">{{ t.adminReports.sessions }}</th>
                <th class="pb-1.5 font-medium text-end">{{ t.report.hours }}</th>
                <th class="pb-1.5 font-medium text-end text-orange-400">125%</th>
                <th class="pb-1.5 font-medium text-end text-red-400">150%</th>
                <th class="pb-1.5 font-medium text-start">{{ t.report.type }}</th>
                <th class="pb-1.5 font-medium text-end">{{ t.report.km }}</th>
                <th class="pb-1.5 font-medium text-end">{{ t.report.amount }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="log in r.logs"
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
                <td class="py-1.5">
                  {{ log.date }}
                  <span v-if="isUnclosed(log)" class="ms-1 text-red-400 text-xs" :title="t.report.unclosedSession">●</span>
                </td>
                <td class="py-1.5 font-mono text-gray-600">
                  <template v-if="log.type === 'work'">
                    <template v-if="log.sessions?.length">
                      <span v-for="(s, idx) in log.sessions" :key="idx" class="block">
                        {{ fmtTime(s.clockIn) }} → {{ fmtTime(s.clockOut) }}
                      </span>
                    </template>
                    <template v-else-if="log.clockIn">
                      {{ fmtTime(log.clockIn) }} → {{ fmtTime(log.clockOut) }}
                    </template>
                  </template>
                  <span v-else class="text-gray-400">—</span>
                </td>
                <td class="py-1.5 text-end font-mono">
                  {{ log.type === 'work' ? (log.totalDecimalHours ?? 0) + 'h' : '—' }}
                </td>
                <td class="py-1.5 text-end font-mono text-orange-500">
                  {{ logSplit(log).h125 > 0 ? logSplit(log).h125 + 'h' : '—' }}
                </td>
                <td class="py-1.5 text-end font-mono text-red-500">
                  {{ logSplit(log).h150 > 0 ? logSplit(log).h150 + 'h' : '—' }}
                </td>
                <td class="py-1.5">
                  <template v-if="log.type === 'holiday'">
                    <span class="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">
                      {{ log.holidayDayType === 'half' ? t.report.halfPublicHoliday : t.report.publicHoliday }}
                    </span>
                    <span class="ms-1 text-xs text-indigo-500">
                      {{ i18n.locale === 'he' ? log.holidayNameHe : log.holidayNameEn }}
                    </span>
                  </template>
                  <span
                    v-else
                    class="text-xs px-2 py-0.5 rounded-full font-medium"
                    :class="{
                      'bg-green-100 text-green-700': log.type === 'work' && !log.isRemote,
                      'bg-blue-100 text-blue-700':   log.type === 'work' && log.isRemote,
                      'bg-amber-100 text-amber-700': log.type === 'absence'
                    }"
                  >
                    {{ log.type === 'absence' ? getReasonLabel(log.absenceReason ?? '') || t.report.absence : log.isRemote ? t.report.remote : t.report.work }}
                  </span>
                </td>
                <td class="py-1.5 text-end">
                  <span v-if="log.type === 'work' && log.isRemote && !Number(log.kmForDay)"
                        class="inline-flex items-center gap-1 text-blue-500 text-xs font-medium">
                    <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
                    </svg>
                    {{ i18n.locale === 'he' ? 'בית' : 'home' }}
                  </span>
                  <span v-else class="font-mono">{{ Number(log.kmForDay ?? 0) }}</span>
                </td>
                <td class="py-1.5 text-end font-mono text-green-700">
                  {{ (Number(log.kmForDay ?? 0) * (settings?.kmPrice ?? 0)).toFixed(2) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </template>

    <!-- Empty state -->
    <div v-else-if="generated && !reportData.length" class="card text-center py-12 text-gray-400 text-sm">
      {{ t.report.noData }}
    </div>

  </div>
</template>
