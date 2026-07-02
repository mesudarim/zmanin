<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useI18nStore } from '@/stores/i18n'
import { useSettingsStore } from '@/stores/settings'
import { useTimeLog } from '@/composables/useTimeLog'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppBadge from '@/components/ui/AppBadge.vue'

const auth          = useAuthStore()
const i18n          = useI18nStore()
const settingsStore = useSettingsStore()
const t             = computed(() => i18n.t)

const today = new Date().toISOString().split('T')[0]

const {
  log, loading, saving,
  isClockedIn, isClockedOut,
  getSessions,
  loadLog, clockIn, clockOut, declareAbsence, updateTravelOptions,
  formatTime, formatDuration
} = useTimeLog(today)

// ── Absence modal ────────────────────────────────────────────────────────────
const showAbsenceModal = ref(false)
const selectedReason   = ref('')

// ── Travel options ───────────────────────────────────────────────────────────
const isRemote          = ref(false)
const hasDifferentTravel = ref(false)
const customKm           = ref<number>(0)

const absenceReasonOptions = computed(() =>
  settingsStore.settings.absenceReasons.map(r => ({
    value: r.id,
    label: i18n.locale === 'he' ? r.labelHe : r.labelEn
  }))
)

const isAbsent = computed(() => log.value?.type === 'absence')

