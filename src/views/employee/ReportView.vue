<script setup lang="ts">
import { ref, computed, reactive, onMounted, watch } from 'vue'
import { Timestamp } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth'
import { useI18nStore } from '@/stores/i18n'
import { useSettingsStore } from '@/stores/settings'
import { useReport } from '@/composables/useReport'
import { createOrUpdateTimeLog, deleteTimeLog } from '@/firebase/firestore'
import type { MonthlyReport, TimeLog, TimeLogSession } from '@/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppBadge from '@/components/ui/AppBadge.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppSelect from '@/components/ui/AppSelect.vue'

const auth          = useAuthStore()
const i18n          = useI18nStore()
const settingsStore = useSettingsStore()
const { loading, generateReport, exportCsv } = useReport()
const t = computed(() => i18n.t)

// ── Session helper (mirrors useTimeLog.getSessions) ───────────────────────────
function getSessions(log: TimeLog | null): TimeLogSession[] {
  if (!log) return []
  if (log.sessions?.length) return log.sessions
  if (log.clockIn) return [{ clockIn: log.clockIn, clockOut: log.clockOut ?? null, minutes: log.totalMinutes ?? 0 }]
  return []
}

function tsToTime(ts: Timestamp | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── Period selection ──────────────────────────────────────────────────────────
const now          = new Date()
const selectedYear  = ref(now.getFullYear())
const selectedMonth = ref(now.getMonth() + 1)
const report        = ref<MonthlyReport | null>(null)

const years  = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i)
const months = computed(() => t.value.months.map((label, i) => ({ value: i + 1, label })))

// ── All calendar days merged with logs ────────────────────────────────────────
const allDays = computed(() => {
  const y = selectedYear.value
  const m = selectedMonth.value
  const daysInMonth = new Date(y, m, 0).getDate()
  const logs = report.value?.logs ?? []
  return Array.from({ length: daysInMonth }, (_, i) => {
    const day     = String(i + 1).padStart(2, '0')
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${day}`
    const dow     = new Date(dateStr).getDay()
    return {
      date: dateStr,
      dow,
      isWeekend: dow === 5 || dow === 6,
      log: logs.find(l => l.date === dateStr) ?? null
    }
  })
})

// ── Edit / Add modal ──────────────────────────────────────────────────────────
const showEditModal = ref(false)
const editSaving    = ref(false)
const editDate      = ref('')
const editLogId     = ref<string | null>(null)

const form = reactive({
  type:          'work' as 'work' | 'absence',
  isRemote:      false,
  hasCustomKm:   false,
  customKm:      null as number | null,
  absenceReason: '',
  dateFrom:      '',
  dateTo:        ''
})

const editSessions = ref<{ clockIn: string; clockOut: string }[]>([{ clockIn: '', clockOut: '' }])

function sessionDuration(ci: string, co: string): string {
  if (!ci || !co) return ''
  const [h1, m1] = ci.split(':').map(Number)
  const [h2, m2] = co.split(':').map(Number)
  const m = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (m <= 0) return '—'
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

const totalEditDuration = computed(() => {
  let total = 0
  for (const s of editSessions.value) {
    if (!s.clockIn || !s.clockOut) continue
    const [h1, m1] = s.clockIn.split(':').map(Number)
    const [h2, m2] = s.clockOut.split(':').map(Number)
    const m = (h2 * 60 + m2) - (h1 * 60 + m1)
    if (m > 0) total += m
  }
  if (!total) return ''
  return `${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')} (${(total / 60).toFixed(2)}h)`
})

const conflictingDays = computed(() => {
  if (form.type !== 'absence' || !form.dateFrom || !form.dateTo) return []
  const logs = report.value?.logs ?? []
  const result: string[] = []
  const from = new Date(form.dateFrom)
  const to   = new Date(form.dateTo < form.dateFrom ? form.dateFrom : form.dateTo)
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0]
    if (logs.find(l => l.date === dateStr && l.type === 'work')) result.push(dateStr)
  }
  return result
})

const absenceReasonOptions = computed(() =>
  settingsStore.settings.absenceReasons.map(r => ({
    value: r.id,
    label: i18n.locale === 'he' ? r.labelHe : r.labelEn
  }))
)

function openModal(dateStr: string, log: TimeLog | null) {
  editDate.value  = dateStr
  editLogId.value = log?.id ?? null

  const sessions = getSessions(log)

  form.type          = log?.type ?? 'work'
  form.isRemote      = log?.isRemote ?? false
  editSessions.value = sessions.length
    ? sessions.map(s => ({ clockIn: tsToTime(s.clockIn), clockOut: s.clockOut ? tsToTime(s.clockOut) : '' }))
    : [{ clockIn: '', clockOut: '' }]
  form.hasCustomKm   = log?.customKm !== null && log?.customKm !== undefined
  form.customKm      = log?.customKm ?? null
  form.absenceReason = log?.absenceReason ?? ''
  form.dateFrom      = dateStr
  form.dateTo        = dateStr
  showEditModal.value = true
}

function timeToTs(dateStr: string, timeStr: string): Timestamp | null {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date(dateStr)
  d.setHours(h, m, 0, 0)
  return Timestamp.fromDate(d)
}

async function saveEdit() {
  editSaving.value = true
  const userId = auth.firebaseUser!.uid
  const kmBase = auth.profile?.dailyKmBase ?? 0

  if (form.type === 'absence') {
    const from = new Date(form.dateFrom || editDate.value)
    const rawTo = new Date(form.dateTo || editDate.value)
    const to = rawTo < from ? new Date(from) : rawTo
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      await createOrUpdateTimeLog({
        userId,
        date:             d.toISOString().split('T')[0],
        type:             'absence',
        sessions:         [],
        totalMinutes:     0,
        totalDecimalHours: 0,
        isRemote:         false,
        customKm:         null,
        kmForDay:         0,
        absenceReason:    form.absenceReason
      })
    }
  } else {
    const sessions: TimeLogSession[] = editSessions.value
      .filter(s => s.clockIn)
      .map(s => {
        const clockIn  = timeToTs(editDate.value, s.clockIn)!
        const clockOut = s.clockOut ? timeToTs(editDate.value, s.clockOut) : null
        const minutes  = clockIn && clockOut
          ? Math.max(0, Math.floor((clockOut.toMillis() - clockIn.toMillis()) / 60000))
          : 0
        return { clockIn, clockOut, minutes }
      })
    const totalMinutes      = sessions.reduce((sum, s) => sum + (s.minutes ?? 0), 0)
    const totalDecimalHours = Math.round(totalMinutes / 60 * 100) / 100
    const isRemote = form.isRemote
    const customKm = form.hasCustomKm ? form.customKm : null
    const kmForDay = isRemote ? 0 : customKm !== null ? customKm : kmBase

    await createOrUpdateTimeLog({
      userId,
      date:             editDate.value,
      type:             'work',
      sessions,
      totalMinutes,
      totalDecimalHours,
      isRemote,
      customKm,
      kmForDay,
      absenceReason:    null
    })
  }

  showEditModal.value = false
  editSaving.value    = false
  await load()
}

