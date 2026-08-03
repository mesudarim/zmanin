<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { useSettingsStore } from '@/stores/settings'
import type { AbsenceReason } from '@/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'

const i18n = useI18nStore()
const settingsStore = useSettingsStore()
const t = computed(() => i18n.t)

const saving = ref(false)
const saved = ref(false)

const kmPrice = ref(0.5)
const weeklyHoursBase = ref(40)
const useFixedMonthlyHours = ref(false)
const fixedMonthlyHours = ref(182)
const reasons    = ref<AbsenceReason[]>([])
const endReasons = ref<AbsenceReason[]>([])

const newReason    = reactive({ labelEn: '', labelHe: '' })
const newEndReason = reactive({ labelEn: '', labelHe: '' })

onMounted(async () => {
  await settingsStore.load()
  kmPrice.value             = settingsStore.settings.kmPrice
  weeklyHoursBase.value     = settingsStore.settings.weeklyHoursBase
  useFixedMonthlyHours.value = settingsStore.settings.useFixedMonthlyHours
  fixedMonthlyHours.value   = settingsStore.settings.fixedMonthlyHours || 182
  reasons.value        = [...settingsStore.settings.absenceReasons]
  endReasons.value     = [...(settingsStore.settings.endReasons ?? [])]
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
    absenceReasons: reasons.value,
    endReasons: endReasons.value
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
