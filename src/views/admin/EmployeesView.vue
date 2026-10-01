<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { getAllEmployees, setUserProfile, deleteEmployee, getProfileByEmail, appendRateChange } from '@/firebase/firestore'
import { sendSignInLinkToEmail } from 'firebase/auth'
import { auth as firebaseAuth } from '@/firebase/config'
import type { UserProfile, RateChange } from '@/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppBadge from '@/components/ui/AppBadge.vue'

const i18n          = useI18nStore()
const settingsStore = useSettingsStore()
const authStore     = useAuthStore()
const t = computed(() => i18n.t)

const employees = ref<UserProfile[]>([])
const loading = ref(true)
const saving = ref(false)
const inviting = ref(false)

const showFormModal    = ref(false)
const showDeleteModal  = ref(false)
const showInviteModal  = ref(false)
const showRateConfirm  = ref(false)

const originalRate      = ref<number>(100)
const rateChangedByUser = ref(false)
const pendingRateChange = ref<{ oldRate: number; newRate: number } | null>(null)
const inviteEmail = ref('')
const inviteSentTo = ref('')
const inviteError = ref('')

const editingUid = ref<string | null>(null)

const form = reactive<Partial<UserProfile> & { contractRate: number; weeklyHoursBase: number; dailyKmBase: number; isTemporary: boolean }>({
  name: '',
  firstName: '',
  email: '',
  birthDate: '',
  contractType: 'percentage',
  contractRate: 100,
  weeklyHoursBase: 40,
  dailyKmBase: 0,
  employeeNumber: '',
  startDate: '',
  endDate: '',
  endReason: '',
  isTemporary: false
})

const contractTypeOptions = computed(() => [
  { value: 'percentage', label: t.value.admin.percentage },
  { value: 'hourly',     label: t.value.admin.hourly }
])

const endReasonOptions = computed(() =>
  settingsStore.settings.endReasons.map(r => ({
    value: r.id,
    label: i18n.locale === 'he' ? r.labelHe : r.labelEn
  }))
)

const rateOptions = Array.from({ length: 20 }, (_, i) => (i + 1) * 5).map(v => ({ value: v, label: v + '%' }))

async function load() {
  loading.value = true
  employees.value = await getAllEmployees()
  loading.value = false
}

onMounted(async () => { await settingsStore.load(); await load() })

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function openAdd() {
  editingUid.value = null
  saveError.value = ''
  Object.assign(form, {
    name: '', firstName: '', email: '', birthDate: '',
    contractType: 'percentage', contractRate: 100, weeklyHoursBase: 40, dailyKmBase: 0,
    employeeNumber: '', startDate: today(), endDate: '', endReason: '', isTemporary: false
  })
  showFormModal.value = true
}

const editingEmployee = computed<UserProfile | null>(() =>
  editingUid.value ? (employees.value.find(e => e.uid === editingUid.value) ?? null) : null
)

function openEdit(emp: UserProfile) {
  editingUid.value = emp.uid
  originalRate.value = emp.contractRate ?? 100
  rateChangedByUser.value = false
  saveError.value = ''
  Object.assign(form, {
    name: emp.name, firstName: emp.firstName, email: emp.email ?? '',
    birthDate: emp.birthDate, contractType: emp.contractType,
    contractRate: emp.contractRate ?? 100, weeklyHoursBase: emp.weeklyHoursBase ?? 40,
    dailyKmBase: emp.dailyKmBase ?? 0,
    employeeNumber: emp.employeeNumber ?? '',
    startDate: emp.startDate ?? '',
    endDate: emp.endDate ?? '',
    endReason: emp.endReason ?? '',
    isTemporary: emp.isTemporary ?? false
  })
  showFormModal.value = true
}

let pendingDeleteUid = ''
function confirmDelete(uid: string) {
  pendingDeleteUid = uid
  showDeleteModal.value = true
}

async function doDelete() {
  await deleteEmployee(pendingDeleteUid)
  showDeleteModal.value = false
  await load()
}

function onContractRateChange(val: string | number) {
  form.contractRate = Number(val)
  rateChangedByUser.value = true
}

async function saveEmployee() {
  if (
    editingUid.value &&
    form.contractType === 'percentage' &&
    rateChangedByUser.value &&
    Number(form.contractRate) !== originalRate.value
  ) {
    pendingRateChange.value = { oldRate: originalRate.value, newRate: Number(form.contractRate) }
    showRateConfirm.value = true
    return
  }
  await doSaveEmployee()
}

