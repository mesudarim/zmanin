import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getGlobalSettings, updateGlobalSettings } from '@/firebase/firestore'
import type { GlobalSettings } from '@/types'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<GlobalSettings>({
    kmPrice: 0.5,
    weeklyHoursBase: 40,
    useFixedMonthlyHours: false,
    fixedMonthlyHours: 0,
    absenceReasons: [
      { id: 'sickness',       labelEn: 'Sickness',       labelHe: 'מחלה' },
      { id: 'milouim',        labelEn: 'Milouim',        labelHe: 'מילואים' },
      { id: 'child_sickness', labelEn: 'Child sickness', labelHe: 'מחלת ילד' },
      { id: 'vacation',       labelEn: 'Vacation',       labelHe: 'חופשה' }
    ],
    endReasons: [
      { id: 'resignation',  labelEn: 'Resignation',    labelHe: 'התפטרות' },
      { id: 'dismissal',    labelEn: 'Dismissal',      labelHe: 'פיטורים' },
      { id: 'contractEnd',  labelEn: 'End of Contract', labelHe: 'סיום חוזה' }
    ]
  })
  const loaded = ref(false)

  async function load() {
    if (loaded.value) return
    settings.value = await getGlobalSettings()
    loaded.value = true
  }

  async function save(data: Partial<GlobalSettings>) {
    await updateGlobalSettings(data)
    settings.value = { ...settings.value, ...data }
  }

  return { settings, loaded, load, save }
})
