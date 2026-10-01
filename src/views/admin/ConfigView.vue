<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { useSettingsStore } from '@/stores/settings'
import { fetchHolidaysFromHebcal } from '@/utils/holidays'
import type { AbsenceReason, HolidayEntry } from '@/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'

const i18n = useI18nStore()
const settingsStore = useSettingsStore()
const t = computed(() => i18n.t)

const saving = ref(false)
const saved = ref(false)

// ── Holidays ─────────────────────────────────────────────────────────────────
const holidayYear      = ref(new Date().getFullYear())
const loadingHolidays  = ref(false)
const holidayLoadError = ref('')
const allHolidays = ref<Record<string, Record<string, HolidayEntry>>>({})

const yearHolidays = computed(() => allHolidays.value[String(holidayYear.value)] ?? {})
const sortedHolidayDates = computed(() =>
  Object.keys(yearHolidays.value).sort()
)

const newHoliday = reactive({ date: '', nameHe: '', nameEn: '', type: 'full' as 'full' | 'half' })

async function loadHolidaysFromHebcal() {
  loadingHolidays.value = true
  holidayLoadError.value = ''
  try {
    const fetched = await fetchHolidaysFromHebcal(holidayYear.value)
    allHolidays.value = {
      ...allHolidays.value,
      [String(holidayYear.value)]: { ...(allHolidays.value[String(holidayYear.value)] ?? {}), ...fetched }
    }
  } catch {
    holidayLoadError.value = t.value.admin.holidayLoadError
  } finally {
    loadingHolidays.value = false
  }
}

function setHolidayType(date: string, type: 'full' | 'half') {
  const yr = String(holidayYear.value)
  allHolidays.value = {
    ...allHolidays.value,
    [yr]: { ...allHolidays.value[yr], [date]: { ...allHolidays.value[yr][date], type } }
  }
}

function removeHoliday(date: string) {
  const yr = String(holidayYear.value)
  const copy = { ...allHolidays.value[yr] }
  delete copy[date]
  allHolidays.value = { ...allHolidays.value, [yr]: copy }
}

function addCustomHoliday() {
  if (!newHoliday.date || !newHoliday.nameHe) return
  const yr = String(holidayYear.value)
  allHolidays.value = {
    ...allHolidays.value,
    [yr]: {
      ...(allHolidays.value[yr] ?? {}),
      [newHoliday.date]: { type: newHoliday.type, nameHe: newHoliday.nameHe, nameEn: newHoliday.nameEn || newHoliday.nameHe }
    }
  }
  newHoliday.date = ''
  newHoliday.nameHe = ''
  newHoliday.nameEn = ''
  newHoliday.type = 'full'
}

const kmPrice = ref(0.5)
const weeklyHoursBase = ref(40)
const useFixedMonthlyHours = ref(false)
const fixedMonthlyHours = ref(182)
const overtimeThreshold125 = ref(8.6)
const overtimeThreshold150 = ref(12)
const reasons    = ref<AbsenceReason[]>([])
const endReasons = ref<AbsenceReason[]>([])

const newReason    = reactive({ labelEn: '', labelHe: '' })
const newEndReason = reactive({ labelEn: '', labelHe: '' })

onMounted(async () => {
  await settingsStore.load()
  kmPrice.value              = settingsStore.settings.kmPrice
  weeklyHoursBase.value      = settingsStore.settings.weeklyHoursBase
  useFixedMonthlyHours.value = settingsStore.settings.useFixedMonthlyHours
  fixedMonthlyHours.value    = settingsStore.settings.fixedMonthlyHours || 182
  overtimeThreshold125.value = settingsStore.settings.overtimeThreshold125 ?? 8.6
  overtimeThreshold150.value = settingsStore.settings.overtimeThreshold150 ?? 12
  reasons.value              = [...settingsStore.settings.absenceReasons]
  endReasons.value           = [...(settingsStore.settings.endReasons ?? [])]
  allHolidays.value          = settingsStore.settings.holidays
    ? JSON.parse(JSON.stringify(settingsStore.settings.holidays))
    : {}
})

function addReason() {
  if (!newReason.labelEn || !newReason.labelHe) return
  reasons.value.push({ id: crypto.randomUUID(), labelEn: newReason.labelEn, labelHe: newReason.labelHe })
  newReason.labelEn = ''
  newReason.labelHe = ''
}

function removeReason(id: string) {
  reasons.value = reasons.value.filter(r => r.id !== id)
}

function addEndReason() {
  if (!newEndReason.labelEn || !newEndReason.labelHe) return
  endReasons.value.push({ id: crypto.randomUUID(), labelEn: newEndReason.labelEn, labelHe: newEndReason.labelHe })
  newEndReason.labelEn = ''
  newEndReason.labelHe = ''
}

function removeEndReason(id: string) {
  endReasons.value = endReasons.value.filter(r => r.id !== id)
}

