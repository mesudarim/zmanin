import { ref } from 'vue'
import * as XLSX from 'xlsx'
import { getAllEmployees, getTimeLogsForDateRange, getGlobalSettings } from '@/firebase/firestore'
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
      if (day !== 0 && day !== 6) count++
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
        const workLogs    = logs.filter(l => l.type === 'work')
        const absenceLogs = logs.filter(l => l.type === 'absence')

        const excusedAbsences   = absenceLogs.filter(l => l.absenceReason).length
        const unexcusedAbsences = absenceLogs.filter(l => !l.absenceReason).length

        const totalHours = Math.round(workLogs.reduce((s, l) => s + (l.totalDecimalHours ?? 0), 0) * 100) / 100
        const totalKm    = logs.reduce((s, l) => s + Number(l.kmForDay ?? 0), 0)
        const totalAmount = Math.round(totalKm * settings.value!.kmPrice * 100) / 100

        const s = settings.value!
        const isPercentage = employee.contractType === 'percentage' && employee.contractRate
        const rate = isPercentage ? employee.contractRate! / 100 : 1

        // Hourly employees have no fixed hours-to-do target
        const theoreticalHours = !isPercentage ? 0
          : s.useFixedMonthlyHours && s.fixedMonthlyHours
            ? fixedHoursForRange(from, to, rate, s.fixedMonthlyHours)
            : Math.round(((employee.weeklyHoursBase ?? s.weeklyHoursBase ?? 40) * rate / 5) * workingDays * 100) / 100

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
          theoreticalHours, absenceEquivalentHours, totalHours, totalKm, totalAmount
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
      ? ['שם משפחה', 'שם פרטי', 'ימי עבודה', 'שעות בפועל', 'שעות לבצע', 'היעדרויות מוצדקות', 'היעדרויות לא מוצדקות', 'ק"מ', 'סכום נסיעות']
      : ['Nom', 'Prénom', 'Jours travaillés', 'Heures réalisées', 'Heures à faire', 'Absences excusées', 'Absences non excusées', 'KM total', 'Montant voyages']
    const summaryRows = [
      summaryHead,
      ...reportData.value.map(r => [
        r.employee.name,
        r.employee.firstName,
        r.workDays,
        r.totalHours,
        r.theoreticalHours,
        r.excusedAbsences,
        r.unexcusedAbsences,
        r.totalKm,
        r.totalAmount
      ])
    ]
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    wsSummary['!cols'] = [16, 14, 13, 14, 13, 18, 20, 10, 14].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, wsSummary, isHe ? 'סיכום' : 'Résumé')

    // ── Detailed sheets (one per employee) ─────────────────────────────────────
    if (detailed) {
      const detailHead = isHe
        ? ['תאריך', 'שעות כניסה/יציאה', 'שעות', 'סוג', 'ק"מ', 'סכום']
        : ['Date', 'Horaires', 'Heures', 'Type', 'KM', 'Montant']

      for (const r of reportData.value) {
        const rows = [
          detailHead,
          ...r.logs.map(log => {
            const km = Number(log.kmForDay ?? 0)
            const amount = km * s.kmPrice
            const type = log.type === 'absence'
              ? (isHe ? 'היעדרות' : 'Absence') + (log.absenceReason ? ` (${reasonLabel(log.absenceReason, s.absenceReasons, locale)})` : '')
              : log.isRemote
                ? (isHe ? 'עבודה מהבית' : 'Domicile')
                : (isHe ? 'נוכחות' : 'Présentiel')
            const kmCell = log.type === 'work' && log.isRemote && !km
              ? (isHe ? '🏠 בית' : '🏠 home')
              : km
            return [
              log.date,
              log.type === 'work' ? fmtSessions(log) : '—',
              log.type === 'work' ? log.totalDecimalHours ?? 0 : '—',
              type,
              kmCell,
              parseFloat(amount.toFixed(2))
            ]
          }),
          // totals row
          ['', isHe ? 'סה"כ' : 'Total', r.totalHours, '', r.totalKm, r.totalAmount]
        ]
        const ws = XLSX.utils.aoa_to_sheet(rows)
        ws['!cols'] = [12, 20, 8, 18, 6, 10].map(w => ({ wch: w }))
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
      body += `<h1>ZmanIn</h1><p class="subtitle">${isHe ? 'תקופה' : 'Période'} : ${period}</p>`
      const hdrs = isHe
        ? ['שם משפחה', 'שם פרטי', 'ימי עבודה', 'שעות בפועל', 'שעות לבצע', 'היעד. מוצדקות', 'היעד. לא מוצדקות', 'ק"מ', 'סכום']
        : ['Nom', 'Prénom', 'Jours', 'Heures réal.', 'Heures à faire', 'Abs. excusées', 'Abs. non exc.', 'KM', 'Montant']
      body += `<table><thead><tr>${hdrs.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`
      for (const r of reportData.value) {
        const absExcused   = r.excusedAbsences   > 0 ? `<span class="green">${r.excusedAbsences}</span>`   : '<span style="color:#9ca3af">0</span>'
        const absUnexcused = r.unexcusedAbsences > 0 ? `<span class="red">${r.unexcusedAbsences}</span>`   : '<span style="color:#9ca3af">0</span>'
        body += `<tr>
          <td>${r.employee.name}</td>
          <td>${r.employee.firstName}</td>
          <td style="text-align:center">${r.workDays}</td>
          <td style="text-align:center">${r.totalHours}h</td>
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
        acc.excused += r.excusedAbsences; acc.unexcused += r.unexcusedAbsences
        acc.km += r.totalKm; acc.amount += r.totalAmount
        return acc
      }, { days: 0, hours: 0, theoretical: 0, excused: 0, unexcused: 0, km: 0, amount: 0 })
      body += `</tbody><tfoot><tr>
        <td colspan="2">${isHe ? 'סה"כ' : 'Total'}</td>
        <td style="text-align:center">${gt.days}</td>
        <td style="text-align:center">${Math.round(gt.hours * 100) / 100}h</td>
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
          : ['Jours travaillés', 'Heures', 'Absences', 'Montant voyages']
        const statValues = [r.workDays, `${r.totalHours}h`, totalAbsences, r.totalAmount.toFixed(2)]

        body += `
          <h1>${r.employee.firstName} ${r.employee.name}</h1>
          <p class="subtitle">${isHe ? 'תקופה' : 'Période'} : ${period}</p>
          <div class="stats">
            ${statLabels.map((lbl, idx) => `
              <div class="stat">
                <div class="stat-val">${statValues[idx]}</div>
                <div class="stat-lbl">${lbl}</div>
              </div>`).join('')}
          </div>`

        const hdrs = isHe
          ? ['תאריך', 'שעות כניסה / יציאה', 'שעות', 'סוג', 'ק"מ', 'סכום']
          : ['Date', 'Horaires', 'Heures', 'Type', 'KM', 'Montant']
        body += `<table><thead><tr>${hdrs.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`

        for (const log of r.logs) {
          const km = log.kmForDay ?? 0
          const amount = km * s.kmPrice
          let typeLabel = ''
          let typeCls = ''
          if (log.type === 'absence') {
            typeLabel = (isHe ? 'היעדרות' : 'Absence') + (log.absenceReason ? ` · ${reasonLabel(log.absenceReason, s.absenceReasons, locale)}` : '')
            typeCls = 'badge-absence'
          } else if (log.isRemote) {
            typeLabel = isHe ? 'עבודה מהבית' : 'Domicile'
            typeCls = 'badge-remote'
          } else {
            typeLabel = isHe ? 'נוכחות' : 'Présentiel'
            typeCls = 'badge-work'
          }

          body += `<tr>
            <td>${log.date}</td>
            <td style="font-family:monospace">${log.type === 'work' ? fmtSessions(log) : '—'}</td>
            <td style="text-align:center">${log.type === 'work' ? (log.totalDecimalHours ?? 0) + 'h' : '—'}</td>
            <td class="${typeCls}">${typeLabel}</td>
            <td style="text-align:center">${log.type === 'work' && log.isRemote && !km ? `<span style="color:#3b82f6;font-size:11px">🏠 ${isHe ? 'בית' : 'home'}</span>` : km}</td>
            <td style="text-align:right">${amount.toFixed(2)}</td>
          </tr>`
        }

        body += `</tbody><tfoot><tr>
          <td colspan="2">${isHe ? 'סה"כ' : 'Total'}</td>
          <td style="text-align:center">${r.totalHours}h</td>
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

  return { loading, allEmployees, reportData, settings, loadEmployees, generate, exportExcel, exportPdf }
}