const saveError = ref('')

async function doSaveEmployee() {
  saving.value = true
  saveError.value = ''
  try {
    const uid = editingUid.value ?? crypto.randomUUID()
    await setUserProfile(uid, {
      uid,
      name: form.name!,
      firstName: form.firstName!,
      email: form.isTemporary ? (form.email || '') : form.email!,
      birthDate: form.birthDate ?? '',
      role: editingEmployee.value?.role ?? 'employee',
      contractType: form.contractType!,
      ...(form.contractType === 'percentage' ? { contractRate: Number(form.contractRate) } : {}),
      weeklyHoursBase: Number(form.weeklyHoursBase),
      dailyKmBase: Number(form.dailyKmBase),
      ...(form.employeeNumber ? { employeeNumber: form.employeeNumber } : {}),
      ...(form.startDate ? { startDate: form.startDate } : {}),
      ...(form.endDate   ? { endDate:   form.endDate }   : {}),
      ...(form.endDate && form.endReason ? { endReason: form.endReason } : {}),
      ...(form.isTemporary ? { isTemporary: true } : {})
    })

    if (pendingRateChange.value && editingUid.value) {
      const change: RateChange = {
        date: today(),
        oldRate: pendingRateChange.value.oldRate,
        newRate: pendingRateChange.value.newRate,
        changedByUid: authStore.firebaseUser?.uid ?? '',
        changedByName: `${authStore.profile?.firstName ?? ''} ${authStore.profile?.name ?? ''}`.trim()
      }
      await appendRateChange(editingUid.value, change)
      pendingRateChange.value = null
    }

    showFormModal.value = false
    showRateConfirm.value = false
    await load()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    saveError.value = msg
    console.error('[doSaveEmployee]', msg)
  } finally {
    saving.value = false
  }
}

async function sendInvite() {
  if (!inviteEmail.value) return
  inviting.value = true
  inviteError.value = ''
  try {
    const existing = await getProfileByEmail(inviteEmail.value.trim().toLowerCase())
    if (!existing) {
      inviteError.value = t.value.admin.inviteNoProfile
      return
    }
    const actionCodeSettings = {
      url: window.location.origin + '/auth/callback',
      handleCodeInApp: true
    }
    await sendSignInLinkToEmail(firebaseAuth, inviteEmail.value, actionCodeSettings)
    inviteSentTo.value = inviteEmail.value
    inviteEmail.value = ''
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code ?? ''
    if (code === 'auth/quota-exceeded') {
      inviteError.value = t.value.admin.inviteQuotaExceeded
    } else {
      inviteError.value = t.value.common.error
    }
  } finally {
    inviting.value = false
  }
}
</script>

