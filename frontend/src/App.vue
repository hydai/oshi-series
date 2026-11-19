<template lang="pug">
.app-shell(:class="`mode-${route.meta.mode || 'last'}`")
  RouterView(:key="route.fullPath")
  .footer-wrapper.d-flex.f-col(v-if="footerText")
    a(v-if="footerUrl" :href="footerUrl" target="_blank" rel="noopener noreferrer") {{ footerText }}
    span(v-else) {{ footerText }}
</template>

<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()
// 頁尾署名：在 .env 設定 VITE_FOOTER_TEXT / VITE_FOOTER_URL，留空就不顯示
const footerText = import.meta.env.VITE_FOOTER_TEXT
const footerUrl = import.meta.env.VITE_FOOTER_URL
</script>

<style lang="sass">
#app
  width: 100%
  height: 100vh
  height: 100dvh
.app-shell
  position: relative
  width: 100%
  height: 100%
  font-family: 'Noto Serif TC', sans-serif
  letter-spacing: 0.15rem
  background: linear-gradient(135deg, rgb(158 162 165 / 70%) 20%, rgb(113 166 219 / 70%))
  &.mode-recent
    background: linear-gradient(135deg, rgb(134 133 159 / 70%) 20%, rgb(254 254 255 / 70%))
    @media screen and (max-width: 897px)
      background: linear-gradient(135deg, rgba(134, 133, 159, 0.7) 20%, rgb(223 223 223 / 70%))
  color: rgb(var(--black))
.footer-wrapper
  position: absolute
  bottom: 2rem
  left: 50%
  transform: translateX(-50%)
  border-bottom: 1px solid rgba(var(--black), 0.6)
  padding-bottom: 3px
  font-weight: 900
  @media screen and (max-height: 650px)
    bottom: 6px
    font-size: 0.75rem
  @media screen and (max-height: 400px)
    display: none
  & > a
    color: inherit
    text-decoration: none
</style>
