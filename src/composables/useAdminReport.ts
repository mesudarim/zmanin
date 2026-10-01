import { ref } from 'vue'
import * as XLSX from 'xlsx'
import { getAllEmployees, getTimeLogsForDateRange, getGlobalSettings } from '@/firebase/firestore'
import { splitOvertime } from '@/utils/overtime'
import { computeHolidayDeductionForRange } from '@/utils/holidays'
import type { UserProfile, TimeLog, GlobalSettings, AbsenceReason } from '@/types'
import type { Timestamp } from 'firebase/firestore'

export interface EmployeeReportData {
  employee: UserProfile
  logs: TimeLog[]
  workDays: number
  excusedAbsences: number
  unexcusedAbsences: number
  theoreticalHours: number
  absenceEquivalentHours: number
  totalHours: number
  hoursNormal: number
  hours125:    number
  hours150:    number
  totalKm: number
  totalAmount: number
}

export function useAdminReport() {
  const loading = ref(false)
  const allEmployees = ref<UserProfile[]>([])
  const reportData = ref<EmployeeReportData[]>([])
  const settings = ref<GlobalSettings | null>(null)

  async function loadEmployees() {
    allEmployees.value = await getAllEmployees()
  }

  function countWorkingDays(from: string, to: string): number {
    let count = 0
    const end = new Date(to)
    for (const d = new Date(from); d <= end; d.setDate(d.getDate() + 1)) {
      const day = d.getDay()
      if (day !== 5 && day !== 6) count++   // Israeli weekend: Fri + Shabbat
    }
    return count
  }

  // Formats a Date as YYYY-MM-DD using LOCAL time (avoids UTC-offset shift from toISOString)
  function localDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  // Prorates fixedMonthlyHours over a date range by counting working days per calendar month
  function fixedHoursForRange(from: string, to: string, rate: number, fixedMonthlyHours: number): number {
    let total = 0
    const start = new Date(from)
    const end   = new Date(to)
    const cur   = new Date(start.getFullYear(), start.getMonth(), 1)
    while (cur <= end) {
      const mStart = new Date(cur)
      const mEnd   = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
      const rStart = mStart < start ? start : mStart
      const rEnd   = mEnd   > end   ? end   : mEnd
      const inRange = countWorkingDays(localDateStr(rStart), localDateStr(rEnd))
      const inMonth = countWorkingDays(localDateStr(mStart), localDateStr(mEnd))
      if (inMonth > 0) total += fixedMonthlyHours * rate * (inRange / inMonth)
      cur.setMonth(cur.getMonth() + 1)
    }
    return Math.round(total * 100) / 100
  }

  async function generate(selectedUids: string[], from: string, to: string) {
    loading.value = true
    settings.value = await getGlobalSettings()
    const employees = allEmployees.value.filter(e => selectedUids.includes(e.uid))
    const workingDays = countWorkingDays(from, to)

    const results = await Promise.all(
      employees.map(async (employee) => {
        const logs = await getTimeLogsForDateRange(employee.uid, from, to)

        // Inject synthetic holiday entries (same logic as useReport.ts)
        const logDates = new Set(logs.map(l => l.date))
        const rangeStart = new Date(from + 'T12:00:00')
        const rangeEnd   = new Date(to   + 'T12:00:00')
        for (const yearMap of Object.values(settings.value?.holidays ?? {})) {
          for (const [dateStr, entry] of Object.entries(yearMap)) {
            if (logDates.has(dateStr)) continue
            const d = new Date(dateStr + 'T12:00:00')
            if (d < rangeStart || d > rangeEnd) continue
            logs.push({
              userId: employee.uid,
              date: dateStr,
              type: 'holiday',
              holidayNameHe: entry.nameHe,
              holidayNameEn: entry.nameEn,
              holidayDayType: entry.type
            })
          }
        }
        logs.sort((a, b) => a.date.localeCompare(b.date))

        const workLogs    = logs.filter(l => l.type === 'work')
        const absenceLogs = logs.filter(l => l.type === 'absence')

        const excusedAbsences   = absenceLogs.filter(l => l.absenceReason).length
        const unexcusedAbsences = absenceLogs.filter(l => !l.absenceReason).length

        const totalHours = Math.round(workLogs.reduce((s, l) => s + (l.totalDecimalHours ?? 0), 0) * 100) / 100
        const totalKm    = workLogs.reduce((s, l) => s + Number(l.kmForDay ?? 0), 0)
        const totalAmount = Math.round(totalKm * settings.value!.kmPrice * 100) / 100

        const s = settings.value!
        const isPercentage = employee.contractType === 'percentage' && employee.contractRate
        const rate = isPercentage ? employee.contractRate! / 100 : 1

        // Hourly employees have no fixed hours-to-do target
        let theoreticalHours = 0
        if (isPercentage) {
          const weeklyBase = employee.weeklyHoursBase ?? s.weeklyHoursBase ?? 40
          // Standard contractual daily hours — same formula in all modes for consistency
          const getDailyHours = (_y: number, _m: number) => (weeklyBase * rate) / 5
          const baseHours = s.useFixedMonthlyHours && s.fixedMonthlyHours
            ? fixedHoursForRange(from, to, rate, s.fixedMonthlyHours)
            : Math.round((weeklyBase * rate / 5) * workingDays * 100) / 100
          const deduction = computeHolidayDeductionForRange(from, to, getDailyHours, s.holidays)
          theoreticalHours = Math.round(Math.max(0, baseHours - deduction) * 100) / 100
        }

        // Overtime split
        const t125 = s.overtimeThreshold125 ?? 8.6
        const t150 = s.overtimeThreshold150 ?? 12
        let hoursNormal = 0, hours125 = 0, hours150 = 0
        for (const l of workLogs) {
          const sp = splitOvertime(l.date, l.totalDecimalHours ?? 0, t125, t150)
          hoursNormal += sp.normal; hours125 += sp.h125; hours150 += sp.h150
        }
        hoursNormal = Math.round(hoursNormal * 100) / 100
        hours125    = Math.round(hours125    * 100) / 100
        hours150    = Math.round(hours150    * 100) / 100

        // Absence days (excl. Fri/Sat) count toward the theoretical target, same as useReport.ts
        const absenceWeekdayCount = absenceLogs.filter(l => {
          const dow = new Date(l.date).getDay()
          return dow !== 5 && dow !== 6
        }).length
        // A full work day at 100% = 9h; absence days are credited at that rate
        const dailyBase = isPercentage ? 9 * rate : 0
        const absenceEquivalentHours = Math.round(absenceWeekdayCount * dailyBase * 100) / 100

        return {
          employee, logs,
          workDays: workLogs.length,
          excusedAbsences, unexcusedAbsences,
          theoreticalHours, absenceEquivalentHours,
          totalHours, hoursNormal, hours125, hours150,
          totalKm, totalAmount
        }
      })
    )

    reportData.value = results
    loading.value = false
  }

  function fmtTime(ts: Timestamp | null | undefined): string {
    if (!ts) return '—'
    return ts.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  function fmtSessions(log: TimeLog): string {
    if (log.sessions?.length) {
      return log.sessions.map(s => `${fmtTime(s.clockIn)}→${fmtTime(s.clockOut)}`).join('  ')
    }
    if (log.clockIn) return `${fmtTime(log.clockIn)}→${fmtTime(log.clockOut)}`
    return '—'
  }

  function reasonLabel(id: string, reasons: AbsenceReason[], locale: 'en' | 'he'): string {
    const r = reasons.find(x => x.id === id)
    if (!r) return id
    return locale === 'he' ? r.labelHe : r.labelEn
  }

  function exportExcel(from: string, to: string, detailed: boolean, locale: 'en' | 'he') {
    const s = settings.value!
    const isHe = locale === 'he'
    const wb = XLSX.utils.book_new()

    // ── Summary sheet ───────────────────────────────────────────────────────────
    const summaryHead = isHe
      ? ['שם משפחה', 'שם פרטי', 'ימי עבודה', 'שעות בפועל', '100%', '125%', '150%', 'שעות לבצע', 'היעדרויות מוצדקות', 'היעדרויות לא מוצדקות', 'ק"מ', 'סכום נסיעות']
      : ['Last Name', 'First Name', 'Days worked', 'Hours worked', '100%', '125%', '150%', 'Hours to do', 'Excused abs.', 'Unexcused abs.', 'KM', 'Travel amount']
    const summaryRows = [
      summaryHead,
      ...reportData.value.map(r => [
        r.employee.name,
        r.employee.firstName,
        r.workDays,
        r.totalHours,
        r.hoursNormal,
        r.hours125,
        r.hours150,
        r.theoreticalHours,
        r.excusedAbsences,
        r.unexcusedAbsences,
        r.totalKm,
        r.totalAmount
      ])
    ]
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    wsSummary['!cols'] = [16, 14, 13, 14, 10, 10, 10, 13, 18, 20, 10, 14].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, wsSummary, isHe ? 'סיכום' : 'Summary')

    // ── Detailed sheets (one per employee) ─────────────────────────────────────
    if (detailed) {
      const detailHead = isHe
        ? ['תאריך', 'שעות כניסה/יציאה', 'שעות', '100%', '125%', '150%', 'סוג', 'ק"מ', 'סכום']
        : ['Date', 'Clock in/out', 'Hours', '100%', '125%', '150%', 'Type', 'KM', 'Amount']
      const ot125 = s.overtimeThreshold125 ?? 8.6
      const ot150 = s.overtimeThreshold150 ?? 12

      for (const r of reportData.value) {
        const rows = [
          detailHead,
          ...r.logs.map(log => {
            const km = log.type === 'work' ? Number(log.kmForDay ?? 0) : 0
            const amount = km * s.kmPrice
            const type = log.type === 'absence'
              ? (isHe ? 'היעדרות' : 'Absence') + (log.absenceReason ? ` (${reasonLabel(log.absenceReason, s.absenceReasons, locale)})` : '')
              : log.isRemote
                ? (isHe ? 'עבודה מהבית' : 'Remote')
                : (isHe ? 'נוכחות' : 'On-site')
            const kmCell = log.type === 'work' && log.isRemote && !km
              ? (isHe ? '🏠 בית' : '🏠 home')
              : km
            const sp = log.type === 'work'
              ? splitOvertime(log.date, log.totalDecimalHours ?? 0, ot125, ot150)
              : { normal: 0, h125: 0, h150: 0 }
            return [
              log.date,
              log.type === 'work' ? fmtSessions(log) : '—',
              log.type === 'work' ? log.totalDecimalHours ?? 0 : '—',
              log.type === 'work' ? sp.normal : '—',
              log.type === 'work' && sp.h125 > 0 ? sp.h125 : '—',
              log.type === 'work' && sp.h150 > 0 ? sp.h150 : '—',
              type,
              kmCell,
              parseFloat(amount.toFixed(2))
            ]
          }),
          // totals row
          ['', isHe ? 'סה"כ' : 'Total', r.totalHours, r.hoursNormal, r.hours125 || '—', r.hours150 || '—', '', r.totalKm, r.totalAmount]
        ]
        const ws = XLSX.utils.aoa_to_sheet(rows)
        ws['!cols'] = [12, 20, 8, 8, 8, 8, 18, 6, 10].map(w => ({ wch: w }))
        const sheetName = `${r.employee.firstName} ${r.employee.name}`.slice(0, 31)
        XLSX.utils.book_append_sheet(wb, ws, sheetName)
      }
    }

    XLSX.writeFile(wb, `ZmanIn_${from}_${to}.xlsx`)
  }

  function exportPdf(from: string, to: string, detailed: boolean, locale: 'en' | 'he') {
    const s = settings.value!
    const isHe = locale === 'he'
    const period = `${from} → ${to}`

    const css = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1f2937; background: white; padding: 20px; }
      h1 { font-size: 17px; font-weight: 700; color: #0e7490; margin-bottom: 2px; }
      .subtitle { font-size: 10px; color: #6b7280; margin-bottom: 16px; }
      .stats { display: flex; gap: 20px; margin-bottom: 14px; flex-wrap: wrap; }
      .stat { background: #f0f9ff; border-radius: 8px; padding: 8px 14px; text-align: center; min-width: 80px; }
      .stat-val { font-size: 16px; font-weight: 700; color: #0e7490; }
      .stat-lbl { font-size: 9px; color: #6b7280; margin-top: 1px; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 12px; }
      thead th { background: #0e7490; color: white; padding: 5px 7px; text-align: left; font-weight: 600; }
      tbody tr:nth-child(even) { background: #f8fafc; }
      tbody td { padding: 4px 7px; border-bottom: 1px solid #e5e7eb; }
      tfoot td { padding: 5px 7px; font-weight: 700; border-top: 2px solid #0e7490; background: #f0f9ff; }
      .green { color: #16a34a; font-weight: 600; }
      .red   { color: #dc2626; font-weight: 600; }
      .badge-work { color: #065f46; }
      .badge-remote { color: #1e40af; }
      .badge-absence { color: #92400e; }
      .page-break { page-break-after: always; margin-bottom: 0; }
      @page { size: A4; margin: 1.5cm; }
      @media print { body { padding: 0; } }
    `

    let body = ''

    if (!detailed) {
      // ── Summary page ──────────────────────────────────────────────────────────
      body += `<h1>ZmanIn</h1><p class="subtitle">${isHe ? 'תקופה' : 'Period'} : ${period}</p>`
      const hdrs = isHe
        ? ['שם משפחה', 'שם פרטי', 'ימי עבודה', 'שעות בפועל', '100%', '125%', '150%', 'שעות לבצע', 'היעד. מוצדקות', 'היעד. לא מוצדקות', 'ק"מ', 'סכום']
        : ['Last Name', 'First Name', 'Days', 'Hours worked', '100%', '125%', '150%', 'Hours to do', 'Excused abs.', 'Unexcused abs.', 'KM', 'Amount']
      body += `<table><thead><tr>${hdrs.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`
      for (const r of reportData.value) {
        const absExcused   = r.excusedAbsences   > 0 ? `<span class="green">${r.excusedAbsences}</span>`   : '<span style="color:#9ca3af">0</span>'
        const absUnexcused = r.unexcusedAbsences > 0 ? `<span class="red">${r.unexcusedAbsences}</span>`   : '<span style="color:#9ca3af">0</span>'
        const h125cell = r.hours125 > 0 ? `<span style="color:#f97316;font-weight:600">${r.hours125}h</span>` : '<span style="color:#9ca3af">—</span>'
        const h150cell = r.hours150 > 0 ? `<span style="color:#ef4444;font-weight:600">${r.hours150}h</span>` : '<span style="color:#9ca3af">—</span>'
        body += `<tr>
          <td>${r.employee.name}</td>
          <td>${r.employee.firstName}</td>
          <td style="text-align:center">${r.workDays}</td>
          <td style="text-align:center">${r.totalHours}h</td>
          <td style="text-align:center">${r.hoursNormal}h</td>
          <td style="text-align:center">${h125cell}</td>
          <td style="text-align:center">${h150cell}</td>
          <td style="text-align:center">${r.theoreticalHours}h</td>
          <td style="text-align:center">${absExcused}</td>
          <td style="text-align:center">${absUnexcused}</td>
          <td style="text-align:center">${r.totalKm}</td>
          <td style="text-align:right">${r.totalAmount.toFixed(2)}</td>
        </tr>`
      }
      // grand totals
      const gt = reportData.value.reduce((acc, r) => {
        acc.days += r.workDays; acc.hours += r.totalHours; acc.theoretical += r.theoreticalHours
        acc.hoursNormal += r.hoursNormal; acc.hours125 += r.hours125; acc.hours150 += r.hours150
        acc.excused += r.excusedAbsences; acc.unexcused += r.unexcusedAbsences
        acc.km += r.totalKm; acc.amount += r.totalAmount
        return acc
      }, { days: 0, hours: 0, theoretical: 0, hoursNormal: 0, hours125: 0, hours150: 0, excused: 0, unexcused: 0, km: 0, amount: 0 })
      body += `</tbody><tfoot><tr>
        <td colspan="2">${isHe ? 'סה"כ' : 'Total'}</td>
        <td style="text-align:center">${gt.days}</td>
        <td style="text-align:center">${Math.round(gt.hours * 100) / 100}h</td>
        <td style="text-align:center">${Math.round(gt.hoursNormal * 100) / 100}h</td>
        <td style="text-align:center;color:#f97316;font-weight:600">${Math.round(gt.hours125 * 100) / 100}h</td>
        <td style="text-align:center;color:#ef4444;font-weight:600">${Math.round(gt.hours150 * 100) / 100}h</td>
        <td style="text-align:center">${Math.round(gt.theoretical * 100) / 100}h</td>
        <td style="text-align:center">${gt.excused}</td>
        <td style="text-align:center">${gt.unexcused}</td>
        <td style="text-align:center">${gt.km}</td>
        <td style="text-align:right">${gt.amount.toFixed(2)}</td>
      </tr></tfoot></table>`

    } else {
      // ── Detailed: one page per employee ───────────────────────────────────────
      for (let i = 0; i < reportData.value.length; i++) {
        const r = reportData.value[i]
        if (i > 0) body += '<div class="page-break"></div>'

        const totalAbsences = r.excusedAbsences + r.unexcusedAbsences
        const statLabels = isHe
          ? ['ימי עבודה', 'שעות', 'היעדרויות', 'סכום נסיעות']
          : ['Days worked', 'Hours', 'Absences', 'Travel amount']
        const statValues = [r.workDays, `${r.totalHours}h`, totalAbsences, r.totalAmount.toFixed(2)]

        body += `
          <h1>${r.employee.firstName} ${r.employee.name}</h1>
          <p class="subtitle">${isHe ? 'תקופה' : 'Period'} : ${period}</p>
          <div class="stats">
            ${statLabels.map((lbl, idx) => `
              <div class="stat">
                <div class="stat-val">${statValues[idx]}</div>
                <div class="stat-lbl">${lbl}</div>
              </div>`).join('')}
          </div>`

        const hdrs = isHe
          ? ['תאריך', 'שעות כניסה / יציאה', 'שעות', '100%', '125%', '150%', 'סוג', 'ק"מ', 'סכום']
          : ['Date', 'Clock in/out', 'Hours', '100%', '125%', '150%', 'Type', 'KM', 'Amount']
        body += `<table><thead><tr>${hdrs.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`
        const pOt125 = s.overtimeThreshold125 ?? 8.6
        const pOt150 = s.overtimeThreshold150 ?? 12

        for (const log of r.logs) {
          const km = log.type === 'work' ? (log.kmForDay ?? 0) : 0
          const amount = km * s.kmPrice
          let typeLabel = ''
          let typeCls = ''
          if (log.type === 'absence') {
            typeLabel = (isHe ? 'היעדרות' : 'Absence') + (log.absenceReason ? ` · ${reasonLabel(log.absenceReason, s.absenceReasons, locale)}` : '')
            typeCls = 'badge-absence'
          } else if (log.isRemote) {
            typeLabel = isHe ? 'עבודה מהבית' : 'Remote'
            typeCls = 'badge-remote'
          } else {
            typeLabel = isHe ? 'נוכחות' : 'On-site'
            typeCls = 'badge-work'
          }
          const sp = log.type === 'work'
            ? splitOvertime(log.date, log.totalDecimalHours ?? 0, pOt125, pOt150)
            : { normal: 0, h125: 0, h150: 0 }

          body += `<tr>
            <td>${log.date}</td>
            <td style="font-family:monospace">${log.type === 'work' ? fmtSessions(log) : '—'}</td>
            <td style="text-align:center">${log.type === 'work' ? (log.totalDecimalHours ?? 0) + 'h' : '—'}</td>
            <td style="text-align:center">${log.type === 'work' ? sp.normal + 'h' : '—'}</td>
            <td style="text-align:center;color:#f97316">${log.type === 'work' && sp.h125 > 0 ? sp.h125 + 'h' : '—'}</td>
            <td style="text-align:center;color:#ef4444">${log.type === 'work' && sp.h150 > 0 ? sp.h150 + 'h' : '—'}</td>
            <td class="${typeCls}">${typeLabel}</td>
            <td style="text-align:center">${log.type === 'work' && log.isRemote && !km ? `<span style="color:#3b82f6;font-size:11px">🏠 ${isHe ? 'בית' : 'home'}</span>` : km}</td>
            <td style="text-align:right">${amount.toFixed(2)}</td>
          </tr>`
        }

        body += `</tbody><tfoot><tr>
          <td colspan="2">${isHe ? 'סה"כ' : 'Total'}</td>
          <td style="text-align:center">${r.totalHours}h</td>
          <td style="text-align:center">${r.hoursNormal}h</td>
          <td style="text-align:center;color:#f97316;font-weight:600">${r.hours125 > 0 ? r.hours125 + 'h' : '—'}</td>
          <td style="text-align:center;color:#ef4444;font-weight:600">${r.hours150 > 0 ? r.hours150 + 'h' : '—'}</td>
          <td></td>
          <td style="text-align:center">${r.totalKm}</td>
          <td style="text-align:right">${r.totalAmount.toFixed(2)}</td>
        </tr></tfoot></table>`
      }
    }

    const html = `<!DOCTYPE html><html dir="${isHe ? 'rtl' : 'ltr'}">
<head><meta charset="utf-8"><title>ZmanIn — ${period}</title>
<style>${css}</style></head>
<body>${body}</body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 400)
  }

  function absenceCategory(reasonId: string): 'vacation' | 'sick' | 'childSick' | 'miluim' | 'other' {
    const s = settings.value
    const r = s?.absenceReasons?.find(x => x.id === reasonId)
    if (!r) return 'other'
    const en = r.labelEn.toLowerCase()
    if (en.includes('milouim') || r.labelHe.includes('מילואים')) return 'miluim'
    if (en.includes('child') || r.labelHe.includes('ילד')) return 'childSick'
    if (en.includes('sick') || r.labelHe.includes('מחלה')) return 'sick'
    if (en.includes('vacation') || en.includes('holiday') || r.labelHe.includes('חופש')) return 'vacation'
    return 'other'
  }

  function exportSalarySplit(from: string, to: string, _locale: 'en' | 'he') {
    const wb = XLSX.utils.book_new()

    const head = ['מספר עובד', 'שם משפחה', 'שם פרטי', 'ימי עבודה', 'שעות עבודה', 'חופשה ימים', 'מחלה ימים', 'מחלה ילד', 'מילואים', 'נסיעות (₪)', 'שעות שבת 150%']

    const dataRows = reportData.value.map(r => {
      const absLogs = r.logs.filter(l => l.type === 'absence')
      const vacation  = absLogs.filter(l => absenceCategory(l.absenceReason ?? '') === 'vacation').length
      const sick      = absLogs.filter(l => absenceCategory(l.absenceReason ?? '') === 'sick').length
      const childSick = absLogs.filter(l => absenceCategory(l.absenceReason ?? '') === 'childSick').length
      const miluim    = absLogs.filter(l => absenceCategory(l.absenceReason ?? '') === 'miluim').length
      const satHours  = Math.round(
        r.logs.filter(l => l.type === 'work' && new Date(l.date + 'T12:00:00').getDay() === 6)
               .reduce((sum, l) => sum + (l.totalDecimalHours ?? 0), 0)
        * 100) / 100
      return [
        r.employee.employeeNumber ?? '',
        r.employee.name,
        r.employee.firstName,
        r.workDays,
        r.totalHours,
        vacation,
        sick,
        childSick,
        miluim,
        parseFloat(r.totalAmount.toFixed(2)),
        satHours
      ]
    })

    const totalsRow = [
      '', 'סה"כ', '',
      dataRows.reduce((s, r) => s + (r[3] as number), 0),
      Math.round(dataRows.reduce((s, r) => s + (r[4] as number), 0) * 100) / 100,
      dataRows.reduce((s, r) => s + (r[5] as number), 0),
      dataRows.reduce((s, r) => s + (r[6] as number), 0),
      dataRows.reduce((s, r) => s + (r[7] as number), 0),
      dataRows.reduce((s, r) => s + (r[8] as number), 0),
      parseFloat(dataRows.reduce((s, r) => s + (r[9] as number), 0).toFixed(2)),
      Math.round(dataRows.reduce((s, r) => s + (r[10] as number), 0) * 100) / 100
    ]

    const ws = XLSX.utils.aoa_to_sheet([head, ...dataRows, totalsRow])
    ws['!cols'] = [10, 14, 12, 12, 14, 10, 10, 10, 10, 12, 13].map(w => ({ wch: w }))
    ws['!views'] = [{ rightToLeft: true }]
    XLSX.utils.book_append_sheet(wb, ws, 'פיצול שכר')
    XLSX.writeFile(wb, `ZmanIn_SalarySplit_${from}_${to}.xlsx`)
  }

  return { loading, allEmployees, reportData, settings, loadEmployees, generate, exportExcel, exportPdf, exportSalarySplit }
}
