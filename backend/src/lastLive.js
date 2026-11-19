const fetchPage = require('./fetchPage')
const { setWithLimit } = require('./cache')
const { isValidHandle, getChannelInfo } = require('./channelInfo')

// 以「頻道 @帳號代碼」為 key，記住上一次查到的結果。
// 只要頻道最新一場直播的影片 ID 沒變，就直接回傳快取，不再呼叫 YouTube Data API。
const lastLiveCache = new Map()

// 從直播中的影片區塊取出「N 人正在觀看」的人數
const parseViewerCount = (text) => {
    const match = text.match(/"metadataParts":\[{"text":{"content":\s*"([\d,]+)\s*人正在觀看"/)
    if (!match) return null
    return Number(match[1].replace(/,/g, ''))
}

// 用 YouTube Data API v3 查詢一支影片的直播資訊（每次呼叫消耗 1 單位配額）
const fetchVideoDetail = async (videoId) => {
    const params = new URLSearchParams({
        part: 'snippet,liveStreamingDetails',
        id: videoId,
        key: process.env.YOUTUBE_API_KEY || '',
    })
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, {
        signal: AbortSignal.timeout(10000),
    })
    const body = await res.json()
    if (!res.ok) {
        const reason = body?.error?.errors?.[0]?.reason || 'unknown'
        throw new Error(`YouTube Data API ${res.status} (${reason}): ${body?.error?.message || ''}`)
    }
    return body?.items?.[0] || null
}

/**
 * POST /api/channel-last-live
 * body: { channelId: "@帳號代碼" }
 *
 * 回應：
 *   200 { name, lastLiveId, lastLiveTime, deer?, ecpay?, message }  找到上一場直播
 *   422 { count, lastLiveId, message: 'live' }                      頻道正在直播
 *   403 頻道沒有任何直播紀錄
 *   400 帳號代碼格式錯誤或找不到頻道
 *   500 查詢過程發生錯誤
 */
const lastLive = async (req, res) => {
    const handle = req.body?.channelId
    if (!isValidHandle(handle)) {
        res.status(400).json({ data: null, message: 'Invalid ChannelId' })
        return
    }
    console.log('Checking for id: ', handle)

    // 1. 抓頻道的「直播」分頁，取出影片區塊、頻道 ID、頻道名稱
    const page = await fetchPage(`https://www.youtube.com/${handle}/streams`, [
        /"richItemRenderer":{"content":{"lockupViewModel":(.*?)","contentType":/gm,
        /<link rel="canonical" href="https:\/\/www.youtube.com\/channel\/(.*?)">/,
        /<meta property="og:title" content="(.*?)">/,
    ], { 'Accept-Language': 'zh-TW' })
    if (page.status === 404) {
        res.status(400).json({ data: null, message: 'Channel not found.' })
        return
    }
    if (page.status !== 200 || !Array.isArray(page.data)) {
        console.error(`channel page fetch failed: ${handle}, status: ${page.status}, ${page.message || ''}`)
        res.status(500).json({ data: null, message: 'Channel checking error.' })
        return
    }
    const [items, canonicalMatch, titleMatch] = page.data

    // 2. 由新到舊找出第一支「直播中」或「已結束直播」的影片（待機室會略過）
    let lastLiveId = null
    let channelStatus = null
    let viewerCount = null
    for (const item of items || []) {
        if (item.includes('人正在觀看')) {
            channelStatus = 'live'
            lastLiveId = item.match(/"contentId":"([^"]+)"/)?.[1]
            viewerCount = parseViewerCount(item)
            break
        } else if (item.includes('直播時間')) {
            channelStatus = 'archived'
            lastLiveId = item.match(/"contentId":"([^"]+)"/)?.[1]
            break
        }
    }
    if (channelStatus === 'live') {
        res.status(422).json({ count: viewerCount, lastLiveId, message: 'live' })
        return
    }
    if (!channelStatus || !lastLiveId) {
        res.status(403).json({ data: null, message: 'Channel does not have any stream.' })
        return
    }

    // 3. 最新一場直播沒變的話，直接用快取
    const cached = lastLiveCache.get(handle)
    if (cached && cached.lastLiveId === lastLiveId) {
        console.log(`from cached -> ${handle}, cached data: ${lastLiveCache.size}`)
        res.status(200).json(Object.assign({}, cached, { message: 'cached' }))
        return
    }

    // 4. 用 YouTube Data API 查這場直播實際結束的時間
    let video = null
    try {
        video = await fetchVideoDetail(lastLiveId)
    } catch (error) {
        console.error('YouTube API fetch error:', error?.message || error)
        res.status(500).json({ data: null, message: 'YouTube API error.' })
        return
    }
    const lastLiveTime = video?.liveStreamingDetails?.actualEndTime
    if (!lastLiveTime) {
        console.error(`stream end time not found: ${handle}, video: ${lastLiveId}`)
        res.status(500).json({ data: null, message: 'Stream end time not available.' })
        return
    }

    // 5. 補上頻道名稱與贊助連結後回傳
    const channelInfo = await getChannelInfo(handle, canonicalMatch?.[1], titleMatch?.[1], video?.snippet?.channelTitle)
    const responseData = Object.assign({}, channelInfo, { lastLiveId, lastLiveTime, message: 'success' })
    setWithLimit(lastLiveCache, handle, responseData)
    res.status(200).json(responseData)
}

module.exports = lastLive
