# liveinfo.oshi.tw

**你推多久沒開台了？／你推最近開了多久？**

輸入 YouTube 頻道的帳號代碼（例如 `@NASA`），查詢：

- **多久沒開台**：距離上一場直播結束過了多久，計時器會一直往上數；正在直播的話直接顯示直播與觀看人數。
- **最近開了多久**：最近 30 天內開始的直播總共播了多久、共幾場，以及最長的一場。

選用功能：設定 Twitch 憑證後，同一個網站也能查 Twitch 頻道。

整個服務是一個 Cloudflare Worker：網頁、API、快取、流量限制都在 Cloudflare 上，不需要其他主機。

## 網址

| 網址 | 畫面 |
| --- | --- |
| `/` | 首頁：你推多久沒開台了？ |
| `/recent/` | 首頁：你推最近開了多久？ |
| `/last/帳號` | 該帳號多久沒開台 |
| `/recent/帳號` | 該帳號最近開了多久 |

`帳號` 以 `@` 開頭時是 YouTube 的帳號代碼（`/last/@NASA`）；其餘視為 Twitch 帳號（`/last/nasa`，不分大小寫）。

## 架構

```
瀏覽器 ──► liveinfo.oshi.tw（Cloudflare Worker：liveinfo-oshi-tw）
              ├─ 靜態檔案 dist/（Vue 網頁），找不到的路徑回 index.html
              ├─ /last/*、/recent/*  ── Worker 直接回網頁本體
              └─ /api/*              ── Worker
                    ├─ DailyAllowance（Durable Object，每個訪客一個）每個 IP（IPv6 以 /64 計）每天 30 次查詢
                    └─ LookupCoordinator（Durable Object，每個查詢一個，例如 youtube:last:@nasa）
                          ├─ 保存答案到期為止，所有訪客共用
                          ├─ Workers KV（CACHE）：帳號 → 頻道、Twitch token
                          ├─ QuotaLedger（Durable Object，全站一個）每天 10,000 單位 YouTube 配額
                          ├─ YouTube Data API v3
                          └─ Twitch Helix API（選用）
```

`/last/*`、`/recent/*` 也交給 Worker，是因為靜態檔案的處理會把 `/last/@NASA` 轉址成 `/last/%40NASA`；由 Worker 直接回 `index.html`，網址列就能維持 `@`。

### 同一個頻道只查一次

同一個查詢（例如「@nasa 多久沒開台」）不論來自哪個 IP、哪個 Cloudflare 機房，都交給同一個 LookupCoordinator：

- 還有沒過期的答案：直接回傳，不呼叫 API。
- 沒有答案、而且已經有人在查：等那一次查詢的結果，不另外呼叫 API。所以同時有很多人打開同一個頻道，也只花一次配額。
- 答案過期後不會刪除，只會被新的答案取代，所以冷卻時一定有最後一次的答案可以顯示（每個查過的頻道留一筆小資料）。

### 每天的查詢次數

每個 IP（IPv6 以 /64 計）每天最多查 30 次（`wrangler.jsonc` 的 `DAILY_LOOKUP_LIMIT`），台灣時間午夜重新計算。計數放在每個訪客一個的 DailyAllowance（Durable Object），所以不論請求進到哪個機房都算得準。直接拿到現成答案的查詢也算一次；格式錯誤、或網站沒設定好而無法查的請求不算。

### 全站每日配額與冷卻

每次呼叫 YouTube API（1 單位配額）之前，都先向全站唯一的 QuotaLedger（Durable Object）記帳。一天最多花 10,000 單位（`wrangler.jsonc` 的 `YOUTUBE_DAILY_UNITS`），和 YouTube 一樣在太平洋時間午夜（台灣下午 3 或 4 點）重新計算。用完之後進入冷卻：

- 答案還沒過期的頻道照常顯示。
- 答案已經過期的頻道，改顯示最後一次的舊答案：標題後面加 `*`，下方註明「YouTube 查詢冷卻中，這是先前查到的結果，台灣時間 16:00 後更新」。API 照常回 200，多一個 `coolingDownUntil`（恢復時間）。
- 完全沒有舊答案的查詢回 503 `cooling_down`，網頁顯示「冷卻中」和台灣時間幾點恢復。
- 冷卻期間不會再呼叫 YouTube。
- Twitch 查詢不受影響。
- 如果 YouTube 自己先回報配額用完（例如同一個 Google Cloud 專案還有別的服務在用），也會立刻進入冷卻到重置為止。共用專案時，把 `YOUTUBE_DAILY_UNITS` 調低到這個網站分得到的量。

### YouTube 資料怎麼來

