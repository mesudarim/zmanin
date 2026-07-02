<script setup lang="ts">
defineProps<{
  modelValue: string | number
  options: { value: string | number; label: string }[]
  placeholder?: string
  label?: string
  error?: string
}>()
defineEmits<{ 'update:modelValue': [value: string | number] }>()
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" class="text-sm font-medium text-gray-700">{{ label }}</label>
    <select
      :value="modelValue"
      class="block w-full rounded-xl border-gray-300 shadow-sm text-sm focus:border-primary-500 focus:ring-primary-500"
      :class="error ? 'border-red-400' : ''"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
    </select>
    <p v-if="error" class="text-xs text-red-500">{{ error }}</p>
  </div>
</template>
