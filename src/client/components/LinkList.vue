<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { LinkItem } from "../types";

defineProps<{ items: LinkItem[] }>();
</script>

<template>
  <ul class="links">
    <li
      v-for="item in items"
      :key="`${item.label}:${item.text}`"
    >
      <span class="links__label">{{ item.label }}<span
        class="arrow"
        aria-hidden="true"
      >→</span></span><RouterLink
        v-if="item.to"
        :to="item.to"
      >{{ item.text }}</RouterLink><a
        v-else
        :href="item.href"
        target="_blank"
        rel="noopener noreferrer"
      >{{ item.text }}</a>
    </li>
  </ul>
</template>
