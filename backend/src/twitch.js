// Twitch 查詢（選用功能）：使用 Twitch 官方 API（Helix）。
// 需要在環境變數設定 TWITCH_CLIENT_ID 與 TWITCH_CLIENT_SECRET 才會啟用。

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

// Twitch 的帳號名稱：小寫英文、數字、底線
const LOGIN_PATTERN = /^[a-z0-9_]{3,25}$/
const isValidLogin = (login) => typeof login === 'string' && LOGIN_PATTERN.test(login)

const isConfigured = () => Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET)

// ---- 存取權杖（token）：用 Client ID 與 Secret 向 Twitch 換取，快過期時自動重新取得 ----
let token = null
let tokenExpireAt = 0
let refreshing = null

const requestToken = async () => {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: process.env.TWITCH_CLIENT_ID,
            client_secret: process.env.TWITCH_CLIENT_SECRET,
        }),
    })
    const body = await res.json()
    if (!res.ok || !body.access_token) {
        throw new Error(`Twitch token ${res.status}: ${body?.message || 'no access_token'}`)
    }
    token = body.access_token
    tokenExpireAt = Date.now() + body.expires_in * 1000
}

const getToken = async () => {
    // 提早 1 分鐘更新；同時有多個請求時只換一次
    if (!token || Date.now() > tokenExpireAt - 60 * 1000) {
        if (!refreshing) refreshing = requestToken().finally(() => { refreshing = null })
        await refreshing
    }
    return token
}

// 呼叫 Twitch API，回傳結果中的 data 陣列
const helix = async (path, params) => {
    const res = await fetch(`https://api.twitch.tv/helix/${path}?${new URLSearchParams(params)}`, {
        signal: AbortSignal.timeout(10000),
        headers: {
            Authorization: `Bearer ${await getToken()}`,
            'Client-Id': process.env.TWITCH_CLIENT_ID,
        },
    })
    if (res.status === 401) token = null // 權杖失效，下次重新取得
    if (!res.ok) throw new Error(`Twitch API /${path} ${res.status}`)
    return (await res.json()).data || []
}

// ---- 時間換算 ----
// Twitch 的影片長度格式是 "3h8m33s"、"3m21s" 這種，換算成秒數
const parseDurationToSeconds = (duration) => {
    const [, h = 0, m = 0, s = 0] = String(duration).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/) || []
    return Number(h) * 3600 + Number(m) * 60 + Number(s)
}
// 把秒數轉成和 YouTube 一樣的 "1:23:45" 格式，讓前端可以用同一套程式處理
const formatLength = (totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600)
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
    const s = String(totalSeconds % 60).padStart(2, '0')
    return `${h}:${m}:${s}`
}

/**
 * 兩支 Twitch API 共用的前置檢查：確認功能已啟用、帳號格式正確、頻道存在。
 * 通過時回傳頻道資料；不通過時已經送出回應，回傳 null。
 */
const findChannel = async (req, res) => {
    if (!isConfigured()) {
        res.status(503).json({ data: null, message: 'Twitch is not configured.' })
        return null
    }
    const login = req.body?.channelId
    if (!isValidLogin(login)) {
        res.status(400).json({ data: null, message: 'Invalid ChannelId' })
        return null
    }
    console.log('Checking for twitch id: ', login)
    const [user] = await helix('users', { login })
    if (!user) {
        res.status(400).json({ data: null, message: 'Channel not found.' })
        return null
    }
    return user
}

// 把沒預期到的錯誤統一回應成 500
const withErrorHandling = (handler) => async (req, res) => {
    try {
        await handler(req, res)
    } catch (error) {
        console.error(`twitch error: ${error?.message || error}`)
        if (!res.headersSent) res.status(500).json({ data: null, message: 'Twitch checking error.' })
    }
}

/**
 * POST /api/twitch-last-live
 * body: { channelId: "twitch 帳號" }
 *
 * 回應（欄位與 YouTube 版相同）：
 *   200 { name, lastLiveId, lastLiveTime, message }   找到上一場直播的存檔
 *   422 { count, thumbnail, message: 'live' }         頻道正在直播
 *   403 頻道沒有任何直播存檔
 *   400 帳號格式錯誤或找不到頻道
 *   503 這個後端沒有設定 Twitch
 */
const twitchLastLive = withErrorHandling(async (req, res) => {
    const user = await findChannel(req, res)
    if (!user) return

    // 正在直播的話直接回報
    const [stream] = await helix('streams', { user_id: user.id })
    if (stream) {
        res.status(422).json({
            count: stream.viewer_count,
            thumbnail: stream.thumbnail_url?.replace('{width}x{height}', '640x360'),
            message: 'live',
        })
        return
    }

    // 最新的一支直播存檔
    const [video] = await helix('videos', { user_id: user.id, type: 'archive', first: '1' })
    if (!video) {
        res.status(403).json({ data: null, message: 'Channel does not have any stream.' })
        return
    }
    // 結束時間 = 開始時間 + 影片長度
    const endTime = new Date(new Date(video.created_at).getTime() + parseDurationToSeconds(video.duration) * 1000)
    res.status(200).json({
        name: video.user_name || user.display_name,
        lastLiveId: video.id,
        lastLiveTime: endTime.toISOString(),
        message: 'success',
    })
})

/**
 * POST /api/twitch-diligence
 * body: { channelId: "twitch 帳號" }
 *
 * 回應（欄位與 YouTube 版相同）：
 *   200 { data: { name, list: [{ id, length }] } }   list 為最近 30 天的直播存檔（可能是空陣列）
 *   400 帳號格式錯誤或找不到頻道
 *   503 這個後端沒有設定 Twitch
 */
const twitchRecentLive = withErrorHandling(async (req, res) => {
    const user = await findChannel(req, res)
    if (!user) return

    const videos = await helix('videos', { user_id: user.id, type: 'archive', period: 'month', first: '100' })
    const now = Date.now()
    const list = videos
        .filter((video) => now - new Date(video.created_at).getTime() <= THIRTY_DAYS_MS)
        .map((video) => ({ id: video.id, length: formatLength(parseDurationToSeconds(video.duration)) }))
    res.status(200).json({ data: { name: user.display_name, list } })
})

module.exports = { twitchLastLive, twitchRecentLive, isConfigured }
