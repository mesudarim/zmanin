import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, addDoc,
  writeBatch, serverTimestamp, Timestamp
} from 'firebase/firestore'
import { db } from './config'
import type { UserProfile, TimeLog, GlobalSettings } from '@/types'

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? (snap.data() as UserProfile) : null
}

export async function setUserProfile(uid: string, data: Partial<UserProfile>) {
  await setDoc(doc(db, 'users', uid), { ...data, updatedAt: serverTimestamp() }, { merge: true })
}

export async function getAllEmployees(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs
    .map(d => ({ uid: d.id, ...d.data() } as UserProfile))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function deleteEmployee(uid: string) {
  await deleteDoc(doc(db, 'users', uid))
}

export async function getProfileByEmail(email: string): Promise<UserProfile | null> {
  const q = query(collection(db, 'users'), where('email', '==', email))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { uid: d.id, ...d.data() } as UserProfile
}

export async function migrateUserUID(oldUID: string, newUID: string): Promise<void> {
  const oldSnap = await getDoc(doc(db, 'users', oldUID))
  if (!oldSnap.exists()) return
  await setDoc(doc(db, 'users', newUID), { ...oldSnap.data(), uid: newUID, updatedAt: serverTimestamp() })
  try {
    const logsSnap = await getDocs(query(collection(db, 'time_logs'), where('userId', '==', oldUID)))
    for (let i = 0; i < logsSnap.docs.length; i += 500) {
      const batch = writeBatch(db)
      logsSnap.docs.slice(i, i + 500).forEach(d => batch.update(d.ref, { userId: newUID }))
      await batch.commit()
    }
  } catch {
    // New employees have no time_logs under the pre-created UUID — safe to skip
  }
  await deleteDoc(doc(db, 'users', oldUID))
}

// ─── Time Log deletion ───────────────────────────────────────────────────────

export async function deleteTimeLog(id: string) {
  await deleteDoc(doc(db, 'time_logs', id))
}

// ─── Time Logs ────────────────────────────────────────────────────────────────

export async function getTimeLogByDate(userId: string, date: string): Promise<TimeLog | null> {
  const q = query(
    collection(db, 'time_logs'),
    where('userId', '==', userId),
    where('date', '==', date)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() } as TimeLog
}

export async function createOrUpdateTimeLog(data: Partial<TimeLog> & { userId: string; date: string }): Promise<string> {
  const existing = await getTimeLogByDate(data.userId, data.date)
  if (existing?.id) {
    await updateDoc(doc(db, 'time_logs', existing.id), { ...data, updatedAt: serverTimestamp() })
    return existing.id
  }
  const ref = await addDoc(collection(db, 'time_logs'), { ...data, createdAt: serverTimestamp() })
  return ref.id
}

export async function getTimeLogsForDateRange(userId: string, from: string, to: string): Promise<TimeLog[]> {
  const q = query(collection(db, 'time_logs'), where('userId', '==', userId))
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as TimeLog))
    .filter(l => l.date >= from && l.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function getTimeLogsForMonth(userId: string, year: number, month: number): Promise<TimeLog[]> {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
  // Single-field query on userId (auto-indexed) — filter & sort client-side to avoid composite index requirement
  const q = query(collection(db, 'time_logs'), where('userId', '==', userId))
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as TimeLog))
    .filter(l => l.date >= from && l.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ─── Global Settings ──────────────────────────────────────────────────────────

export async function getGlobalSettings(): Promise<GlobalSettings> {
  const snap = await getDoc(doc(db, 'global_settings', 'config'))
  if (snap.exists()) return snap.data() as GlobalSettings
  // defaults
  return {
    kmPrice: 0.5,
    weeklyHoursBase: 40,
    absenceReasons: [
      { id: 'sickness',       labelEn: 'Sickness',          labelHe: 'מחלה' },
      { id: 'milouim',        labelEn: 'Milouim',           labelHe: 'מילואים' },
      { id: 'child_sickness', labelEn: 'Child sickness',    labelHe: 'מחלת ילד' },
      { id: 'vacation',       labelEn: 'Vacation',          labelHe: 'חופשה' }
    ]
  }
}

export async function updateGlobalSettings(data: Partial<GlobalSettings>) {
  await setDoc(doc(db, 'global_settings', 'config'), { ...data, updatedAt: serverTimestamp() }, { merge: true })
}

export { Timestamp }
