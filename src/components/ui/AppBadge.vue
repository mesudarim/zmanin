<script setup lang="ts">
defineProps<{ variant?: 'green' | 'red' | 'blue' | 'yellow' | 'gray' }>()
</script>

<template>
  <span
    :class="[
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      variant === 'green'  ? 'bg-green-100 text-green-800'   :
      variant === 'red'    ? 'bg-red-100 text-red-800'       :
      variant === 'blue'   ? 'bg-blue-100 text-blue-800'     :
      variant === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                             'bg-gray-100 text-gray-700'
    ]"
  >
    <slot />
  </span>
</template>