async function doDelete(logId: string) {
  if (!confirm(i18n.locale === 'he' ? 'למחוק רשומה זו?' : 'Delete this entry?')) return
  await deleteTimeLog(logId)
  await load()
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function hasOpenSession(log: TimeLog | null): boolean {
  if (!log || log.type !== 'work') return false
  return getSessions(log).some(s => !s.clockOut)
}

function getReasonLabel(id: string) {
  const r = settingsStore.settings.absenceReasons.find(x => x.id === id)
  if (!r) return id
  return i18n.locale === 'he' ? r.labelHe : r.labelEn
}

function dowLabel(dow: number): string {
  const en = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const he = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
  return i18n.locale === 'he' ? he[dow] : en[dow]
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function load() {
  if (!auth.profile) return
  await settingsStore.load()
  report.value = await generateReport(auth.profile, selectedYear.value, selectedMonth.value)
}

onMounted(load)
watch([selectedYear, selectedMonth], load)
</script>

<template>
  <div class="page-container space-y-6">
    <h1 class="text-2xl font-bold text-gray-900">{{ t.report.title }}</h1>

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
      <AppButton v-if="report" variant="secondary" size="sm" @click="exportCsv(report!, i18n.locale)">
        {{ t.report.exportCsv }}
      </AppButton>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="card flex items-center justify-center py-12">
      <div class="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>

    <template v-else-if="report">
      <!-- Summary cards -->
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
        <!-- Row 1: worked / excused / effective -->
        <div class="card text-center">
          <p class="text-xs text-gray-500 mb-1">{{ t.report.workedHours }}</p>
          <p class="text-2xl font-bold text-primary-700">{{ report.totalDecimalHours }}h</p>
        </div>
        <div class="card text-center">
          <p class="text-xs text-gray-500 mb-1">{{ t.report.excusedHours }}</p>
          <p class="text-2xl font-bold text-blue-600">{{ report.absenceEquivalentHours }}h</p>
          <p class="text-xs text-gray-400 mt-0.5">{{ report.absenceDays.length }}j</p>
        </div>
        <div class="card text-center">
          <p class="text-xs text-gray-500 mb-1">{{ t.report.effectiveHours }}</p>
          <p class="text-2xl font-bold text-gray-800">
            {{ Math.round((report.totalDecimalHours + report.absenceEquivalentHours) * 100) / 100 }}h
          </p>
        </div>
        <!-- Row 2: theoretical / diff / travel -->
        <div class="card text-center" :class="auth.profile?.contractType !== 'percentage' ? 'opacity-40' : ''">
          <p class="text-xs text-gray-500 mb-1">{{ t.report.theoreticalHours }}</p>
          <p class="text-2xl font-bold text-gray-700">{{ report.theoreticalHours }}h</p>
        </div>
        <div class="card text-center" :class="auth.profile?.contractType !== 'percentage' ? 'opacity-40' : ''">
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

      <!-- Full month table -->
      <div class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100 text-xs text-gray-500">
              <th class="pb-2 font-medium text-start w-24">{{ t.report.date }}</th>
              <th class="pb-2 font-medium text-start">{{ t.report.type }}</th>
              <th class="pb-2 font-medium text-start">{{ t.dashboard.clockIn }} / {{ t.dashboard.clockOut }}</th>
              <th class="pb-2 font-medium text-end">{{ t.report.hours }}</th>
              <th class="pb-2 font-medium text-end">{{ t.report.km }}</th>
              <th class="pb-2 font-medium text-end">{{ t.report.amount }}</th>
              <th class="pb-2 w-16" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="day in allDays"
              :key="day.date"
              :class="[
                'border-b transition-colors',
                day.isWeekend ? 'bg-gray-50/60 text-gray-400' : 'hover:bg-primary-50/30',
                'border-gray-50'
              ]"
            >
              <!-- Date -->
              <td class="py-1.5 pe-2">
                <span class="text-xs font-mono">{{ day.date.slice(8) }}</span>
                <span class="text-xs text-gray-400 ms-1">{{ dowLabel(day.dow) }}</span>
              </td>

              <!-- Type -->
              <td class="py-1.5">
                <AppBadge
                  v-if="day.log"
                  :variant="day.log.type === 'absence' ? 'yellow' : hasOpenSession(day.log) ? 'red' : day.log.isRemote ? 'blue' : 'green'"
                >
                  {{ day.log.type === 'absence'
                      ? getReasonLabel(day.log.absenceReason ?? '')
                      : day.log.isRemote ? t.report.remote : t.report.work }}
                </AppBadge>
                <span v-else class="text-xs text-gray-300">—</span>
              </td>

              <!-- Sessions: Clock In → Clock Out per session -->
              <td class="py-1.5">
                <div v-if="day.log?.type === 'work'" class="space-y-0.5">
                  <div
                    v-for="(s, idx) in getSessions(day.log)"
                    :key="idx"
                    class="text-xs font-mono text-gray-600 flex items-center gap-1"
                  >
                    <span>{{ tsToTime(s.clockIn) }}</span>
                    <span class="text-gray-300">→</span>
                    <span>{{ s.clockOut ? tsToTime(s.clockOut) : '…' }}</span>
                    <span v-if="s.minutes" class="text-gray-400">({{ Math.floor(s.minutes/60) }}h{{ String(s.minutes%60).padStart(2,'0') }})</span>
                  </div>
                </div>
                <span v-else class="text-xs text-gray-300">—</span>
              </td>

              <!-- Total hours -->
              <td class="py-1.5 text-end font-mono text-xs">
                {{ day.log?.type === 'work' && day.log.totalDecimalHours
                    ? day.log.totalDecimalHours + 'h' : '—' }}
              </td>

              <!-- KM -->
              <td class="py-1.5 text-end font-mono text-xs">
                {{ day.log ? (day.log.kmForDay ?? 0) : '—' }}
              </td>

              <!-- Amount -->
              <td class="py-1.5 text-end font-mono text-xs text-green-700">
                {{ day.log ? ((day.log.kmForDay ?? 0) * settingsStore.settings.kmPrice).toFixed(2) : '—' }}
              </td>

              <!-- Actions -->
              <td class="py-1.5 text-end">
                <div class="flex items-center justify-end gap-1">
                  <button
                    v-if="day.log"
                    class="p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                    @click="openModal(day.date, day.log)"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                    </svg>
                  </button>
                  <button
                    v-if="day.log?.id"
                    class="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    @click="doDelete(day.log.id!)"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                  <button
                    v-if="!day.log"
                    class="p-1 rounded text-gray-300 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                    @click="openModal(day.date, null)"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="font-semibold text-gray-900 border-t-2 border-gray-200">
              <td colspan="3" class="pt-3 text-sm">{{ t.report.totalAmount }}</td>
              <td class="pt-3 text-end font-mono text-sm">{{ report.totalDecimalHours }}h</td>
              <td class="pt-3 text-end" />
              <td class="pt-3 text-end font-mono text-sm text-green-700">{{ report.totalKmAmount.toFixed(2) }}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </template>

    <!-- Edit / Add modal -->
    <AppModal
      :show="showEditModal"
      :title="(editLogId ? t.common.edit : '+') + ' — ' + editDate"
      @close="showEditModal = false"
    >
      <div class="space-y-4">
        <!-- Type toggle -->
        <div class="flex gap-2">
          <button
            v-for="type in (['work', 'absence'] as const)"
            :key="type"
            :class="[
              'flex-1 py-2 rounded-xl text-sm font-medium border transition-colors',
              form.type === type
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'
            ]"
            @click="form.type = type"
          >
            {{ type === 'work' ? t.report.work : t.report.absence }}
          </button>
        </div>

        <!-- Work fields -->
        <template v-if="form.type === 'work'">
          <!-- Sessions list -->
          <div class="space-y-2">
            <div class="grid grid-cols-[1.2rem_1fr_auto_1fr_auto_1.5rem] items-center gap-1.5 text-xs text-gray-400 px-0.5">
              <span /><span>{{ t.dashboard.clockIn }}</span><span />
              <span>{{ t.dashboard.clockOut }}</span><span class="col-span-2" />
            </div>
            <div
              v-for="(s, idx) in editSessions"
              :key="idx"
              class="grid grid-cols-[1.2rem_1fr_auto_1fr_auto_1.5rem] items-center gap-1.5"
            >
              <span class="text-xs text-gray-400 text-end">{{ idx + 1 }}.</span>
              <input v-model="s.clockIn" type="time"
                class="rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500" />
              <span class="text-gray-300 text-xs">→</span>
              <input v-model="s.clockOut" type="time"
                class="rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500" />
              <span class="text-xs text-gray-400 tabular-nums w-11 text-center">
                {{ sessionDuration(s.clockIn, s.clockOut) }}
              </span>
              <button
                v-if="editSessions.length > 1"
                class="p-0.5 text-gray-300 hover:text-red-500 transition-colors"
                @click="editSessions.splice(idx, 1)"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </div>
          </div>
          <!-- Add session + total -->
          <div class="flex items-center justify-between">
            <button
              class="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1 transition-colors"
              @click="editSessions.push({ clockIn: '', clockOut: '' })"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              {{ t.dashboard.newSession }}
            </button>
            <span v-if="totalEditDuration" class="text-xs text-gray-500 font-mono">
              = {{ totalEditDuration }}
            </span>
          </div>
          <label class="flex items-center gap-2 cursor-pointer">
            <input v-model="form.isRemote" type="checkbox" class="rounded text-primary-600" />
            <span class="text-sm text-gray-700">🏠 {{ t.dashboard.remoteWork }}</span>
          </label>
          <label v-if="!form.isRemote" class="flex items-center gap-2 cursor-pointer">
            <input v-model="form.hasCustomKm" type="checkbox" class="rounded text-primary-600" />
            <span class="text-sm text-gray-700">🚗 {{ t.dashboard.differentTravel }}</span>
          </label>
          <div v-if="form.hasCustomKm && !form.isRemote" class="flex items-center gap-2 ms-6">
            <input v-model.number="form.customKm" type="number" min="0"
              class="w-24 rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500" />
            <span class="text-sm text-gray-500">km</span>
          </div>
        </template>

        <!-- Absence fields -->
        <template v-else>
          <!-- Date range (only for new entries, not edits) -->
          <div v-if="!editLogId" class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-sm font-medium text-gray-700 block mb-1">{{ t.absence.dateFrom }}</label>
              <input v-model="form.dateFrom" type="date"
                class="block w-full rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500" />
            </div>
            <div>
              <label class="text-sm font-medium text-gray-700 block mb-1">{{ t.absence.dateTo }}</label>
              <input v-model="form.dateTo" type="date" :min="form.dateFrom"
                class="block w-full rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500" />
            </div>
          </div>

          <!-- Conflict warning -->
          <div v-if="conflictingDays.length" class="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
            ⚠️ {{ t.absence.conflictWarning }}
            <span class="font-semibold ms-1">{{ conflictingDays.join(', ') }}</span>
          </div>

          <AppSelect v-model="form.absenceReason" :label="t.absence.reason"
            :placeholder="t.absence.selectReason" :options="absenceReasonOptions" />
        </template>

        <div class="flex gap-3 justify-end pt-1">
          <AppButton variant="secondary" @click="showEditModal = false">{{ t.absence.cancel }}</AppButton>
          <AppButton :loading="editSaving" @click="saveEdit">{{ t.dashboard.save }}</AppButton>
        </div>
      </div>
    </AppModal>
  </div>
</template>
