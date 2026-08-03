import { ref } from 'vue'
import { getTimeLogsForMonth } from '@/firebase/firestore'
import { useSettingsStore } from '@/stores/settings'
import type { MonthlyReport, UserProfile } from '@/types'

export function useReport() {
  const settingsStore = useSettingsStore()
  const loading = ref(false)

  async function generateReport(user: UserProfile, year: number, month: number): Promise<MonthlyReport> {
    loading.value = true
    await settingsStore.load()

    const logs = await getTimeLogsForMonth(user.uid, year, month)
    const settings = settingsStore.settings

    const workLogs = logs.filter(l => l.type === 'work')
    const absenceLogs = logs.filter(l => l.type === 'absence')

    const totalDecimalHours = workLogs.reduce((sum, l) => sum + (l.totalDecimalHours ?? 0), 0)

    // Theoretical hours: only for percentage contracts
    let theoreticalHours = 0
    let dailyBase = 0
    if (user.contractType === 'percentage' && user.contractRate) {
      const rate = user.contractRate / 100
      const workingDays = countWorkingDays(year, month)
      if (settings.useFixedMonthlyHours && settings.fixedMonthlyHours) {
        theoreticalHours = Math.round(settings.fixedMonthlyHours * rate * 100) / 100
      } else {
        const weeklyBase = user.weeklyHoursBase ?? settings.weeklyHoursBase ?? 40
        theoreticalHours = Math.round(((weeklyBase * rate) / 5) * workingDays * 100) / 100
      }
      // A full work day at 100% = 9h; absence days are credited at that rate
      dailyBase = 9 * rate
    }

    // Absence days count as full work days — but weekend absences (Fri/Sat) don't count
    const absenceWeekdayCount = absenceLogs.filter(l => {
      const dow = new Date(l.date).getDay()
      return dow !== 5 && dow !== 6
    }).length
    const absenceEquivalentHours = Math.round(absenceWeekdayCount * dailyBase * 100) / 100
    const hoursDiff = Math.round((totalDecimalHours + absenceEquivalentHours - theoreticalHours) * 100) / 100

    const absenceDays = absenceLogs.map(l => ({
      date: l.date,
      reason: l.absenceReason ?? ''
    }))

    const totalKmAmount = logs.reduce((sum, l) => {
      return sum + Number(l.kmForDay ?? 0) * settings.kmPrice
    }, 0)

    loading.value = false

    return {
      userId: user.uid,
      year,
      month,
      totalDecimalHours: Math.round(totalDecimalHours * 100) / 100,
      absenceEquivalentHours,
      theoreticalHours,
      hoursDiff,
      absenceDays,
      totalKmAmount: Math.round(totalKmAmount * 100) / 100,
      logs
    }
  }

  function countWorkingDays(year: number, month: number): number {
    let count = 0
    const daysInMonth = new Date(year, month, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, month - 1, d).getDay()
      // Sunday=0, Saturday=6 — skip weekends (adjust per country if needed)
      if (day !== 0 && day !== 6) count++
    }
    return count
  }

  function exportCsv(report: MonthlyReport, locale: 'en' | 'he'): void {
    const headers = locale === 'he'
      ? ['תאריך', 'סוג', 'שעת כניסה', 'שעת יציאה', 'שעות', 'ק"מ', 'סכום']
      : ['Date', 'Type', 'Clock In', 'Clock Out', 'Hours', 'KM', 'Amount']

    const rows = report.logs.map(log => {
      const type = log.type === 'absence'
        ? (locale === 'he' ? 'היעדרות' : 'Absence')
        : log.isRemote
          ? (locale === 'he' ? 'עבודה מהבית' : 'Remote')
          : (locale === 'he' ? 'עבודה' : 'Work')
      const clockIn  = log.clockIn  ? log.clockIn.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
      const clockOut = log.clockOut ? log.clockOut.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
      const km     = Number(log.kmForDay ?? 0)
      const amount = km * settingsStore.settings.kmPrice
      return [log.date, type, clockIn, clockOut, log.totalDecimalHours ?? 0, km, amount.toFixed(2)]
    })

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `ZmanIn_report_${report.year}_${String(report.month).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return { loading, generateReport, exportCsv }
}
