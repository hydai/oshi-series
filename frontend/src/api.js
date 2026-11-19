// 後端網址，來自 .env 的 VITE_API_URL
const API_ROOT = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

// 向後端查詢某個頻道；path 請用 platforms.js 裡的 lastPath 或 recentPath
export const queryChannel = (path, channelId) => fetch(`${API_ROOT}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ channelId }),
})
