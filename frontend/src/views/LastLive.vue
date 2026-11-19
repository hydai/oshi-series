<template lang="pug">
.channel__wrapper.d-flex.f-center.f-col.w-100.h-100
  .checking-text.d-flex.f-center.f-col(v-if="!resultStatus")
    span 分析中...
    span.waking-text(v-if="slowLoading") 伺服器可能正在喚醒，第一次查詢最多需要約一分鐘
  template(v-else-if="resultStatus === 'valid'")
    .channel__info.m-bottom
      span 距離
      span.channel-name {{ channelName }}
      span 上次在 YouTube 開台已經過了
    .channel__time
      span.channel__time-text.m-bottom {{ `${elapsed[0]} 天 ${elapsed[1]}時 ` }}
      span.channel__time-text {{ `${elapsed[2]}分 ${elapsed[3]}秒` }}
    .channel__care.d-flex.f-center.m-top.f-wrap
      a(:href="`https://www.youtube.com/${channelId}?sub_confirmation=1`" target="_blank" rel="noopener noreferrer") {{ '>> 訂閱頻道' }}
      a(v-if="lastLiveId" :href="`https://www.youtube.com/watch?v=${lastLiveId}`" target="_blank" rel="noopener noreferrer") {{ '>> 看上一場直播' }}
      a.highlight(v-if="deerUrl" :href="`https://deerdonate.herokuapp.com/donation/${deerUrl}`" target="_blank" rel="noopener noreferrer") {{ '>> 贊助主播' }}
      a.highlight(v-if="ecPayUrl" :href="`https://p.ecpay.com.tw/${ecPayUrl}`" target="_blank" rel="noopener noreferrer") {{ '>> 贊助主播' }}
  .channel__info.invalid-text.d-flex.f-center.f-col(v-else-if="resultStatus === 'live'")
    a.channel__info__now_streaming_cover(:href="`https://www.youtube.com/${channelId}/live`" target="_blank" rel="noopener noreferrer")
      img(:src="`https://img.youtube.com/vi/${lastLiveId}/maxresdefault.jpg`" alt="直播畫面")
    span 這個頻道正在直播中
    a.highlight(:href="`https://www.youtube.com/${channelId}/live`" target="_blank" rel="noopener noreferrer") {{ viewCount ? `>> 前往直播（目前 ${viewCount} 人觀看）` : '>> 前往直播' }}
  .invalid-text.d-flex.f-center.f-col(v-else-if="resultStatus === 'empty'")
    span.m-bottom {{ channelId }}
    span 目前沒有直播紀錄
  .invalid-text.d-flex.f-center(v-else-if="resultStatus === 'unsafe'") 帳號代碼或格式錯誤，無法找到頻道
  .invalid-text.d-flex.f-center(v-else-if="resultStatus === 'busy'") 查詢次數過多，請稍後再試
  .invalid-text.d-flex.f-center(v-else) 發生錯誤，請稍後再試
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { isValidHandle, queryChannel } from '@/api.js'

const route = useRoute()
const channelId = route.params.channelId

// 畫面狀態：null=查詢中、valid=有結果、live=正在直播、empty=沒有直播紀錄、
//          unsafe=找不到頻道、busy=查詢次數過多、error=其他錯誤
const resultStatus = ref(null)
const slowLoading = ref(false)
const channelName = ref('')
const lastLiveId = ref(null)
const elapsed = ref([0, 0, 0, 0])
const deerUrl = ref(null)
const ecPayUrl = ref(null)
const viewCount = ref(0)
let timer = null
let slowTimer = null

// 計算「從某個時間點到現在」過了幾天、幾時、幾分、幾秒
const getElapsedSince = (dateString) => {
  const offset = new Date() - new Date(dateString)
  const days = Math.floor(offset / 86400000)
  const hours = Math.floor((offset % 86400000) / 3600000)
  const minutes = Math.floor((offset % 3600000) / 60000)
  const seconds = Math.floor((offset % 60000) / 1000)
  return [days, hours, minutes, seconds]
}
// 贊助連結是從影片說明欄取出的，尾端可能帶有換行符號的編碼，要先去掉
const cleanLink = (str) => (typeof str === 'string' ? str.replace('&#13;', '') : null)

const doFetching = async () => {
  try {
    const res = await queryChannel('/api/channel-last-live', channelId)
    if (res.status === 422) {
      // 頻道正在直播
      const live = await res.json()
      viewCount.value = live.count
      lastLiveId.value = live.lastLiveId
      resultStatus.value = 'live'
      return
    }
    if (!res.ok) {
      const statusMap = { 400: 'unsafe', 403: 'empty', 429: 'busy' }
      resultStatus.value = statusMap[res.status] || 'error'
      return
    }
    const result = await res.json()
    channelName.value = result.name
    lastLiveId.value = result.lastLiveId
    deerUrl.value = cleanLink(result.deer)
    ecPayUrl.value = cleanLink(result.ecpay)
    // 每秒更新一次，讓計時器持續往上數
    elapsed.value = getElapsedSince(result.lastLiveTime)
    timer = window.setInterval(() => {
      elapsed.value = getElapsedSince(result.lastLiveTime)
    }, 1000)
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
onUnmounted(() => {
  window.clearInterval(timer)
  window.clearTimeout(slowTimer)
})
</script>

<style lang="sass" scoped>
.channel
  &__info
    font-size: 1.75rem
    font-weight: 600
    max-width: 95%
    text-align: center
    line-height: 1.35
    @media screen and (max-width: 897px)
      font-size: 1.2rem
    @media screen and (max-height: 320px)
        font-size: 1rem
        margin-bottom: 0.5rem
    & > span.channel-name
      display: inline-block
      font-size: 2rem
      border-bottom: 2px solid
      margin: 0 1rem
      @media screen and (max-width: 897px)
        display: flex
        padding-bottom: 0.5rem
        margin: 1rem
      @media screen and (max-width: 500px)
        font-size: 1.5rem
    &__now_streaming_cover
      width: 100%
      max-width: 480px
      aspect-ratio: 16/9
      margin-bottom: 32px
      @media screen and (max-width: 897px)
        margin-bottom: 8px
      & > img
        width: 100%
        height: 100%
        object-fit: cover
  &__time
    margin: 2rem 0
    @media screen and (max-width: 897px)
      margin: 0.5rem 0
    @media screen and (max-height: 500px)
      margin: 0.5rem 0
  &__time-text
    text-align: center
    font-size: 7rem
    font-weight: 700
    @media screen and (max-width: 1200px)
      display: flex
      flex-direction: column
    @media screen and (max-width: 897px)
      font-size: 3rem
    @media screen and (max-height: 500px)
      font-size: 3rem
    @media screen and (max-height: 320px)
      font-size: 2rem
    @media screen and (max-width: 320px)
      font-size: 2rem
  &__care
    & > a
      color: inherit
      text-decoration: none
      padding-bottom: 3px
      margin: 0 1rem 1rem
      font-weight: 700
      font-size: 2rem
      border-bottom: 1px solid transparent
      &.highlight
        filter: drop-shadow(2px 2px 2px rgba(black, 0.4))
        &:hover
          opacity: 0.8
      @media screen and (max-width: 897px)
        font-size: 1rem
      @media screen and (max-height: 320px)
        font-size: 1rem
      &:hover
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
