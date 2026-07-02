<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useI18nStore } from '@/stores/i18n'
import { setUserProfile } from '@/firebase/firestore'
import AppInput from '@/components/ui/AppInput.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppBadge from '@/components/ui/AppBadge.vue'

const auth   = useAuthStore()
const i18n   = useI18nStore()
const router = useRouter()
const t      = computed(() => i18n.t)

const saving = ref(false)
const saved  = ref(false)

const form = reactive({
  firstName: '',
  name:      '',
  email:     '',
  birthDate: '',
})

onMounted(() => {
  if (auth.profile) {
    form.firstName = auth.profile.firstName ?? ''
    form.name      = auth.profile.name      ?? ''
    form.email     = auth.profile.email     ?? ''
    form.birthDate = auth.profile.birthDate ?? ''
  }
})

async function save() {
  saving.value = true
  await setUserProfile(auth.profile!.uid, {
    firstName: form.firstName,
    name:      form.name,
    email:     form.email,
    birthDate: form.birthDate,
  })
  if (auth.profile) {
    auth.profile.firstName = form.firstName
    auth.profile.name      = form.name
    auth.profile.email     = form.email
    auth.profile.birthDate = form.birthDate
  }
  saving.value = false
  saved.value  = true
  setTimeout(() => { saved.value = false }, 3000)
}

async function logout() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="page-container max-w-lg space-y-6">

    <!-- Avatar + name header -->
    <div class="flex flex-col items-center gap-3 pt-2">
      <div class="w-20 h-20 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-3xl font-bold select-none">
        {{ auth.profile?.firstName?.charAt(0) }}{{ auth.profile?.name?.charAt(0) }}
      </div>
      <div class="text-center">
        <h1 class="text-2xl font-bold text-gray-900">
          {{ auth.profile?.firstName }} {{ auth.profile?.name }}
        </h1>
        <p class="text-sm text-gray-400 mt-0.5">{{ auth.profile?.email }}</p>
      </div>
    </div>

    <!-- Editable personal info -->
    <div class="card space-y-4">
      <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-widest">
        {{ t.profile.personalInfo }}
      </h2>

      <div class="grid grid-cols-2 gap-3">
        <AppInput v-model="form.firstName" :label="t.profile.firstName" />
        <AppInput v-model="form.name"      :label="t.profile.name" />
      </div>
      <AppInput v-model="form.email"     :label="t.profile.email"     type="email" />
      <AppInput v-model="form.birthDate" :label="t.profile.birthDate" type="date" />

      <div class="flex items-center gap-3 pt-1">
        <AppButton :loading="saving" @click="save">{{ t.profile.save }}</AppButton>
        <span v-if="saved" class="text-sm text-green-600 font-medium">✓ {{ t.profile.saved }}</span>
      </div>
    </div>

    <!-- Read-only contract info -->
    <div class="card space-y-4">
      <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-widest">
        {{ t.profile.contractInfo }}
      </h2>

      <div class="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
        <div>
          <p class="text-gray-400 text-xs mb-1">{{ t.profile.contractType }}</p>
          <AppBadge :variant="auth.profile?.contractType === 'percentage' ? 'blue' : 'gray'">
            {{ auth.profile?.contractType === 'percentage' ? t.profile.percentage : t.profile.hourly }}
          </AppBadge>
        </div>

        <div v-if="auth.profile?.contractType === 'percentage' && auth.profile?.contractRate">
          <p class="text-gray-400 text-xs mb-1">{{ t.profile.contractRate }}</p>
          <p class="font-semibold text-gray-800">{{ auth.profile.contractRate }}%</p>
        </div>

        <div v-if="auth.profile?.weeklyHoursBase">
          <p class="text-gray-400 text-xs mb-1">{{ t.profile.weeklyHours }}</p>
          <p class="font-semibold text-gray-800">{{ auth.profile.weeklyHoursBase }}h / {{ t.report.date ? 'week' : 'sem.' }}</p>
        </div>

        <div>
          <p class="text-gray-400 text-xs mb-1">{{ t.profile.dailyKm }}</p>
          <p class="font-semibold text-gray-800">{{ auth.profile?.dailyKmBase ?? 0 }} km</p>
        </div>
      </div>
    </div>

    <!-- Sign out -->
    <div>
      <AppButton variant="danger" @click="logout">
        {{ t.profile.logout }}
      </AppButton>
    </div>

  </div>
</template>
