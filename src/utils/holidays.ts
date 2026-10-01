export interface HolidayEntry {
  type: 'full' | 'half'
  nameHe: string
  nameEn: string
}

export type YearHolidays = Record<string, HolidayEntry>   // date YYYY-MM-DD → entry
export type HolidaysMap  = Record<string, YearHolidays>   // year string → YearHolidays

interface HebcalItem {
  title: string
  date: string
  hebrew?: string
  yomtov?: boolean
}

export async function fetchHolidaysFromHebcal(year: number): Promise<YearHolidays> {
  const url =
    `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=off&year=${year}&month=x&i=on&ss=off&mf=off&c=off`
  const res  = await fetch(url)
  const data = await res.json() as { items?: HebcalItem[] }
  const items = data.items ?? []

  const result: YearHolidays = {}

  for (const item of items) {
    const date   = item.date.slice(0, 10)
    const title  = item.title
    const hebrew = item.hebrew ?? title

    if (item.yomtov) {
      result[date] = { type: 'full', nameHe: hebrew, nameEn: title }
    } else if (title.includes("HaAtzma'ut") || title.includes('HaAtzmaut')) {
      result[date] = { type: 'full', nameHe: hebrew, nameEn: title }
    } else if (title.startsWith('Erev ')) {
      result[date] = { type: 'half', nameHe: hebrew, nameEn: title }
    } else if (title.includes('Hol HaMoed') || title.includes('HaMoed')) {
      result[date] = { type: 'half', nameHe: hebrew, nameEn: title }
    }
  }

  return result
}

export function getHolidayType(
  date: string,
  holidays: HolidaysMap | undefined
): 'full' | 'half' | null {
  if (!holidays) return null
  const year = date.slice(0, 4)
  return holidays[year]?.[date]?.type ?? null
}

export function computeHolidayDeduction(
  year: number,
  month: number,
  dailyHours: number,
  holidays: HolidaysMap | undefined,
  skipDays: number[] = [5, 6]   // Israeli weekend: Fri + Shabbat
): number {
  if (!holidays) return 0
  let deduction = 0
  const daysInMonth = new Date(year, month, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay()
    if (skipDays.includes(dow)) continue
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const hType = getHolidayType(dateStr, holidays)
    if (hType === 'full') deduction += dailyHours
    else if (hType === 'half') deduction += dailyHours / 2
  }
  return Math.round(deduction * 100) / 100
}

// For admin reports that span a date range across multiple months.
// dailyHoursForMonth(year, month) returns the daily hours for that month.
export function computeHolidayDeductionForRange(
  from: string,
  to: string,
  dailyHoursForMonth: (year: number, month: number) => number,
  holidays: HolidaysMap | undefined,
  skipDays: number[] = [5, 6]   // Israeli weekend: Fri + Shabbat
): number {
  if (!holidays) return 0
  let deduction = 0
  const start = new Date(from + 'T12:00:00')
  const end   = new Date(to   + 'T12:00:00')
  for (const cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
    const dow = cur.getDay()
    if (skipDays.includes(dow)) continue
    const y = cur.getFullYear()
    const m = cur.getMonth() + 1
    const d = cur.getDate()
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const hType = getHolidayType(dateStr, holidays)
    if (!hType) continue
    const daily = dailyHoursForMonth(y, m)
    if (hType === 'full') deduction += daily
    else deduction += daily / 2
  }
  return Math.round(deduction * 100) / 100
}
