<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useI18nStore } from '@/stores/i18n'
import AppInput from '@/components/ui/AppInput.vue'
import AppButton from '@/components/ui/AppButton.vue'

const auth   = useAuthStore()
const i18n   = useI18nStore()
const router = useRouter()

const state      = ref<'loading' | 'need-email' | 'error' | 'expired'>('loading')
const email      = ref('')
const submitting = ref(false)

function isExpiredError(e: unknown) {
  const code = (e as { code?: string })?.code ?? ''
  return code === 'auth/invalid-action-code' || code === 'auth/expired-action-code'
}

onMounted(async () => {
  try {
    const result = await auth.completeEmailLink()
    if (result === true) {
      router.push(auth.isAdmin ? '/admin' : '/dashboard')
    } else if (result === 'need-email') {
      state.value = 'need-email'
    } else {
      state.value = 'error'
    }
  } catch (e) {
    state.value = isExpiredError(e) ? 'expired' : 'error'
  }
})

async function confirm() {
  if (!email.value) return
  submitting.value = true
  try {
    const result = await auth.completeEmailLink(email.value)
    if (result === true) {
      router.push(auth.isAdmin ? '/admin' : '/dashboard')
    } else {
      state.value = 'error'
    }
  } catch (e) {
    state.value = isExpiredError(e) ? 'expired' : 'error'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4">

    <!-- Loading -->
    <div v-if="state === 'loading'" class="flex flex-col items-center gap-3 text-gray-500">
      <div class="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      <p class="text-sm">{{ i18n.t.auth.loggingIn }}</p>
    </div>

    <!-- Cross-device: ask for email -->
    <div v-else-if="state === 'need-email'" class="card max-w-sm w-full space-y-4">
      <div class="text-center space-y-1">
        <div class="w-12 h-12 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-gray-900">{{ i18n.t.auth.confirmEmail }}</h2>
        <p class="text-sm text-gray-500">{{ i18n.t.auth.confirmEmailHint }}</p>
      </div>
      <AppInput v-model="email" :label="i18n.t.auth.emailLabel" type="email" />
      <AppButton class="w-full" :loading="submitting" @click="confirm">
        {{ i18n.t.auth.confirm }}
      </AppButton>
    </div>

    <!-- Expired / already used link -->
    <div v-else-if="state === 'expired'" class="card max-w-sm w-full text-center space-y-3">
      <div class="w-12 h-12 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center mx-auto">
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      </div>
      <h2 class="text-lg font-semibold text-gray-900">{{ i18n.t.auth.linkExpired }}</h2>
      <p class="text-sm text-gray-500">{{ i18n.t.auth.linkExpiredHint }}</p>
    </div>

    <!-- Generic error -->
    <div v-else class="card max-w-sm w-full text-center space-y-3">
      <div class="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto">
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      </div>
      <p class="text-sm text-gray-500">{{ i18n.t.common.error }}</p>
    </div>

  </div>
</template>