async function saveConfig() {
  saving.value = true
  saved.value = false
  await settingsStore.save({
    kmPrice: Number(kmPrice.value),
    weeklyHoursBase: Number(weeklyHoursBase.value),
    useFixedMonthlyHours: useFixedMonthlyHours.value,
    fixedMonthlyHours: Number(fixedMonthlyHours.value),
    overtimeThreshold125: Number(overtimeThreshold125.value),
    overtimeThreshold150: Number(overtimeThreshold150.value),
    absenceReasons: reasons.value,
    endReasons: endReasons.value,
    holidays: allHolidays.value
  })
  saving.value = false
  saved.value = true
  setTimeout(() => { saved.value = false }, 3000)
}
</script>

<template>
  <div class="page-container space-y-6 max-w-2xl">
    <h1 class="text-2xl font-bold text-gray-900">{{ t.admin.config }}</h1>

    <!-- KM price -->
    <div class="card space-y-4">
      <h2 class="font-semibold text-gray-800">{{ t.admin.kmPrice }}</h2>
      <div class="flex items-center gap-3">
        <input
          v-model.number="kmPrice"
          type="number"
          min="0"
          step="0.01"
          class="w-32 rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500"
        />
        <span class="text-sm text-gray-500">/ km</span>
      </div>
      <!-- Fixed monthly hours toggle -->
      <div class="border-t border-gray-100 pt-4 space-y-3">
        <label class="flex items-center gap-3 cursor-pointer select-none">
          <div
            class="relative w-10 h-5 rounded-full transition-colors"
            :class="useFixedMonthlyHours ? 'bg-primary-600' : 'bg-gray-200'"
            @click="useFixedMonthlyHours = !useFixedMonthlyHours"
          >
            <span
              class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
              :class="useFixedMonthlyHours ? 'translate-x-5' : 'translate-x-0'"
            />
          </div>
          <span class="text-sm font-medium text-gray-700">{{ t.admin.useFixedMonthlyHours }}</span>
        </label>

        <Transition name="fade">
          <div v-if="useFixedMonthlyHours" class="flex items-center gap-3 ps-13">
            <input
              v-model.number="fixedMonthlyHours"
              type="number"
              min="1"
              class="w-28 rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500"
            />
            <span class="text-sm text-gray-500">{{ t.admin.fixedMonthlyHoursUnit }}</span>
          </div>
        </Transition>

        <Transition name="fade">
          <div v-if="!useFixedMonthlyHours" class="flex items-center gap-3">
            <label class="text-sm font-medium text-gray-700">{{ t.admin.weeklyHours }}</label>
            <input
              v-model.number="weeklyHoursBase"
              type="number"
              min="1"
              max="48"
              class="w-24 rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500"
            />
          </div>
        </Transition>
      </div>
    </div>

    <!-- Overtime thresholds -->
    <div class="card space-y-4">
      <h2 class="font-semibold text-gray-800">{{ t.admin.overtimeThresholds }}</h2>
      <p class="text-xs text-gray-400">{{ t.admin.saturdayOvertimeNote }}</p>
      <div class="grid grid-cols-2 gap-4">
        <div class="flex items-center gap-3">
          <label class="text-sm font-medium text-gray-700 w-40">{{ t.admin.threshold125 }}</label>
          <input
            v-model.number="overtimeThreshold125"
            type="number" min="1" max="24" step="0.1"
            class="w-24 rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
          <span class="text-sm text-gray-400">h</span>
        </div>
        <div class="flex items-center gap-3">
          <label class="text-sm font-medium text-gray-700 w-40">{{ t.admin.threshold150 }}</label>
          <input
            v-model.number="overtimeThreshold150"
            type="number" min="1" max="24" step="0.1"
            class="w-24 rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
          <span class="text-sm text-gray-400">h</span>
        </div>
      </div>
    </div>

    <!-- Absence reasons -->
    <div class="card space-y-4">
      <h2 class="font-semibold text-gray-800">{{ t.admin.absenceReasons }}</h2>

      <ul class="space-y-2">
        <li
          v-for="r in reasons"
          :key="r.id"
          class="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2"
        >
          <div>
            <span class="text-sm font-medium text-gray-800">{{ r.labelEn }}</span>
            <span class="text-xs text-gray-400 ms-2">/ {{ r.labelHe }}</span>
          </div>
          <AppButton variant="ghost" size="sm" @click="removeReason(r.id)">
            <svg class="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </AppButton>
        </li>
      </ul>

      <!-- Add reason row -->
      <div class="flex gap-2 items-end flex-wrap">
        <AppInput v-model="newReason.labelEn" :label="t.admin.labelEn" class="flex-1 min-w-32" />
        <AppInput v-model="newReason.labelHe" :label="t.admin.labelHe" class="flex-1 min-w-32" />
        <AppButton variant="secondary" size="sm" @click="addReason">+ {{ t.admin.addReason }}</AppButton>
      </div>
    </div>

    <!-- End of employment reasons -->
    <div class="card space-y-4">
      <h2 class="font-semibold text-gray-800">{{ t.admin.endReasons }}</h2>

      <ul class="space-y-2">
        <li
          v-for="r in endReasons"
          :key="r.id"
          class="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2"
        >
          <div>
            <span class="text-sm font-medium text-gray-800">{{ r.labelEn }}</span>
            <span class="text-xs text-gray-400 ms-2">/ {{ r.labelHe }}</span>
          </div>
          <AppButton variant="ghost" size="sm" @click="removeEndReason(r.id)">
            <svg class="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </AppButton>
        </li>
      </ul>

      <div class="flex gap-2 items-end flex-wrap">
        <AppInput v-model="newEndReason.labelEn" :label="t.admin.labelEn" class="flex-1 min-w-32" />
        <AppInput v-model="newEndReason.labelHe" :label="t.admin.labelHe" class="flex-1 min-w-32" />
        <AppButton variant="secondary" size="sm" @click="addEndReason">+ {{ t.admin.addEndReason }}</AppButton>
      </div>
    </div>

    <!-- Public Holidays -->
    <div class="card space-y-4">
      <div>
        <h2 class="font-semibold text-gray-800">{{ t.admin.holidays }}</h2>
        <p class="text-xs text-gray-400 mt-1">{{ t.admin.holidaysHint }}</p>
      </div>

      <!-- Year selector + Hebcal button -->
      <div class="flex items-center gap-3 flex-wrap">
        <label class="text-sm font-medium text-gray-700">{{ t.admin.holidayYear }}</label>
        <input
          v-model.number="holidayYear"
          type="number"
          min="2020"
          max="2035"
          class="w-24 rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500"
        />
        <AppButton variant="secondary" size="sm" :loading="loadingHolidays" @click="loadHolidaysFromHebcal">
          {{ loadingHolidays ? t.admin.loadingHolidays : t.admin.loadFromHebcal }}
        </AppButton>
        <span v-if="holidayLoadError" class="text-xs text-red-500">{{ holidayLoadError }}</span>
      </div>

      <!-- Holiday list -->
      <div v-if="sortedHolidayDates.length === 0" class="text-sm text-gray-400 italic">
        {{ t.admin.noHolidaysLoaded }}
      </div>
      <ul v-else class="space-y-1.5 max-h-72 overflow-y-auto">
        <li
          v-for="date in sortedHolidayDates"
          :key="date"
          class="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2"
        >
          <span class="text-xs font-mono text-gray-500 w-24 shrink-0">{{ date }}</span>
          <span class="text-sm text-gray-800 flex-1 min-w-0 truncate" :title="yearHolidays[date].nameEn">
            {{ yearHolidays[date].nameHe }}
          </span>
          <!-- Full / Half toggle -->
          <button
            class="px-2 py-0.5 rounded-lg text-xs font-medium transition-colors"
            :class="yearHolidays[date].type === 'full'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-500 hover:bg-blue-50'"
            @click="setHolidayType(date, 'full')"
          >{{ t.admin.holidayFull }}</button>
          <button
            class="px-2 py-0.5 rounded-lg text-xs font-medium transition-colors"
            :class="yearHolidays[date].type === 'half'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-gray-100 text-gray-500 hover:bg-amber-50'"
            @click="setHolidayType(date, 'half')"
          >{{ t.admin.holidayHalf }}</button>
          <button class="text-gray-300 hover:text-red-400 transition-colors ms-1" @click="removeHoliday(date)">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </li>
      </ul>

      <!-- Add custom holiday -->
      <div class="flex gap-2 items-end flex-wrap border-t border-gray-100 pt-3">
        <div>
          <label class="text-xs text-gray-500 block mb-1">{{ t.admin.holidayDate }}</label>
          <input
            v-model="newHoliday.date"
            type="date"
            class="rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>
        <AppInput v-model="newHoliday.nameHe" label="שם (עברית)" class="w-36" />
        <AppInput v-model="newHoliday.nameEn" label="Name (EN)" class="w-32" />
        <div>
          <label class="text-xs text-gray-500 block mb-1">{{ t.admin.holidayType }}</label>
          <select
            v-model="newHoliday.type"
            class="rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500"
          >
            <option value="full">{{ t.admin.holidayFull }}</option>
            <option value="half">{{ t.admin.holidayHalf }}</option>
          </select>
        </div>
        <AppButton variant="secondary" size="sm" @click="addCustomHoliday">
          + {{ t.admin.addCustomHoliday }}
        </AppButton>
      </div>
    </div>

    <!-- Save -->
    <div class="flex items-center gap-3">
      <AppButton :loading="saving" @click="saveConfig">{{ t.admin.saveConfig }}</AppButton>
      <Transition name="fade">
        <span v-if="saved" class="text-sm text-green-600">✓ {{ t.admin.configSaved }}</span>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
