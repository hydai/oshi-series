// 抓取 YouTube 網頁時使用的瀏覽器識別字串。
// 請固定使用桌面版 Chrome：實測某些瀏覽器字串（例如舊版 Firefox、iPad）會讓 YouTube 回傳無法解析的內容。
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/**
 * 抓取一個網頁，並用正規表示式（regex）從內容中取出需要的片段。
 *
 * 回傳的 status 是真實的 HTTP 狀態碼；
 * 網路層失敗（逾時、DNS、連線中斷）時回傳 0。
 *
 * @param {string} url 要抓取的網址
 * @param {RegExp[]} regexList 要套用的 regex，結果會依序放進 data 陣列
 * @param {Record<string, string>} [extraHeaders] 額外的 HTTP 標頭
 * @returns {Promise<{ status: number, data?: Array<RegExpMatchArray|null>, message?: string }>}
 */
const fetchPage = async (url, regexList, extraHeaders = {}) => {
    try {
        const res = await fetch(url, {
            signal: AbortSignal.timeout(10000),
            headers: Object.assign({ 'User-Agent': USER_AGENT }, extraHeaders),
        })
        if (res.status === 429) {
            console.log(`429 - Retry-After: ${res.headers.get('retry-after')}, url: ${url}`)
            return { status: 429, message: 'blocked' }
        }
        if (res.status !== 200) {
            return { status: res.status, message: res.statusText || `HTTP ${res.status}` }
        }
        const text = await res.text()
        return { status: 200, data: regexList.map((regex) => text.match(regex)) }
    } catch (err) {
        return { status: 0, message: `Fetch fail: ${err?.name || 'Error'}: ${err?.message || String(err)}` }
    }
}

module.exports = fetchPage
module.exports.USER_AGENT = USER_AGENT
