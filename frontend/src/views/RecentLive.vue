<template lang="pug">
.channel__wrapper.d-flex.f-center.f-col.w-100.h-100
  .checking-text.d-flex.f-center.f-col(v-if="!resultStatus")
    span 分析中...
    span.waking-text(v-if="slowLoading") 伺服器可能正在喚醒，第一次查詢最多需要約一分鐘
  template(v-else-if="resultStatus === 'valid'")
    .channel__info
      span 最近 30 天內
      a.channel-name.m-bottom(:href="`https://www.youtube.com/${channelId}?sub_confirmation=1`" target="_blank" rel="noopener noreferrer") {{ channelName }}
      span 在 YouTube 總共直播了
    .channel__time
      span.channel__time-text.m-bottom {{ `${totalTime[0]} 時 ` }}
      span.channel__time-text {{ `${totalTime[1]} 分 ${totalTime[2]} 秒` }}
    .channel__care.d-flex.f-center.m-top.f-wrap
      template(v-if="longestLive")
        a.sub_title.d-flex.f-center.w-100 {{ `最長紀錄： ${longestLive.length}` }}
        a(:href="`https://www.youtube.com/watch?v=${longestLive.id}`" target="_blank" rel="noopener noreferrer") {{ '>> 看最長的那一場' }}
      a.highlight(v-if="deerUrl" :href="`https://deerdonate.herokuapp.com/donation/${deerUrl}`" target="_blank" rel="noopener noreferrer") {{ '>> 贊助主播' }}
      a.highlight(v-if="ecPayUrl" :href="`https://p.ecpay.com.tw/${ecPayUrl}`" target="_blank" rel="noopener noreferrer") {{ '>> 贊助主播' }}
  template(v-else-if="resultStatus === 'empty'")
    .channel__info.m-bottom
      a.channel-name {{ channelName || channelId }}
    .invalid-text.d-flex.f-center.f-col
      span 最近 30 天內沒有直播紀錄
      RouterLink.m-bottom(:to="{ name: 'LastLive', params: { channelId } }") {{ '>> 你推多久沒開台了？' }}
  template(v-else-if="resultStatus === 'none'")
    .channel__info.m-bottom
      a.channel-name {{ channelId }}
    .invalid-text.d-flex.f-center.f-col
      span 此頻道沒有直播紀錄
  .invalid-text.d-flex.f-center(v-else-if="resultStatus === 'unsafe'") 帳號代碼錯誤，無法找到頻道
  .invalid-text.d-flex.f-center(v-else-if="resultStatus === 'busy'") 目前查詢人數較多，請稍後再試
  .invalid-text.d-flex.f-center(v-else) 發生錯誤，請稍後再試
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { isValidHandle, queryChannel } from '@/api.js'

const route = useRoute()
const channelId = route.params.channelId

// 畫面狀態：null=查詢中、valid=有結果、empty=30 天內沒有直播、none=頻道沒有任何直播、
//          unsafe=找不到頻道、busy=伺服器忙碌、error=其他錯誤
const resultStatus = ref(null)
const slowLoading = ref(false)
const channelName = ref('')
const totalTime = ref([0, 0, 0])
const longestLive = ref(null)
const deerUrl = ref(null)
const ecPayUrl = ref(null)
let slowTimer = null

// 把 "1:23:45" 或 "23:45" 這種影片長度換算成秒數
const parseLengthToSeconds = (timeStr) => {
  const parts = timeStr.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}
const splitSecondsToHMS = (totalSeconds) => [
  Math.floor(totalSeconds / 3600),
  Math.floor((totalSeconds % 3600) / 60),
  totalSeconds % 60,
]
const formatSecondsToHMS = (totalSeconds) => {
  const [hours, minutes, seconds] = splitSecondsToHMS(totalSeconds)
  return `${hours} 時 ${minutes}分 ${seconds}秒`
}
// 贊助連結是從影片說明欄取出的，尾端可能帶有換行符號的編碼，要先去掉
const cleanLink = (str) => (typeof str === 'string' ? str.replace('&#13;', '') : null)

