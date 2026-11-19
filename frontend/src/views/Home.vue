<template lang="pug">
.home__wrapper.d-flex.f-center.f-col.w-100.h-100
  h1(v-if="mode === 'last'") 你推多久沒開台了？
  h1(v-else) 你推最近開了多久？
  .d-flex.f-center.f-col
    .platform-select.d-flex.m-top(v-if="TWITCH_ENABLED")
      span(:class="{ active: platform.key === 'youtube' }" @click="selectPlatform('youtube')") YouTube
      span(:class="{ active: platform.key === 'twitch' }" @click="selectPlatform('twitch')") Twitch
    .home__panel.d-flex.f-center.m-top
      input.m-1(v-model="inputValue" @input="warningText = null" @keypress.enter="doClick" :placeholder="platform.placeholder")
      span.material-symbols-outlined.icon-timer(@click="doClick") timer
    span.text-hint
      | {{ platform.hint }}
      a(href="#" @click.prevent="inputValue = platform.examples[mode]") {{ platform.examples[mode] }}
    span.text-warn.m-top(v-if="warningText") {{ warningText }}
    RouterLink.text-hint.switch-link(v-if="mode === 'last'" to="/recent") {{ '>> 改查「你推最近開了多久？」' }}
    RouterLink.text-hint.switch-link(v-else to="/") {{ '>> 改查「你推多久沒開台了？」' }}
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PLATFORMS, TWITCH_ENABLED } from '@/platforms.js'

const route = useRoute()
const router = useRouter()
const mode = route.meta.mode
const platform = ref(PLATFORMS.youtube)
const inputValue = ref('')
const warningText = ref(null)

const selectPlatform = (key) => {
  platform.value = PLATFORMS[key]
  inputValue.value = ''
  warningText.value = null
}
const doClick = () => {
  let channelId = (inputValue.value || '').trim()
  // Twitch 帳號不分大小寫，一律轉成小寫
  if (platform.value.key === 'twitch') channelId = channelId.toLowerCase()
  if (platform.value.pattern.test(channelId)) {
    router.push({ name: mode === 'last' ? 'LastLive' : 'RecentLive', params: { channelId } })
  } else {
    warningText.value = platform.value.key === 'youtube'
      ? '帳號代碼格式有誤，請輸入 @ 開頭的帳號代碼'
      : '帳號格式有誤，請輸入頻道網址最後那一段（英文、數字、底線）'
  }
}
</script>

<style lang="sass">
.home
  &__wrapper
    & > h1
      text-align: center
      @media screen and (max-width: 897px)
        font-size: 2rem
        margin-bottom: 1rem
  &__panel
    @media screen and (max-width: 897px)
      flex-direction: column
.platform-select
  gap: 1.5rem
  & > span
    cursor: pointer
    user-select: none
    padding-bottom: 3px
    font-weight: 700
    opacity: 0.4
    border-bottom: 2px solid transparent
    transition: .2s
    &.active
      opacity: 1
      border-bottom-color: rgba(var(--black), 0.6)
input
  font-family: inherit
  @media screen and (max-width: 897px)
    max-width: 200px
    text-align: center
.text-hint
  font-size: 1rem
  opacity: 0.8
  & > a
    color: inherit
    text-decoration: none
    padding-bottom: 3px
    &:hover
      border-bottom: 1px solid rgba(black, 0.3)
.switch-link
  margin-top: 2.5rem
  color: inherit
  text-decoration: none
  padding-bottom: 3px
  border-bottom: 1px solid transparent
  &:hover
    border-bottom: 1px solid rgba(black, 0.3)
.text-warn
  color: #E84A5F
  font-weight: 800
.icon-timer
  user-select: none
  cursor: pointer
  color: rgba(var(--black), 0.6)
  transition: .2s
  transform: rotate(30deg)
  &:hover
    transform: scale(1.1)
    color: rgba(#FF0000, 0.8)
</style>
