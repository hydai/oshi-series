const he = require('he')
const fetchPage = require('./fetchPage')
const { setWithLimit } = require('./cache')

// 頻道的 @帳號代碼格式（YouTube 的 handle 支援各國文字）
const HANDLE_PATTERN = /^@[\p{L}\p{N}_\-\.·]+$/u
const isValidHandle = (handle) => typeof handle === 'string' && HANDLE_PATTERN.test(handle)

// 頻道資訊快取：成功 5 天；feed 抓取失敗時只快取 15 分鐘，避免每個請求都重打失效的 feed
const CHANNEL_INFO_TTL = 5 * 24 * 60 * 60 * 1000
const CHANNEL_INFO_FAIL_TTL = 15 * 60 * 1000
const channelInfoCache = new Map()

// 網頁上的文字是 HTML 編碼過的（例如 &amp;），轉回一般文字再交給前端
const decode = (text) => (typeof text === 'string' ? he.decode(text) : text)

/**
 * 取得頻道的顯示名稱，以及影片說明欄裡的贊助連結（如果有）。
 *
 * @param {string} handle 頻道的 @帳號代碼
 * @param {string|undefined} youtubeChannelId 頻道頁面上的 UC 開頭頻道 ID
 * @param {string|undefined} pageTitle 頻道頁面上的標題（最可靠的名稱來源）
 * @param {string|undefined} fallbackName 以上都拿不到時使用的名稱
 * @returns {Promise<{ name: string, deer?: string, ecpay?: string }>}
 */
const getChannelInfo = async (handle, youtubeChannelId, pageTitle, fallbackName) => {
    const now = Date.now()
    const cached = channelInfoCache.get(handle)
    if (cached && cached.expiredAt > now) return cached.info

    const feed = youtubeChannelId
        ? await fetchPage(`https://www.youtube.com/feeds/videos.xml?channel_id=${youtubeChannelId}`, [
            /<name>(.*?)<\/name>/s,
            /deerdonate.herokuapp.com\/donation\/(.*?)[\n|\s|\\|\.]/s,
            /https:\/\/p.ecpay.com.tw\/([^\s<>]+)/,
        ])
        : null

    let info = null
    let ttl = CHANNEL_INFO_TTL
    if (feed?.data) {
        info = {
            name: decode(pageTitle || feed.data[0]?.[1] || fallbackName || ''),
            deer: feed.data[1]?.[1],
            ecpay: feed.data[2]?.[1],
        }
    } else {
        if (!youtubeChannelId) console.log(`canonical channel id not found, skip feed: ${handle}`)
        else console.log(`fetch feed error: ${feed.status}, ${feed.message}`)
        info = { name: decode(pageTitle || fallbackName || '') }
        ttl = CHANNEL_INFO_FAIL_TTL
    }
    setWithLimit(channelInfoCache, handle, { info, expiredAt: now + ttl })
    return info
}

module.exports = { isValidHandle, getChannelInfo }
