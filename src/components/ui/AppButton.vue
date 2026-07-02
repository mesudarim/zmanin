<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}>()
</script>

<template>
  <button
    :type="type ?? 'button'"
    :disabled="disabled || loading"
    :class="[
      'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2',
      // Size
      size === 'sm'  ? 'px-3 py-1.5 text-sm' :
      size === 'lg'  ? 'px-6 py-3 text-base'  :
                       'px-4 py-2 text-sm',
      // Variant
      variant === 'secondary'
        ? 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-300'
        : variant === 'danger'
        ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
        : variant === 'ghost'
        ? 'text-gray-600 hover:bg-gray-100 focus:ring-gray-300'
        : 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500',
      // States
      (disabled || loading) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
    ]"
  >
    <span v-if="loading" class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
    <slot />
  </button>
</template>
