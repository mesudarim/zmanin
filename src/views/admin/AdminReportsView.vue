<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { useAdminReport } from '@/composables/useAdminReport'
import AppButton from '@/components/ui/AppButton.vue'

const i18n = useI18nStore()
const t    = computed(() => i18n.t)

const { loading, allEmployees, reportData, settings, loadEmployees, generate, exportExcel, exportPdf } = useAdminReport()

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
const reportType = ref<'summary' | 'detailed'>('summary')

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
            v-for="emp in allEmployees"
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
        </div>
        <p class="text-xs text-gray-400 mt-1">
          {{ reportType === 'summary' ? t.adminReports.summaryHint : t.adminReports.detailedHint }}
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

      <!-- Export actions -->
      <div class="flex flex-wrap gap-3 items-center">
        <span class="text-sm text-gray-500 font-medium">
          {{ reportData.length }} {{ t.adminReports.employeesLoaded }}
          · {{ computedFrom() }} → {{ computedTo() }}
        </span>
        <div class="flex gap-2 ms-auto">
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
        <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">{{ t.adminReports.preview }}</h2>
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100 text-xs text-gray-500">
              <th class="pb-2 font-medium text-start">{{ t.admin.firstName }} {{ t.admin.name }}</th>
              <th class="pb-2 font-medium text-end">{{ t.adminReports.daysWorked }}</th>
              <th class="pb-2 font-medium text-end">{{ t.adminReports.hoursWorked }}</th>
              <th class="pb-2 font-medium text-end">{{ t.adminReports.hoursToDo }}</th>
              <th class="pb-2 font-medium text-end">{{ t.adminReports.excused }}</th>
              <th class="pb-2 font-medium text-end">{{ t.adminReports.unexcused }}</th>
              <th class="pb-2 font-medium text-end">{{ t.report.km }}</th>
              <th class="pb-2 font-medium text-end">{{ t.report.travelReimbursement }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in reportData"
              :key="r.employee.uid"
              class="border-b border-gray-50 hover:bg-gray-50"
            >
              <td class="py-2.5 font-medium text-gray-800">
                <span class="inline-flex items-center gap-2">
                  <span class="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-xs font-semibold flex items-center justify-center shrink-0">
                    {{ r.employee.firstName?.charAt(0) }}
                  </span>
                  {{ r.employee.firstName }} {{ r.employee.name }}
                </span>
              </td>
              <td class="py-2.5 text-end font-mono">{{ r.workDays }}</td>
              <td class="py-2.5 text-end font-mono font-semibold text-primary-700">{{ r.totalHours }}h</td>
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

      <!-- Detailed preview (expandable per employee) -->
      <div v-if="reportType === 'detailed'" class="space-y-4">
        <div v-for="r in reportData" :key="r.employee.uid" class="card">
          <h3 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span class="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-xs font-semibold flex items-center justify-center">
              {{ r.employee.firstName?.charAt(0) }}
            </span>
            {{ r.employee.firstName }} {{ r.employee.name }}
            <span class="ms-auto text-xs text-gray-400 font-normal">
              {{ r.workDays }} jours · {{ r.totalHours }}h
              <template v-if="r.excusedAbsences">   · <span class="text-green-600">{{ r.excusedAbsences }} excusée{{ r.excusedAbsences > 1 ? 's' : '' }}</span></template>
              <template v-if="r.unexcusedAbsences"> · <span class="text-red-600">{{ r.unexcusedAbsences }} non excusée{{ r.unexcusedAbsences > 1 ? 's' : '' }}</span></template>
            </span>
          </h3>
          <div v-if="!r.logs.length" class="text-sm text-gray-400 text-center py-2">{{ t.report.noData }}</div>
          <table v-else class="w-full text-xs">
            <thead>
              <tr class="border-b border-gray-100 text-gray-500">
                <th class="pb-1.5 font-medium text-start">{{ t.report.date }}</th>
                <th class="pb-1.5 font-medium text-start">{{ t.adminReports.sessions }}</th>
                <th class="pb-1.5 font-medium text-end">{{ t.report.hours }}</th>
                <th class="pb-1.5 font-medium text-start">{{ t.report.type }}</th>
                <th class="pb-1.5 font-medium text-end">{{ t.report.km }}</th>
                <th class="pb-1.5 font-medium text-end">{{ t.report.amount }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in r.logs" :key="log.date" class="border-b border-gray-50">
                <td class="py-1.5">{{ log.date }}</td>
                <td class="py-1.5 font-mono text-gray-600">
                  <template v-if="log.type === 'work'">
                    <template v-if="log.sessions?.length">
                      <span v-for="(s, idx) in log.sessions" :key="idx" class="block">
                        {{ s.clockIn?.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }}
                        →
                        {{ s.clockOut?.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) ?? '…' }}
                      </span>
                    </template>
                    <template v-else-if="log.clockIn">
                      {{ log.clockIn.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }}
                      →
                      {{ log.clockOut?.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) ?? '…' }}
                    </template>
                  </template>
                  <span v-else class="text-gray-400">—</span>
                </td>
                <td class="py-1.5 text-end font-mono">
                  {{ log.type === 'work' ? (log.totalDecimalHours ?? 0) + 'h' : '—' }}
                </td>
                <td class="py-1.5">
                  <span
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
