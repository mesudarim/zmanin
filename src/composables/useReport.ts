import { ref } from 'vue'
import { getTimeLogsForMonth } from '@/firebase/firestore'
import { useSettingsStore } from '@/stores/settings'
import { splitOvertime } from '@/utils/overtime'
import { computeHolidayDeduction, getHolidayType } from '@/utils/holidays'
import type { MonthlyReport, UserProfile } from '@/types'

export function useReport() {
  const settingsStore = useSettingsStore()
  const loading = ref(false)

  async function generateReport(user: UserProfile, year: number, month: number): Promise<MonthlyReport> {
    loading.value = true
    await settingsStore.load()

    const logs = await getTimeLogsForMonth(user.uid, year, month)
    const settings = settingsStore.settings

    // Inject synthetic holiday entries for any day (incl. weekends) with no existing log
    const yearKey = String(year)
    const monthKey = String(month).padStart(2, '0')
    const yearHolidays = settings.holidays?.[yearKey] ?? {}
    const logDates = new Set(logs.map(l => l.date))
    for (const [date, entry] of Object.entries(yearHolidays)) {
      if (!date.startsWith(`${yearKey}-${monthKey}-`)) continue
      if (logDates.has(date)) continue   // real log exists — keep it, holiday still applies
      logs.push({
        userId: user.uid,
        date,
        type: 'holiday',
        holidayNameHe: entry.nameHe,
        holidayNameEn: entry.nameEn,
        holidayDayType: entry.type
      })
    }
    logs.sort((a, b) => a.date.localeCompare(b.date))

    const workLogs = logs.filter(l => l.type === 'work')
    const absenceLogs = logs.filter(l => l.type === 'absence')

    const totalDecimalHours = workLogs.reduce((sum, l) => sum + (l.totalDecimalHours ?? 0), 0)

    // Overtime split
    const t125 = settings.overtimeThreshold125 ?? 8.6
    const t150 = settings.overtimeThreshold150 ?? 12
    let hoursNormal = 0, hours125 = 0, hours150 = 0
    for (const l of workLogs) {
      const s = splitOvertime(l.date, l.totalDecimalHours ?? 0, t125, t150)
      hoursNormal += s.normal
      hours125    += s.h125
      hours150    += s.h150
    }
    hoursNormal = Math.round(hoursNormal * 100) / 100
    hours125    = Math.round(hours125    * 100) / 100
    hours150    = Math.round(hours150    * 100) / 100

    // Theoretical hours: only for percentage contracts
    let theoreticalHours = 0
    let dailyBase = 0
    if (user.contractType === 'percentage' && user.contractRate) {
      const rate = user.contractRate / 100
      const workingDays = countWorkingDays(year, month)
      let dailyHours: number
      const weeklyBase = user.weeklyHoursBase ?? settings.weeklyHoursBase ?? 40
      dailyHours = (weeklyBase * rate) / 5   // consistent standard day in all modes
      if (settings.useFixedMonthlyHours && settings.fixedMonthlyHours) {
        theoreticalHours = Math.round(settings.fixedMonthlyHours * rate * 100) / 100
      } else {
        theoreticalHours = Math.round(dailyHours * workingDays * 100) / 100
      }
      // Deduct public holidays and erev half-days
      const deduction = computeHolidayDeduction(year, month, dailyHours, settings.holidays)
      theoreticalHours = Math.round(Math.max(0, theoreticalHours - deduction) * 100) / 100
      // A full work day at 100% = 9h; absence days are credited at that rate
      dailyBase = 9 * rate
    }

    // Absence days count as full work days — but weekend absences and absences on public
    // holidays don't count (the holiday already covers those hours)
    const absenceWeekdayCount = absenceLogs.filter(l => {
      const dow = new Date(l.date + 'T12:00:00').getDay()
      if (dow === 5 || dow === 6) return false
      return !getHolidayType(l.date, settings.holidays)  // holiday takes priority
    }).length
    const absenceEquivalentHours = Math.round(absenceWeekdayCount * dailyBase * 100) / 100
    const hoursDiff = Math.round((totalDecimalHours + absenceEquivalentHours - theoreticalHours) * 100) / 100

    const absenceDays = absenceLogs.map(l => ({
      date: l.date,
      reason: l.absenceReason ?? ''
    }))

    const totalKmAmount = logs
      .filter(l => l.type === 'work')
      .reduce((sum, l) => sum + Number(l.kmForDay ?? 0) * settings.kmPrice, 0)

    loading.value = false

    return {
      userId: user.uid,
      year,
      month,
      totalDecimalHours: Math.round(totalDecimalHours * 100) / 100,
      absenceEquivalentHours,
      theoreticalHours,
      hoursDiff,
      hoursNormal,
      hours125,
      hours150,
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
      // Israeli work week: Sun–Thu; Fri(5) and Sat(6) are weekend
      if (day !== 5 && day !== 6) count++
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
