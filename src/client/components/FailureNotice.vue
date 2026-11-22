<script setup lang="ts">
import { computed } from "vue";
import type { Failure } from "../api";
import { errorText } from "../messages";

const props = defineProps<{ failure: Failure }>();
const text = computed(() => errorText(props.failure));
</script>

<template>
  <h1 class="lead">{{ text.title }}</h1>
  <p
    v-if="text.detail"
    class="note"
  >{{ text.detail }}</p>
</template>
