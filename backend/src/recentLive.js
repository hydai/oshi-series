const fetchPage = require('./fetchPage')
const { setWithLimit } = require('./cache')
const { isValidHandle, getChannelInfo } = require('./channelInfo')

// 查詢結果快取 4 小時
const RECENT_LIVE_TTL = 4 * 60 * 60 * 1000
const recentLiveCache = new Map()

// 同一時間最多處理 2 個「尚未快取」的查詢，避免短時間內對 YouTube 發出太多請求
const MAX_CONCURRENT = 2
let inProgress = 0

/**
 * 從一個影片區塊的文字裡，取出「已結束直播」的影片 ID 與長度。
 * 回傳 'stop' 代表這支影片已經是一個月以前的，後面不用再看了。
 */
const parseStreamItem = (text) => {
    const length = text.match(/"text":"([^"]+)","badgeStyle":/)?.[1]
    // 長度不是 1:23:45 這種格式的（直播中、待機室）略過
    if (!length || !/^[\d:]+$/.test(length)) return null
    if (text.includes('個月前') || text.includes('年前')) return 'stop'
    const id = text.match(/"contentId":"([^"]+)"/)?.[1]
    return id ? { id, length } : null
}

// 頻道「直播」分頁第一頁只有約 30 支影片，需要時再多抓下一頁
const fetchNextPage = async (continuationToken) => {
    const res = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
            'User-Agent': fetchPage.USER_AGENT,
            'Content-Type': 'application/json',
            'Accept-Language': 'zh-TW',
        },
        body: JSON.stringify({
            continuation: continuationToken,
            context: {
                client: { clientName: 'WEB', clientVersion: '2.20231219.04.00', gl: 'TW', hl: 'zh-TW' },
            },
        }),
    })
    const body = await res.text()
    if (res.status !== 200) throw new Error(`HTTP ${res.status}, body: ${body.slice(0, 300)}`)
    const data = JSON.parse(body)
    const items = data?.onResponseReceivedActions?.[0]?.appendContinuationItemsAction?.continuationItems || []
    return items.map((item) => JSON.stringify(item))
}

const queryRecentLive = async (handle, res) => {
    // 1. 抓頻道的「直播」分頁，取出影片區塊、頻道 ID、下一頁代碼、頻道名稱
    const page = await fetchPage(`https://www.youtube.com/${handle}/streams`, [
        /"richItemRenderer":{"content":{"lockupViewModel":(.*?)","contentType":/gm,
        /<link rel="canonical" href="https:\/\/www.youtube.com\/channel\/(.*?)">/,
        /"continuationCommand":{"token":"(.*?)","request":"CONTINUATION_REQUEST_TYPE_BROWSE"/s,
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
    const [items, canonicalMatch, continuationMatch, titleMatch] = page.data
    if (!Array.isArray(items)) {
        res.status(403).json({ data: null, message: 'Channel does not have any stream.' })
        return
    }

    // 2. 由新到舊收集一個月內已結束的直播，遇到「X 個月前」就停止
    const streams = []
    let reachedOlderThanMonth = false
    for (const item of items) {
        const parsed = parseStreamItem(item)
        if (parsed === 'stop') {
            reachedOlderThanMonth = true
            break
        }
        if (parsed) streams.push(parsed)
    }

    // 3. 第一頁全部都在一個月內，而且還有下一頁，就再抓一頁
    const continuationToken = continuationMatch?.[1]
    if (continuationToken && items.length >= 30 && !reachedOlderThanMonth) {
        console.log(`fetching next page... ${handle}`)
        try {
            for (const item of await fetchNextPage(continuationToken)) {
                const parsed = parseStreamItem(item)
                if (parsed === 'stop') break
                if (parsed) streams.push(parsed)
            }
        } catch (error) {
            // 下一頁失敗時仍回傳第一頁的結果
            console.error(`next page error: ${handle}, ${error?.name || 'Error'}: ${error?.message || error}`)
        }
    }

    // 4. 補上頻道名稱與贊助連結後回傳，並存進快取
    const channelInfo = await getChannelInfo(handle, canonicalMatch?.[1], titleMatch?.[1])
    const data = Object.assign({}, channelInfo, { list: streams })
    setWithLimit(recentLiveCache, handle, { data, expiredAt: Date.now() + RECENT_LIVE_TTL })
    res.status(200).json({ data })
}

/**
 * POST /api/channel-diligence
 * body: { channelId: "@帳號代碼" }
 *
 * 回應：
 *   200 { data: { name, deer?, ecpay?, list: [{ id, length }] } }  list 為一個月內的直播（可能是空陣列）
 *   403 頻道沒有任何直播紀錄
 *   400 帳號代碼格式錯誤或找不到頻道
 *   429 伺服器忙碌中
 *   500 查詢過程發生錯誤
 */
const recentLive = async (req, res) => {
    const handle = req.body?.channelId
    if (!isValidHandle(handle)) {
        res.status(400).json({ data: null, message: 'Invalid ChannelId' })
        return
    }
    console.log('Checking for id: ', handle)

    const cached = recentLiveCache.get(handle)
    if (cached && cached.expiredAt > Date.now()) {
        console.log(`from cached -> ${handle}, cached data: ${recentLiveCache.size}`)
        res.status(200).json({ message: 'cached', data: cached.data })
        return
    }
    if (inProgress >= MAX_CONCURRENT) {
        res.status(429).json({ data: null, message: 'Server busy, please try again later.' })
        return
    }
    inProgress++
    try {
        await queryRecentLive(handle, res)
    } catch (error) {
        console.error(`channel-diligence unexpected error: ${handle}, ${error?.stack || error}`)
        if (!res.headersSent) res.status(500).json({ data: null, message: 'Channel checking error.' })
    } finally {
        inProgress--
    }
}

module.exports = recentLive