<template>
  <div class="page-container space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <h1 class="text-2xl font-bold text-gray-900">{{ t.admin.employees }}</h1>
      <div class="flex gap-2">
        <AppButton variant="secondary" size="sm" @click="showInviteModal = true">
          ✉ {{ t.admin.inviteEmployee }}
        </AppButton>
        <AppButton variant="secondary" size="sm" @click="openAdd(); form.isTemporary = true">
          + {{ t.admin.addTempEmployee }}
        </AppButton>
        <AppButton size="sm" @click="openAdd">
          + {{ t.admin.addEmployee }}
        </AppButton>
      </div>
    </div>

    <!-- Table -->
    <div class="card overflow-x-auto">
      <div v-if="loading" class="flex justify-center py-10">
        <div class="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>

      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-100 text-xs text-gray-500">
            <th class="pb-3 font-medium text-start">{{ t.admin.firstName }} {{ t.admin.name }}</th>
            <th class="pb-3 font-medium text-center">{{ t.admin.employeeNumber }}</th>
            <th class="pb-3 font-medium text-start">{{ t.admin.email }}</th>
            <th class="pb-3 font-medium text-center">{{ t.admin.contractType }}</th>
            <th class="pb-3 font-medium text-center">{{ t.admin.dailyKm }}</th>
            <th class="pb-3 font-medium text-end">{{ t.common.actions }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="emp in employees"
            :key="emp.uid"
            class="border-b border-gray-50 hover:bg-gray-50 transition-colors"
          >
            <td class="py-3">
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">
                  {{ emp.firstName?.charAt(0) }}
                </div>
                {{ emp.firstName }} {{ emp.name }}
              </div>
            </td>
            <td class="py-3 text-center font-mono text-xs text-gray-500">{{ emp.employeeNumber || '—' }}</td>
            <td class="py-3 text-gray-500">
              {{ emp.email || '—' }}
              <AppBadge v-if="emp.isTemporary" variant="yellow" class="ml-1 text-xs">{{ t.admin.temporary }}</AppBadge>
            </td>
            <td class="py-3 text-center">
              <AppBadge :variant="emp.contractType === 'percentage' ? 'blue' : 'gray'">
                {{ emp.contractType === 'percentage' ? emp.contractRate + '%' : t.admin.hourly }}
              </AppBadge>
            </td>
            <td class="py-3 text-center">{{ emp.dailyKmBase }} km</td>
            <td class="py-3 text-end">
              <div class="flex gap-1 justify-end">
                <AppButton
                  v-if="emp.isTemporary"
                  variant="ghost" size="sm"
                  @click="$router.push('/admin/employees/' + emp.uid + '/time-entry')"
                >
                  ✎ {{ t.admin.timeEntry }}
                </AppButton>
                <AppButton variant="ghost" size="sm" @click="$router.push('/admin/employees/' + emp.uid + '/report')">
                  📊
                </AppButton>
                <AppButton variant="ghost" size="sm" @click="openEdit(emp)">{{ t.common.edit }}</AppButton>
                <AppButton variant="danger" size="sm" @click="confirmDelete(emp.uid)">{{ t.common.delete }}</AppButton>
              </div>
            </td>
          </tr>
          <tr v-if="!employees.length">
            <td colspan="6" class="py-8 text-center text-sm text-gray-400">—</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add/Edit Modal -->
    <AppModal
      :show="showFormModal"
      :title="editingUid ? t.admin.editEmployee : t.admin.addEmployee"
      @close="showFormModal = false"
    >
      <form class="space-y-4" @submit.prevent="saveEmployee">
        <!-- Temporary employee toggle -->
        <label class="flex items-center gap-2 cursor-pointer select-none">
          <input v-model="form.isTemporary" type="checkbox" class="rounded border-gray-300 text-primary-600 focus:ring-primary-500" :disabled="!!editingUid" />
          <span class="text-sm font-medium text-gray-700">{{ t.admin.temporary }}</span>
        </label>
        <p v-if="form.isTemporary" class="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
          {{ t.admin.tempEmployeeHint }}
        </p>

        <div class="grid grid-cols-2 gap-3">
          <AppInput v-model="form.firstName!" :label="t.admin.firstName" required />
          <AppInput v-model="form.name!" :label="t.admin.name" required />
        </div>
        <AppInput v-model="form.employeeNumber!" :label="t.admin.employeeNumber" />
        <AppInput v-if="!form.isTemporary" v-model="form.email!" :label="t.admin.email" type="email" required />
        <AppInput v-model="form.birthDate!" :label="t.admin.birthDate" type="date" />
        <AppSelect
          v-model="form.contractType!"
          :label="t.admin.contractType"
          :options="contractTypeOptions"
        />
        <div v-if="form.contractType === 'percentage'" class="grid grid-cols-2 gap-3">
          <AppSelect
            :model-value="form.contractRate"
            :label="t.admin.contractRate"
            :options="rateOptions"
            @update:model-value="onContractRateChange"
          />
          <AppInput
            v-model="form.weeklyHoursBase"
            :label="t.admin.weeklyHours"
            type="number"
            min="1"
          />
        </div>

        <!-- Rate change history -->
        <div
          v-if="editingUid && editingEmployee?.rateHistory?.length"
          class="border border-gray-100 rounded-xl p-3 space-y-2"
        >
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {{ t.admin.rateHistory }}
          </p>
          <table class="w-full text-xs">
            <thead>
              <tr class="text-gray-400 border-b border-gray-100">
                <th class="pb-1 font-medium text-start">{{ t.report.date }}</th>
                <th class="pb-1 font-medium text-center">{{ t.admin.rateBefore }}</th>
                <th class="pb-1 font-medium text-center">{{ t.admin.rateAfter }}</th>
                <th class="pb-1 font-medium text-end">{{ t.admin.rateChangedBy }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(h, idx) in [...(editingEmployee.rateHistory ?? [])].reverse()"
                :key="idx"
                class="border-b border-gray-50"
              >
                <td class="py-1 font-mono text-gray-600">{{ h.date }}</td>
                <td class="py-1 text-center text-gray-400">{{ h.oldRate }}%</td>
                <td class="py-1 text-center font-semibold text-primary-700">{{ h.newRate }}%</td>
                <td class="py-1 text-end text-gray-500">{{ h.changedByName }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <AppInput
          v-model="form.dailyKmBase"
          :label="t.admin.dailyKm"
          type="number"
          min="0"
        />

        <!-- Employment period -->
        <div class="border-t border-gray-100 pt-3 space-y-3">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">{{ t.admin.employmentPeriod }}</p>
          <AppInput v-model="form.startDate!" :label="t.admin.startDate" type="date" />
          <AppInput v-model="form.endDate!" :label="t.admin.endDate" type="date" :min="form.startDate" />
          <AppSelect
            v-if="form.endDate"
            v-model="form.endReason!"
            :label="t.admin.endReason"
            :placeholder="t.absence.selectReason"
            :options="endReasonOptions"
          />
        </div>

        <p v-if="saveError" class="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{{ saveError }}</p>
        <div class="flex gap-3 justify-end pt-2">
          <AppButton variant="secondary" type="button" @click="showFormModal = false">
            {{ t.admin.cancel }}
          </AppButton>
          <AppButton type="submit" :loading="saving">{{ t.admin.saveEmployee }}</AppButton>
        </div>
      </form>
    </AppModal>

    <!-- Rate change confirmation -->
    <AppModal
      :show="showRateConfirm"
      :title="t.admin.confirmRateChange"
      @close="showRateConfirm = false; pendingRateChange = null"
    >
      <div class="space-y-4">
        <p class="text-sm text-gray-700">
          {{ i18n.locale === 'he'
            ? `האם אתה בטוח שברצונך לשנות את אחוז המשרה של ${form.firstName} מ-${pendingRateChange?.oldRate}% ל-${pendingRateChange?.newRate}%?`
            : `Change ${form.firstName}'s rate from ${pendingRateChange?.oldRate}% to ${pendingRateChange?.newRate}%?`
          }}
        </p>
        <div class="flex items-center gap-4 justify-center py-2">
          <span class="text-2xl font-bold text-gray-400">{{ pendingRateChange?.oldRate }}%</span>
          <span class="text-gray-400">→</span>
          <span class="text-2xl font-bold text-primary-700">{{ pendingRateChange?.newRate }}%</span>
        </div>
        <p class="text-xs text-gray-400 text-center">{{ t.admin.confirmRateChangeNote }}</p>
        <div class="flex gap-3 justify-end">
          <AppButton variant="secondary" @click="showRateConfirm = false; pendingRateChange = null">
            {{ t.admin.cancel }}
          </AppButton>
          <AppButton :loading="saving" @click="doSaveEmployee">
            {{ t.admin.confirm }}
          </AppButton>
        </div>
      </div>
    </AppModal>

    <!-- Delete confirm -->
    <AppModal :show="showDeleteModal" :title="t.admin.deleteEmployee" @close="showDeleteModal = false">
      <p class="text-sm text-gray-600 mb-4">{{ t.admin.confirmDelete }}</p>
      <div class="flex gap-3 justify-end">
        <AppButton variant="secondary" @click="showDeleteModal = false">{{ t.common.no }}</AppButton>
        <AppButton variant="danger" @click="doDelete">{{ t.common.yes }}</AppButton>
      </div>
    </AppModal>

    <!-- Invite Modal -->
    <AppModal :show="showInviteModal" :title="t.admin.inviteEmployee" @close="showInviteModal = false; inviteError = ''; inviteSentTo = ''">
      <div class="space-y-4">
        <div v-if="inviteSentTo" class="bg-green-50 text-green-700 text-sm px-3 py-2 rounded-lg">
          {{ t.admin.inviteSent }} {{ inviteSentTo }}
        </div>
        <div v-if="inviteError" class="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">
          {{ inviteError }}
        </div>
        <AppInput v-model="inviteEmail" :label="t.admin.email" type="email" @input="inviteError = ''" />
        <div class="flex gap-3 justify-end">
          <AppButton variant="secondary" @click="showInviteModal = false">{{ t.admin.cancel }}</AppButton>
          <AppButton :loading="inviting" @click="sendInvite">{{ t.admin.sendInvite }}</AppButton>
        </div>
      </div>
    </AppModal>
  </div>
</template>