const doFetching = async () => {
  try {
    const res = await queryChannel('/api/channel-diligence', channelId)
    if (!res.ok) {
      const statusMap = { 400: 'unsafe', 403: 'none', 429: 'busy' }
      resultStatus.value = statusMap[res.status] || 'error'
      return
    }
    const { data } = await res.json()
    channelName.value = data.name
    deerUrl.value = cleanLink(data.deer)
    ecPayUrl.value = cleanLink(data.ecpay)
    if (data.list.length === 0) {
      resultStatus.value = 'empty'
      return
    }
    // 把每一場直播的長度加總，並找出最長的一場
    let totalSeconds = 0
    let longestSeconds = 0
    let longestId = null
    data.list.forEach((stream) => {
      const seconds = parseLengthToSeconds(stream.length)
      totalSeconds += seconds
      if (seconds > longestSeconds) {
        longestSeconds = seconds
        longestId = stream.id
      }
    })
    if (longestId) longestLive.value = { id: longestId, length: formatSecondsToHMS(longestSeconds) }
    totalTime.value = splitSecondsToHMS(totalSeconds)
    resultStatus.value = 'valid'
  } catch (error) {
    resultStatus.value = 'error'
  }
}

onMounted(() => {
  if (!isValidHandle(channelId)) {
    resultStatus.value = 'unsafe'
    return
  }
  // 等超過 6 秒還沒有結果，提示使用者後端可能正在從休眠中喚醒
  slowTimer = window.setTimeout(() => { slowLoading.value = true }, 6000)
  doFetching()
})
onUnmounted(() => window.clearTimeout(slowTimer))
</script>

<style lang="sass" scoped>
.channel
  &__info
    font-size: 1.75rem
    font-weight: 600
    max-width: 95%
    text-align: center
    @media screen and (max-width: 897px)
      font-size: 1.5rem
    @media screen and (max-height: 320px)
        font-size: 1rem
        margin-bottom: 0.5rem
    & > span
      white-space: nowrap
    & > a.channel-name
      display: inline-block
      font-size: 2rem
      line-height: 1.2
      border-bottom: 2px solid
      color: inherit
      text-decoration: none
      margin: 1rem
      @media screen and (max-width: 897px)
        display: flex
        padding-bottom: 0.5rem
      @media screen and (max-width: 500px)
        font-size: 1.5rem
  &__time
    margin: 2rem 0
    @media screen and (max-width: 897px), screen and (max-height: 500px)
      margin: 0.5rem 0
  &__time-text
    text-align: center
    font-size: 7rem
    font-weight: 700
    @media screen and (max-width: 1200px)
      display: flex
      flex-direction: column
      &.m-bottom
        font-size: 8rem
    @media screen and (max-width: 897px), screen and (max-height: 500px)
      font-size: 3rem
      &.m-bottom
        font-size: 3.5rem
    @media screen and (max-height: 320px),  screen and (max-width: 320px)
      font-size: 2rem
      &.m-bottom
        font-size: 2.5rem
  &__care
    & > a
      display: flex
      align-items: center
      justify-content: center
      color: inherit
      text-decoration: none
      padding-bottom: 6px
      margin: 0 1rem 1rem
      font-weight: 700
      font-size: 2rem
      border-bottom: 1px solid transparent
      &.sub_title
        margin-bottom: 3rem
        @media screen and (max-width: 897px), screen and (max-height: 320px)
          margin-bottom: 2rem
      &.highlight
        filter: drop-shadow(2px 2px 2px rgba(black, 0.4))
        &:hover
          opacity: 0.8
      @media screen and (max-width: 897px), screen and (max-height: 320px)
        font-size: 1rem
      &:not(.sub_title):hover
          border-bottom: 1px solid rgba(black, 0.3)
.checking-text
  font-size: 2rem
  opacity: 0.8
  text-align: center
.waking-text
  margin-top: 1rem
  font-size: 1rem
.invalid-text
  line-height: 1.5
  max-width: 80%
  font-size: 2rem
  opacity: 0.8
  text-align: center
  & > a
    color: inherit
    margin-top: 2rem
    text-decoration: none
    padding-bottom: 3px
    font-weight: 700
    font-size: 1.5rem
    border-bottom: 1px solid transparent
    &:hover
      border-bottom: 1px solid rgba(black, 0.3)
    @media screen and (max-width: 400px)
      font-size: 1rem
</style>
