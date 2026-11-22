<script setup lang="ts">
import type { CounterPart } from "../types";

// Each group stays on one line; groups wrap on narrow screens.
defineProps<{ groups: CounterPart[][]; ticking?: boolean }>();
</script>

<template>
  <p
    class="counter"
    :role="ticking ? 'timer' : undefined"
  >
    <span
      v-for="(group, i) in groups"
      :key="i"
      class="counter__group"
    >
      <template
        v-for="part in group"
        :key="part.unit"
      ><span class="counter__value">{{ part.value }}</span><span class="counter__unit">{{ " " + part.unit + " " }}</span></template>
    </span>
  </p>
</template>
