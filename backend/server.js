require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { rateLimit } = require('express-rate-limit')
const lastLive = require('./src/lastLive')
const recentLive = require('./src/recentLive')

const PORT = process.env.PORT || 8080

// 允許呼叫這個後端的前端網址（用逗號分隔多個），例如 https://my-oshi.pages.dev
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)

const app = express()

// 部署在 Render 這類平台時，請求會先經過一層代理；信任它才能拿到訪客真正的 IP（給流量限制用）
app.set('trust proxy', 1)
app.use(express.json())

// 健康檢查：用瀏覽器打開後端網址，看到 {"status":"ok"} 就代表服務有在運作
app.get('/', (req, res) => res.json({ status: 'ok' }))

// 只有 ALLOWED_ORIGINS 裡的網站可以從瀏覽器呼叫 /api
app.use('/api', cors({ origin: ALLOWED_ORIGINS }))

// 流量限制：每個 IP 每 8 小時最多 250 次查詢
app.use('/api', rateLimit({
    windowMs: 8 * 60 * 60 * 1000,
    limit: 250,
    message: { error: 'Too many requests, please try again later.' },
}))

app.post('/api/channel-last-live', lastLive)
app.post('/api/channel-diligence', recentLive)

// 其他沒處理到的錯誤（例如請求內容不是合法的 JSON）
app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed') {
        res.status(400).json({ data: null, message: 'Invalid request body' })
        return
    }
    console.error(err?.stack || err)
    res.status(500).json({ data: null, message: 'Something went wrong' })
})

app.listen(PORT, '0.0.0.0', () => {
    console.log(`=== SERVICE LISTENING ON PORT: ${PORT} ===`)
    if (!process.env.YOUTUBE_API_KEY) {
        console.warn('尚未設定 YOUTUBE_API_KEY：「多久沒開台」功能會無法查詢。')
    }
    if (ALLOWED_ORIGINS.length === 0) {
        console.warn('尚未設定 ALLOWED_ORIGINS：瀏覽器上的前端網站會被 CORS 擋下。')
    } else {
        console.log(`允許的前端網址：${ALLOWED_ORIGINS.join(', ')}`)
    }
})