只用官方的 YouTube Data API，不讀 YouTube 網頁（從 Cloudflare 的共用 IP 讀網頁常被擋，而且網頁改版就會壞）：

1. `channels.list?forHandle=@帳號`：帳號代碼 → 頻道 ID（1 單位，快取 7 天）
2. `playlistItems.list`：頻道「直播」分頁的播放清單 `UULV…`，每頁 50 支（1 單位／頁）。頻道沒有這個清單（多半是從沒開過台）時，改看最新 50 支上傳影片 `UU…`
3. `videos.list`：直播的實際開始／結束時間、觀看人數（1 單位／50 支）

一次沒有快取的查詢通常花 2–3 單位。每個 Google Cloud 專案每天有 10,000 單位，在太平洋時間午夜（台灣下午 3 或 4 點）重置。

| 資料 | 存在 | 保留時間 |
| --- | --- | --- |
| 多久沒開台 | LookupCoordinator | 5 分鐘（直播中：1 分鐘；從沒開過台：1 小時） |
| 最近開了多久 | LookupCoordinator | 1 小時 |
| 過期的答案 | LookupCoordinator | 不刪除，冷卻時顯示 |
| 帳號 → 頻道 | KV | 7 天（查無此帳號：1 小時） |
| Twitch app token | KV | 到期前 1 小時 |

## 部署

需要：Node.js（22.13 以上的 22.x、24.x，或 26 以上）、Cloudflare 帳號，以及放在同一個帳號裡的 `oshi.tw` zone。

### 1. YouTube Data API 金鑰

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 建立專案。建議和 timeline.oshi.tw 分開，因為每日配額是以專案計算。
2. 啟用 **YouTube Data API v3**，建立 **API 金鑰**。
3. 金鑰限制：API 限制只勾 YouTube Data API v3；應用程式限制可選 **HTTP 參照網址**並填 `https://liveinfo.oshi.tw/*`。Worker 呼叫 API 時會帶上 `wrangler.jsonc` 裡 `YOUTUBE_API_REFERER` 的值當 Referer。

### 2. 第一次部署

```bash
npm install
npx wrangler login
cp .dev.vars.example .dev.vars   # 填入 YOUTUBE_API_KEY（要開 Twitch 就一併填 Twitch 的兩個值）
npm run deploy -- --secrets-file .dev.vars
```

- `wrangler.jsonc` 把 `YOUTUBE_API_KEY` 列為必要的 secret，所以第一次部署要用 `--secrets-file` 一起上傳；少了它 wrangler 會拒絕部署。若 shell 環境變數裡有同名變數，會蓋過檔案裡的值。
- KV namespace 沒有寫死 ID：第一次 `wrangler deploy` 會自動建立，之後的部署沿用同一個。
- Durable Object 的類別由 `wrangler.jsonc` 的 `migrations` 在部署時建立，不需要另外設定。
- `routes` 用 custom domain 綁 `liveinfo.oshi.tw`，部署時會自動建立 DNS 紀錄與憑證；如果已經有同名的 DNS 紀錄要先刪掉。

### 3. 之後

```bash
npm run deploy                                  # 建置網頁並部署
npx wrangler secret put YOUTUBE_API_KEY         # 換金鑰
npx wrangler secret put TWITCH_CLIENT_ID        # 開啟 Twitch（兩個都要設）
npx wrangler secret put TWITCH_CLIENT_SECRET
npx wrangler tail                               # 看即時 log
```

