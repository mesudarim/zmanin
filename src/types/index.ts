import type { Timestamp } from 'firebase/firestore'

export interface TimeLogSession {
  clockIn: Timestamp
  clockOut?: Timestamp | null
  minutes?: number
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
  createdAt?: Timestamp
  updatedAt?: Timestamp
  invitedBy?: string
}

export interface TimeLog {
  id?: string
  userId: string
  date: string                   // YYYY-MM-DD
  type: 'work' | 'absence'
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

export interface GlobalSettings {
  kmPrice: number
  weeklyHoursBase: number
  absenceReasons: AbsenceReason[]
  endReasons: AbsenceReason[]
}

export interface MonthlyReport {
  userId: string
  year: number
  month: number
  totalDecimalHours: number       // actual worked hours
  absenceEquivalentHours: number  // absence days × daily base hours
  theoreticalHours: number
  hoursDiff: number
  absenceDays: { date: string; reason: string }[]
  totalKmAmount: number
  logs: TimeLog[]
}
