<script setup lang="ts">
import { RouterView, useRoute } from "vue-router";

const route = useRoute();
</script>

<template>
  <RouterView :key="route.fullPath" />
  <footer class="site-footer">
    <a href="https://oshi.tw">oshi.tw</a>
    <span
      class="dot"
      aria-hidden="true"
    >·</span>
    <a
      href="https://www.youtube.com/t/terms"
      target="_blank"
      rel="noopener noreferrer"
    >YouTube 服務條款</a>
    <span
      class="dot"
      aria-hidden="true"
    >·</span>
    <a
      href="https://policies.google.com/privacy"
      target="_blank"
      rel="noopener noreferrer"
    >Google 隱私權政策</a>
  </footer>
</template>
