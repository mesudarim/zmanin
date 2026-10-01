import type { Timestamp } from 'firebase/firestore'

export interface TimeLogSession {
  clockIn: Timestamp
  clockOut?: Timestamp | null
  minutes?: number
}

export interface RateChange {
  date: string             // YYYY-MM-DD
  oldRate: number
  newRate: number
  changedByUid: string
  changedByName: string
}

export interface UserProfile {
  uid: string
  name: string
  firstName: string
  email: string
  birthDate: string
  role: 'admin' | 'employee'
  contractType: 'percentage' | 'hourly'
  contractRate?: number          // 50 | 70 | 100 — only if percentage
  weeklyHoursBase?: number       // default 40
  dailyKmBase: number
  startDate?: string             // YYYY-MM-DD — auto-filled on creation
  endDate?: string               // YYYY-MM-DD — set when employee leaves
  endReason?: string             // 'resignation' | 'dismissal' | 'contractEnd'
  employeeNumber?: string        // optional internal employee ID
  rateHistory?: RateChange[]     // audit trail of contract rate changes
  createdAt?: Timestamp
  updatedAt?: Timestamp
  invitedBy?: string
  isTemporary?: boolean
}

export interface TimeLog {
  id?: string
  userId: string
  date: string                   // YYYY-MM-DD
  type: 'work' | 'absence' | 'holiday'  // 'holiday' is synthetic — never stored in Firestore
  holidayNameHe?: string         // only on type === 'holiday'
  holidayNameEn?: string
  holidayDayType?: 'full' | 'half'
  sessions?: TimeLogSession[]    // multi-session support (new)
  clockIn?: Timestamp | null     // legacy single-session (kept for compat)
  clockOut?: Timestamp | null    // legacy single-session (kept for compat)
  totalMinutes?: number
  totalDecimalHours?: number
  isRemote?: boolean
  customKm?: number | null
  kmForDay?: number
  absenceReason?: string | null
  comment?: string | null
  manualEntry?: boolean
  milouimClockIn?: Timestamp | null
  milouimClockOut?: Timestamp | null
  milouimTotalMinutes?: number | null
  milouimTotalDecimalHours?: number | null
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface AbsenceReason {
  id: string
  labelEn: string
  labelHe: string
}

export interface HolidayEntry {
  type: 'full' | 'half'
  nameHe: string
  nameEn: string
}

export interface GlobalSettings {
  kmPrice: number
  weeklyHoursBase: number
  useFixedMonthlyHours: boolean
  fixedMonthlyHours: number
  absenceReasons: AbsenceReason[]
  endReasons: AbsenceReason[]
  overtimeThreshold125: number   // hours/day before 125% kicks in (default 8.6)
  overtimeThreshold150: number   // hours/day before 150% kicks in (default 12)
  holidays?: Record<string, Record<string, HolidayEntry>>  // year → date → entry
}

export interface MonthlyReport {
  userId: string
  year: number
  month: number
  totalDecimalHours: number       // actual worked hours
  absenceEquivalentHours: number  // absence days × daily base hours
  theoreticalHours: number
  hoursDiff: number
  hoursNormal: number             // hours at 100% rate
  hours125:    number             // hours at 125% rate
  hours150:    number             // hours at 150% rate
  absenceDays: { date: string; reason: string }[]
  totalKmAmount: number
  logs: TimeLog[]
}
