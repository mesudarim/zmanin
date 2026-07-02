import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  onAuthStateChanged, signOut,
  signInWithPopup, sendSignInLinkToEmail,
  isSignInWithEmailLink, signInWithEmailLink,
  type User
} from 'firebase/auth'
import { auth, googleProvider } from '@/firebase/config'
import { getUserProfile, setUserProfile, getProfileByEmail, migrateUserUID } from '@/firebase/firestore'
import type { UserProfile } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const firebaseUser = ref<User | null>(null)
  const profile = ref<UserProfile | null>(null)
  const loading = ref(true)

  const isAuthenticated = computed(() => !!firebaseUser.value)
  const isAdmin = computed(() => profile.value?.role === 'admin')
  const isEmployee = computed(() => profile.value?.role === 'employee')

  // Single-registration guard: reuse the same Promise on multiple calls
  let _initPromise: Promise<void> | null = null

  function init(): Promise<void> {
    if (_initPromise) return _initPromise
    _initPromise = new Promise<void>((resolve) => {
      onAuthStateChanged(auth, async (user) => {
        firebaseUser.value = user
        if (user) {
          profile.value = await getUserProfile(user.uid)
        } else {
          profile.value = null
        }
        loading.value = false
        resolve()
      })
    })
    return _initPromise
  }

  async function loginWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider)
    const user = result.user
    if (!await getUserProfile(user.uid)) {
      const byEmail = await getProfileByEmail(user.email ?? '')
      if (byEmail && byEmail.uid !== user.uid) {
        // Pre-created profile found by email → migrate all data to the Firebase Auth UID
        await migrateUserUID(byEmail.uid, user.uid)
      } else if (!byEmail) {
        // Completely new user — create minimal profile; admin assigns contract details later
        await setUserProfile(user.uid, {
          uid:          user.uid,
          name:         user.displayName?.split(' ').slice(1).join(' ') ?? '',
          firstName:    user.displayName?.split(' ')[0] ?? '',
          email:        user.email ?? '',
          birthDate:    '',
          role:         'employee',
          contractType: 'hourly',
          dailyKmBase:  0
        })
      }
    }
    profile.value = await getUserProfile(user.uid)
  }

  async function sendEmailLink(email: string) {
    const actionCodeSettings = {
      url: window.location.origin + '/auth/callback',
      handleCodeInApp: true
    }
    await sendSignInLinkToEmail(auth, email, actionCodeSettings)
    window.localStorage.setItem('emailForSignIn', email)
  }

  async function completeEmailLink(emailOverride?: string) {
    if (!isSignInWithEmailLink(auth, window.location.href)) return false
    const email = emailOverride ?? window.localStorage.getItem('emailForSignIn') ?? ''
    if (!email) return 'need-email'
    const result = await signInWithEmailLink(auth, email, window.location.href)
    window.localStorage.removeItem('emailForSignIn')
    if (!await getUserProfile(result.user.uid)) {
      const byEmail = await getProfileByEmail(email)
      if (byEmail && byEmail.uid !== result.user.uid) {
        await migrateUserUID(byEmail.uid, result.user.uid)
      } else if (!byEmail) {
        await setUserProfile(result.user.uid, {
          uid:          result.user.uid,
          name:         '',
          firstName:    '',
          email:        email,
          birthDate:    '',
          role:         'employee',
          contractType: 'hourly',
          dailyKmBase:  0
        })
      }
    }
    profile.value = await getUserProfile(result.user.uid)
    return true
  }

  async function logout() {
    await signOut(auth)
    firebaseUser.value = null
    profile.value = null
  }

  return {
    firebaseUser, profile, loading,
    isAuthenticated, isAdmin, isEmployee,
    init, loginWithGoogle, sendEmailLink, completeEmailLink, logout
  }
})