const todayLabel = computed(() => {
  return new Date().toLocaleDateString(i18n.locale === 'he' ? 'he-IL' : 'en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })
})

const sessions = computed(() => getSessions(log.value))

// ── Init ─────────────────────────────────────────────────────────────────────
onMounted(async () => {
  await settingsStore.load()
  await loadLog()
  if (log.value) {
    isRemote.value          = log.value.isRemote ?? false
    hasDifferentTravel.value = log.value.customKm !== null && log.value.customKm !== undefined
    customKm.value          = log.value.customKm ?? auth.profile?.dailyKmBase ?? 0
  }
})

// ── Handlers ─────────────────────────────────────────────────────────────────
async function handleAbsenceConfirm() {
  if (!selectedReason.value) return
  await declareAbsence(selectedReason.value)
  showAbsenceModal.value = false
}

async function saveTravelOptions() {
  await updateTravelOptions(isRemote.value, hasDifferentTravel.value ? customKm.value : null)
}

watch([isRemote], () => {
  if (isRemote.value) hasDifferentTravel.value = false
})
</script>

<template>
  <div class="page-container space-y-5">
    <!-- Header -->
    <div>
      <p class="text-sm text-gray-500">{{ t.dashboard.today }} — {{ todayLabel }}</p>
      <h1 class="text-2xl font-bold text-gray-900 mt-1">
        {{ t.dashboard.greeting }}, {{ auth.profile?.firstName }}
      </h1>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="card flex items-center justify-center py-12">
      <div class="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>

    <template v-else>
      <!-- Absence badge -->
      <div v-if="isAbsent" class="card flex items-center gap-3">
        <AppBadge variant="yellow">{{ t.dashboard.absenceRecorded }}</AppBadge>
        <span class="text-sm text-gray-600">
          {{ absenceReasonOptions.find(o => o.value === log?.absenceReason)?.label ?? log?.absenceReason }}
        </span>
      </div>

      <!-- Work card -->
      <div v-else class="card space-y-5">

        <!-- Sessions list -->
        <div v-if="sessions.length" class="space-y-1.5">
          <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">{{ t.dashboard.workTime }}</p>
          <div
            v-for="(s, idx) in sessions"
            :key="idx"
            class="flex items-center gap-2 text-sm"
          >
            <span class="text-gray-400 text-xs w-5 text-end">{{ idx + 1 }}.</span>
            <AppBadge :variant="!s.clockOut ? 'green' : 'blue'">
              {{ formatTime(s.clockIn) }}
              <span v-if="s.clockOut"> → {{ formatTime(s.clockOut) }}</span>
              <span v-else class="animate-pulse"> ●</span>
            </AppBadge>
            <span v-if="s.minutes" class="text-xs text-gray-500">
              {{ formatDuration(s.minutes) }}
            </span>
          </div>

          <!-- Day total -->
          <div v-if="log?.totalMinutes" class="flex items-center gap-2 pt-1 border-t border-gray-100">
            <span class="text-xs text-gray-400 w-5" />
            <span class="text-sm font-semibold text-primary-700">
              = {{ formatDuration(log.totalMinutes) }}
              <span class="text-gray-400 text-xs ms-1 font-normal">({{ log.totalDecimalHours }}h)</span>
            </span>
          </div>
        </div>

        <!-- Clock buttons -->
        <div class="flex gap-3 flex-wrap">
          <!-- Clock In — shown when no active session -->
          <AppButton
            v-if="!isClockedIn"
            size="lg"
            :loading="saving"
            @click="clockIn"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            {{ t.dashboard.clockIn }}
            <span v-if="isClockedOut" class="text-xs opacity-75 ms-1">({{ t.dashboard.newSession ?? 'new session' }})</span>
          </AppButton>

          <!-- Clock Out — shown when active session -->
          <AppButton
            v-else
            variant="danger"
            size="lg"
            :loading="saving"
            @click="clockOut"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10h6v4H9z"/>
            </svg>
            {{ t.dashboard.clockOut }}
          </AppButton>
        </div>

        <!-- Travel options -->
        <div class="border-t border-gray-100 pt-4 space-y-3">
          <label class="flex items-center gap-3 cursor-pointer group">
            <div class="relative">
              <input v-model="isRemote" type="checkbox" class="sr-only peer" />
              <div class="w-10 h-6 bg-gray-200 peer-checked:bg-primary-600 rounded-full transition-colors" />
              <div class="absolute start-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
            </div>
            <span class="text-sm font-medium text-gray-700">🏠 {{ t.dashboard.remoteWork }}</span>
          </label>

          <label v-if="!isRemote" class="flex items-center gap-3 cursor-pointer group">
            <div class="relative">
              <input v-model="hasDifferentTravel" type="checkbox" class="sr-only peer" />
              <div class="w-10 h-6 bg-gray-200 peer-checked:bg-primary-600 rounded-full transition-colors" />
              <div class="absolute start-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
            </div>
            <span class="text-sm font-medium text-gray-700">🚗 {{ t.dashboard.differentTravel }}</span>
          </label>

          <div v-if="hasDifferentTravel && !isRemote" class="flex items-center gap-3 ms-13 ps-1">
            <input
              v-model.number="customKm"
              type="number" min="0"
              class="w-24 rounded-xl border-gray-300 text-sm focus:border-primary-500 focus:ring-primary-500"
            />
            <span class="text-sm text-gray-500">{{ t.dashboard.kmForDay }}</span>
          </div>

          <p v-if="!isRemote" class="text-xs text-gray-400">
            {{ t.dashboard.kmForDay }}:
            <strong class="text-gray-600">
              {{ isRemote ? 0 : hasDifferentTravel ? customKm : auth.profile?.dailyKmBase ?? 0 }} km
            </strong>
          </p>

          <AppButton variant="secondary" size="sm" :loading="saving" @click="saveTravelOptions">
            {{ t.dashboard.save }}
          </AppButton>
        </div>
      </div>

      <!-- Declare absence button — only if no entry at all today -->
      <div v-if="!isAbsent && !sessions.length">
        <AppButton variant="ghost" @click="showAbsenceModal = true">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636"/>
          </svg>
          {{ t.dashboard.declareAbsence }}
        </AppButton>
      </div>
    </template>

    <!-- Absence modal -->
    <AppModal :show="showAbsenceModal" :title="t.absence.title" @close="showAbsenceModal = false">
      <div class="space-y-4">
        <AppSelect
          v-model="selectedReason"
          :label="t.absence.reason"
          :placeholder="t.absence.selectReason"
          :options="absenceReasonOptions"
        />
        <div class="flex gap-3 justify-end">
          <AppButton variant="secondary" @click="showAbsenceModal = false">{{ t.absence.cancel }}</AppButton>
          <AppButton :disabled="!selectedReason" :loading="saving" @click="handleAbsenceConfirm">
            {{ t.absence.confirm }}
          </AppButton>
        </div>
      </div>
    </AppModal>
  </div>
</template>
