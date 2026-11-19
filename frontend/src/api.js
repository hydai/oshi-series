// 後端網址，來自 .env 的 VITE_API_URL
const API_ROOT = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

// YouTube 頻道的 @帳號代碼格式（支援各國文字）
const HANDLE_PATTERN = /^@[\p{L}\p{N}_\-\.·]+$/u
export const isValidHandle = (value) => typeof value === 'string' && HANDLE_PATTERN.test(value)

// 向後端查詢某個頻道；path 是 '/api/channel-last-live' 或 '/api/channel-diligence'
export const queryChannel = (path, channelId) => fetch(`${API_ROOT}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ channelId }),
})
