import { ref, computed } from 'vue'
import { Timestamp } from 'firebase/firestore'
import { getTimeLogByDate, createOrUpdateTimeLog } from '@/firebase/firestore'
import { useAuthStore } from '@/stores/auth'
import type { TimeLog, TimeLogSession } from '@/types'

export function useTimeLog(date: string) {
  const auth = useAuthStore()

  const log     = ref<TimeLog | null>(null)
  const loading = ref(false)
  const saving  = ref(false)

  const userId      = computed(() => auth.firebaseUser!.uid)
  const dailyKmBase = computed(() => auth.profile?.dailyKmBase ?? 0)

  // ── Session helpers ─────────────────────────────────────────────────────────

  /** Normalise: always return a sessions array (handles legacy single-session docs) */
  function getSessions(l: TimeLog | null): TimeLogSession[] {
    if (!l) return []
    if (l.sessions?.length) return l.sessions
    // legacy format: clockIn/clockOut at top level
    if (l.clockIn) {
      return [{ clockIn: l.clockIn, clockOut: l.clockOut ?? null, minutes: l.totalMinutes ?? 0 }]
    }
    return []
  }

  /** The open (unclosed) session, if any */
  const activeSession = computed<TimeLogSession | null>(() => {
    const sessions = getSessions(log.value)
    if (!sessions.length) return null
    const last = sessions[sessions.length - 1]
    return !last.clockOut ? last : null
  })

  const isClockedIn  = computed(() => !!activeSession.value)
  const isClockedOut = computed(() => {
    const s = getSessions(log.value)
    return s.length > 0 && !activeSession.value && log.value?.type === 'work'
  })

  // ── Load ────────────────────────────────────────────────────────────────────

  async function loadLog() {
    loading.value = true
    log.value = await getTimeLogByDate(userId.value, date)
    loading.value = false
  }

  // ── Clock In ────────────────────────────────────────────────────────────────

  async function clockIn() {
    if (isClockedIn.value) return  // already open
    saving.value = true
    const now      = Timestamp.now()
    const existing = log.value
    const sessions = [...getSessions(existing), { clockIn: now, clockOut: null }]

    await createOrUpdateTimeLog({
      userId:           userId.value,
      date,
      type:             'work',
      sessions,
      totalMinutes:     existing?.totalMinutes ?? 0,
      totalDecimalHours: existing?.totalDecimalHours ?? 0,
      isRemote:         existing?.isRemote ?? false,
      customKm:         existing?.customKm ?? null,
      kmForDay:         computeKm(existing)
    })
    log.value = await getTimeLogByDate(userId.value, date)
    saving.value = false
  }

  // ── Clock Out ───────────────────────────────────────────────────────────────

  async function clockOut() {
    if (!log.value || !activeSession.value) return
    saving.value = true
    const now = Timestamp.now()

    const sessions = getSessions(log.value).map((s, i, arr) => {
      if (i === arr.length - 1 && !s.clockOut) {
        const minutes = Math.max(0, Math.floor((now.toMillis() - s.clockIn.toMillis()) / 60000))
        return { ...s, clockOut: now, minutes }
      }
      return s
    })

    const totalMinutes      = sessions.reduce((sum, s) => sum + (s.minutes ?? 0), 0)
    const totalDecimalHours = Math.round((totalMinutes / 60) * 100) / 100

    await createOrUpdateTimeLog({
      userId: userId.value,
      date,
      type:  'work',
      sessions,
      totalMinutes,
      totalDecimalHours,
      isRemote: log.value.isRemote ?? false,
      customKm: log.value.customKm ?? null,
      kmForDay: computeKm(log.value)
    })
    log.value = await getTimeLogByDate(userId.value, date)
    saving.value = false
  }

  // ── Absence ─────────────────────────────────────────────────────────────────

  async function declareAbsence(reason: string) {
    saving.value = true
    await createOrUpdateTimeLog({
      userId: userId.value,
      date,
      type:             'absence',
      sessions:         [],
      totalMinutes:     0,
      totalDecimalHours: 0,
      isRemote:         false,
      customKm:         null,
      kmForDay:         0,
      absenceReason:    reason
    })
    log.value = await getTimeLogByDate(userId.value, date)
    saving.value = false
  }

  // ── Travel options ───────────────────────────────────────────────────────────

  async function updateTravelOptions(isRemote: boolean, customKm: number | null) {
    saving.value = true
    const kmForDay = isRemote ? 0 : customKm !== null ? customKm : dailyKmBase.value
    await createOrUpdateTimeLog({
      userId:           userId.value,
      date,
      type:             log.value?.type ?? 'work',
      sessions:         getSessions(log.value),
      totalMinutes:     log.value?.totalMinutes ?? 0,
      totalDecimalHours: log.value?.totalDecimalHours ?? 0,
      isRemote,
      customKm,
      kmForDay
    })
    log.value = await getTimeLogByDate(userId.value, date)
    saving.value = false
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function computeKm(current: TimeLog | null): number {
    if (current?.isRemote) return 0
    if (current?.customKm !== null && current?.customKm !== undefined) return current.customKm
    return dailyKmBase.value
  }

  function formatTime(ts: Timestamp | null | undefined): string {
    if (!ts) return '--:--'
    return ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}h${String(m).padStart(2, '0')}`
  }

  return {
    log, loading, saving,
    activeSession, isClockedIn, isClockedOut,
    getSessions,
    loadLog, clockIn, clockOut, declareAbsence, updateTravelOptions,
    formatTime, formatDuration
  }
}
