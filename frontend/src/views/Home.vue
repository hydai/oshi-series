<template lang="pug">
.home__wrapper.d-flex.f-center.f-col.w-100.h-100
  h1(v-if="mode === 'last'") 你推多久沒開台了？
  h1(v-else) 你推最近開了多久？
  .d-flex.f-center.f-col
    .home__panel.d-flex.f-center.m-top
      input.m-1(v-model="inputValue" @input="warningText = null" @keypress.enter="doClick" placeholder="請輸入帳號代碼")
      span.material-symbols-outlined.icon-timer(@click="doClick") timer
    span.text-hint
      | {{ 'YouTube 頻道的帳號代碼，e.g. ' }}
      a(href="#" @click.prevent="inputValue = example") {{ example }}
    span.text-warn.m-top(v-if="warningText") {{ warningText }}
    RouterLink.text-hint.switch-link(v-if="mode === 'last'" to="/recent") {{ '>> 改查「你推最近開了多久？」' }}
    RouterLink.text-hint.switch-link(v-else to="/") {{ '>> 改查「你推多久沒開台了？」' }}
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isValidHandle } from '@/api.js'

const route = useRoute()
const router = useRouter()
const mode = route.meta.mode
// 輸入框下方的範例頻道，點一下會自動填入
const example = mode === 'last' ? '@TED' : '@NASA'
const inputValue = ref('')
const warningText = ref(null)

const doClick = () => {
  const channelId = (inputValue.value || '').trim()
  if (isValidHandle(channelId)) {
    router.push({ name: mode === 'last' ? 'LastLive' : 'RecentLive', params: { channelId } })
  } else {
    warningText.value = '帳號代碼格式有誤，請輸入 @ 開頭的帳號代碼'
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