`wrangler secret put` 會立刻產生新版本並上線。Twitch 憑證到 [Twitch Developer Console](https://dev.twitch.tv/console/apps) 註冊應用程式取得（OAuth Redirect URL 填 `http://localhost` 即可，這裡只用 client credentials）。

## 本機開發

```bash
cp .dev.vars.example .dev.vars   # 填入金鑰
npm run dev:worker               # 終端機 1：Worker（API）在 http://localhost:8787
npm run dev                      # 終端機 2：網頁在 http://localhost:5173，/api 轉給 8787
```

`npm run preview` 會先建置網頁，再用 `wrangler dev` 在 8787 跑完整的網站，最接近正式環境。

| 指令 | 做什麼 |
| --- | --- |
| `npm test` | Worker 測試（在 workerd 裡跑，使用本機 KV 與 rate limiter）＋網頁測試（jsdom） |
| `npm run typecheck` | `vue-tsc --build` 檢查網頁、Worker、設定檔三個 TypeScript 專案 |
| `npm run lint` | ESLint |
| `npm run cf-typegen` | 改了 `wrangler.jsonc` 後重新產生 `worker-configuration.d.ts` |

測試不會連到 YouTube 或 Twitch：Worker 與 Durable Object 的對外請求都經過 `src/worker/runtime.ts`，測試把它換成模擬的 API（`test/worker/fake-*.ts`）。Durable Object 在測試的同一個 isolate 裡執行，所以換得到。

### 專案結構

```
src/
├── shared/      Worker 與網頁共用：帳號格式、API 回應型別
├── worker/      Cloudflare Worker
│   ├── index.ts        路由、檢查請求、交給 LookupCoordinator
│   ├── coordinator.ts  LookupCoordinator：保存答案、讓同一個查詢只跑一次
│   ├── lookup.ts       實際查詢 YouTube／Twitch、答案保留多久、錯誤對應
│   ├── allowance.ts    DailyAllowance：每個訪客每天的查詢次數
│   ├── quota.ts        QuotaLedger：全站每天花掉的 YouTube 配額
│   ├── requester.ts    訪客位址（IPv6 /64）、擋其他網站的請求
│   ├── runtime.ts      對外請求與時間（測試時替換）
│   ├── cache.ts        KV 快取
│   ├── youtube/        Data API 呼叫與「多久沒開台／最近開了多久」的計算
│   └── twitch.ts       Helix API（選用）
└── client/      Vue 網頁（views/ 三個畫面、style.css 外觀）
test/
├── worker/      Worker 測試
└── client/      網頁測試
```

## API

全部是 `GET`，回傳 JSON，`Cache-Control: no-store`（結果另外存在 KV）。

| 路徑 | 回應 |
| --- | --- |
| `/api/config` | `{ twitch }`：是否開放 Twitch 查詢 |
| `/api/last/:account` | `status` 為 `ended`（含 `stream.endedAt`）、`live`（含 `stream.viewers`、`stream.thumbnail`）或 `none`，另有 `platform`、`channel`、`donations` |
| `/api/recent/:account` | `days`、`totalSeconds`、`count`、`longest`、`platform`、`channel`、`donations` |

型別定義在 `src/shared/api.ts`。冷卻中拿出來的舊答案會多一個 `coolingDownUntil`（YouTube 配額恢復的時間，ISO 8601）。錯誤一律是 `{ "error": "代碼" }`：

| 狀態碼 | 代碼 | 意思 |
| --- | --- | --- |
| 400 | `invalid_account` | 帳號格式不對 |
| 403 | `forbidden` | 瀏覽器標示這個查詢來自其他網站（`Sec-Fetch-Site`），避免別的網頁替訪客消耗配額 |
| 404 | `not_found` | 找不到頻道，或 API 路徑不存在 |
| 405 | `method_not_allowed` | 不是 `GET` |
| 429 | `daily_limit` | 同一個 IP 今天已經查滿次數（台灣時間午夜重新計算） |
| 502 | `upstream_error` | YouTube／Twitch 回應錯誤或連不上 |
| 503 | `cooling_down` | 今天的 YouTube 配額用完，冷卻中；回應帶 `resumesAt`（恢復時間）與 `Retry-After` |
| 503 | `twitch_disabled` | 沒有設定 Twitch 憑證 |
| 503 | `not_configured` | 沒有設定 YouTube 金鑰 |

## 已知限制

- 有人刻意用很多個 IP 查詢不同頻道，仍可能在一天內用完全站的 10,000 單位；之後到重置前只能顯示舊答案，從沒被查過的頻道會顯示「冷卻中」。
- 「最近開了多久」只算最近 30 天內**開始**、而且已經結束的 YouTube 直播，最多看直播清單上最新的 200 支（含待機室）；正在直播的那場不算。
- Twitch 的資料來自直播存檔：沒開存檔或存檔過期的直播查不到。「最近開了多久」最多算 100 支存檔，而且會把進行中直播的存檔算進去。
- 會員限定直播不在「直播」播放清單裡，不會被計入。頻道沒有「直播」播放清單時只看最新 50 支上傳影片，這時首播也可能被當成直播。
- 「贊助主播」連結是從近期直播的說明欄找綠界（ECPay）與 DeerDonate 的網址；Twitch 頻道沒有這個功能。
- 使用 YouTube Data API 須遵守 [YouTube API 服務條款](https://developers.google.com/youtube/terms/api-services-terms-of-service)；網站頁尾已附上 YouTube 服務條款與 Google 隱私權政策的連結。啟用 Twitch 則須遵守 [Twitch 開發人員服務協議](https://legal.twitch.com/legal/developer-agreement/)。

## 授權

[MIT](LICENSE)。改寫自 starknows 開源的「你推系列」：[starknows/oshi-series](https://github.com/starknows/oshi-series)（MIT），網站頁尾也附上原作連結。
