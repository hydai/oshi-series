// 兩個平台各自的設定：帳號格式、要呼叫的後端路徑、要連去的網址、畫面文字。
// 畫面（views）只管顯示，平台之間的差異都集中在這個檔案。

// 是否顯示 Twitch：在 .env 設定 VITE_ENABLE_TWITCH=true 才會出現（後端也要設定 Twitch 憑證）
export const TWITCH_ENABLED = import.meta.env.VITE_ENABLE_TWITCH === 'true'

export const PLATFORMS = {
  youtube: {
    key: 'youtube',
    label: 'YouTube',
    // YouTube 的帳號代碼以 @ 開頭（支援各國文字）
    pattern: /^@[\p{L}\p{N}_\-\.·]+$/u,
    placeholder: '請輸入帳號代碼',
    hint: 'YouTube 頻道的帳號代碼，e.g. ',
    examples: { last: '@TED', recent: '@NASA' },
    lastPath: '/api/channel-last-live',
    recentPath: '/api/channel-diligence',
    followText: '>> 訂閱頻道',
    channelUrl: (id) => `https://www.youtube.com/${id}?sub_confirmation=1`,
    videoUrl: (videoId) => `https://www.youtube.com/watch?v=${videoId}`,
    liveUrl: (id) => `https://www.youtube.com/${id}/live`,
    liveImage: (live) => `https://img.youtube.com/vi/${live.lastLiveId}/maxresdefault.jpg`,
  },
  twitch: {
    key: 'twitch',
    label: 'Twitch',
    // Twitch 的帳號是小寫英文、數字、底線，沒有 @
    pattern: /^[a-z0-9_]{3,25}$/,
    placeholder: '請輸入頻道帳號',
    hint: 'Twitch 頻道網址最後那一段，e.g. ',
    examples: { last: 'nasa', recent: 'nasa' },
    lastPath: '/api/twitch-last-live',
    recentPath: '/api/twitch-diligence',
    followText: '>> 追隨頻道',
    channelUrl: (id) => `https://www.twitch.tv/${id}`,
    videoUrl: (videoId) => `https://www.twitch.tv/videos/${videoId}`,
    liveUrl: (id) => `https://www.twitch.tv/${id}`,
    liveImage: (live) => live.thumbnail,
  },
}

// 從網址上的帳號判斷是哪個平台：@ 開頭是 YouTube，其餘是 Twitch；格式都不符合就回傳 null
export const detectPlatform = (channelId) => {
  if (typeof channelId !== 'string') return null
  if (PLATFORMS.youtube.pattern.test(channelId)) return PLATFORMS.youtube
  if (PLATFORMS.twitch.pattern.test(channelId)) return PLATFORMS.twitch
  return null
}
