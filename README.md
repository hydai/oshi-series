# 你推系列（oshi-series）

輸入一個 YouTube 頻道的帳號代碼（例如 `@NASA`），就能查到：

1. **你推多久沒開台了？** 距離這個頻道上一次直播結束，已經過了幾天幾時幾分幾秒（會一直往上數的計時器）。
2. **你推最近開了多久？** 這個頻道最近 30 天內總共直播了多久，以及最長的一場是哪一場。

這份文件會帶你從零開始，把這個服務架在你自己的帳號底下。**全程使用免費方案，不需要會寫程式**，照著步驟複製貼上就可以完成。

---

## 目錄

- [先認識幾個名詞](#先認識幾個名詞)
- [這個服務是怎麼運作的](#這個服務是怎麼運作的)
- [開始之前要準備的東西](#開始之前要準備的東西)
- [第 1 步：申請 YouTube Data API 金鑰](#第-1-步申請-youtube-data-api-金鑰)
- [第 2 步：在自己的電腦上跑起來](#第-2-步在自己的電腦上跑起來)
- [第 3 步：把程式放到你的 GitHub](#第-3-步把程式放到你的-github)
- [第 4 步：把後端部署到 Render](#第-4-步把後端部署到-render)
- [第 5 步：把前端部署到 Cloudflare Pages](#第-5-步把前端部署到-cloudflare-pages)
- [第 6 步：讓前端和後端互相認得（CORS）](#第-6-步讓前端和後端互相認得cors)
- [第 7 步：確認兩個功能都正常](#第-7-步確認兩個功能都正常)
- [遇到問題怎麼辦](#遇到問題怎麼辦)
- [配額與免費方案的限制](#配額與免費方案的限制)
- [已知限制與注意事項](#已知限制與注意事項)
- [想改外觀或文字](#想改外觀或文字)
- [給開發者的技術說明](#給開發者的技術說明)
- [授權](#授權)

---

## 先認識幾個名詞

| 名詞 | 白話解釋 |
|------|----------|
| **前端** | 訪客在瀏覽器裡看到的網頁（輸入框、計時器那些畫面）。 |
| **後端** | 一支在雲端主機上跑的程式，負責去 YouTube 查資料，再把結果交給前端。 |
| **部署** | 把程式放到雲端主機上，讓它 24 小時都能被連到。 |
| **API 金鑰** | Google 發給你的一串密碼，程式要帶著它才能向 YouTube 查資料。**不可以給別人看。** |
| **環境變數** | 程式的「設定值」（例如金鑰、網址）。不寫在程式碼裡，而是另外填在雲端主機的設定頁面。 |
| **終端機** | 用打字下指令的視窗。macOS 叫「終端機」，Windows 叫「PowerShell」。 |

## 這個服務是怎麼運作的

```
   訪客的瀏覽器
        │  ① 打開網頁
        ▼
┌──────────────────────┐
│  前端（frontend/）     │   放在 Cloudflare Pages
│  顯示畫面與計時器       │   網址像 https://你的專案.pages.dev
└──────────┬───────────┘
           │  ② 問後端：「@某頻道 多久沒開台？」
           ▼
┌──────────────────────┐
│  後端（backend/）      │   放在 Render
│  查資料、整理結果       │   網址像 https://你的服務.onrender.com
└──────────┬───────────┘
           │  ③ 讀取頻道的「直播」分頁，找出直播清單
           │  ④ 用 YouTube Data API 查上一場直播的結束時間（需要金鑰）
           ▼
        YouTube
```

你需要架兩個東西：**前端**（網頁）和**後端**（查資料的程式）。金鑰只放在後端，訪客看不到。

### 資料夾結構

```
oshi-series/
├── README.md              ← 你正在看的教學
├── LICENSE                ← 授權條款（MIT）
├── backend/               ← 後端
│   ├── .env.example       ← 後端設定值的範本
│   ├── server.js          ← 後端的進入點
│   └── src/
│       ├── lastLive.js    ← 功能 1：多久沒開台
│       ├── recentLive.js  ← 功能 2：最近 30 天直播總時數
│       ├── channelInfo.js ← 取得頻道名稱
│       ├── fetchPage.js   ← 抓取 YouTube 網頁
│       └── cache.js       ← 暫存查過的結果
└── frontend/              ← 前端
    ├── .env.example       ← 前端設定值的範本
    ├── index.html         ← 網頁標題、說明文字
    └── src/
        ├── api.js         ← 呼叫後端
        ├── router/        ← 網址對應到哪個畫面
        └── views/         ← 三個畫面：首頁、多久沒開台、最近開了多久
```

## 開始之前要準備的東西

| 要準備的 | 用途 | 費用 |
|----------|------|------|
| [Google 帳號](https://accounts.google.com/) | 申請 YouTube Data API 金鑰 | 免費 |
| [GitHub 帳號](https://github.com/) | 存放你的程式，Render 和 Cloudflare 會從這裡讀取 | 免費 |
| [Render 帳號](https://render.com/) | 放後端 | 免費方案 |
| [Cloudflare 帳號](https://dash.cloudflare.com/sign-up) | 放前端 | 免費方案 |
| [Node.js](https://nodejs.org/)（22 以上，下載 LTS 版） | 在自己電腦上試跑時需要 | 免費 |
| [Git](https://git-scm.com/downloads) | 下載與上傳程式 | 免費 |

> 如果你只想直接部署、不想在自己電腦上試跑，可以跳過 Node.js 和第 2 步。但建議還是先在電腦上跑一次，確認金鑰可以用。

---

## 第 1 步：申請 YouTube Data API 金鑰

「多久沒開台」功能需要用金鑰向 YouTube 查詢直播的結束時間。

1. 打開 [Google Cloud Console](https://console.cloud.google.com/)，用 Google 帳號登入。
2. **建立專案**：點 **Create project（建立專案）**，在 **New project（新增專案）** 視窗輸入名稱（隨意，例如 `oshi-series`）→ **Create（建立）**。建立後確認畫面上方顯示的是這個專案。
3. **啟用 API**：打開 [API Library（API 程式庫）](https://console.cloud.google.com/apis/library)，搜尋 `YouTube Data API v3`，點進去後按 **Enable（啟用）**。
4. **建立金鑰**：打開 [Credentials（憑證）](https://console.cloud.google.com/apis/credentials) → **Create credentials（建立憑證）** → **API key（API 金鑰）**。畫面會顯示一長串英文與數字，這就是你的金鑰，先複製起來。
5. **限制金鑰用途**（建議做，金鑰外流時損害比較小）：在 Credentials 頁面點剛建立的金鑰名稱 → 找到 **API restrictions（API 限制）** → 選 **Restrict key（限制金鑰）** → 只勾選 **YouTube Data API v3** → **Save（儲存）**。
   - **Application restrictions（應用程式限制）** 請不要設定（維持預設、不選任何類型）。它是用來限定「只有特定網站、IP 位址或 App 可以用這把金鑰」，但 Render 免費方案的主機沒有固定 IP，設了反而會查不到資料。

> **金鑰保管原則**
> - 金鑰只會填在兩個地方：你電腦上的 `backend/.env`，以及 Render 的環境變數設定頁。
> - 不要貼到 `frontend/` 裡的任何檔案、不要上傳到 GitHub、不要貼到聊天室。
> - 如果不小心外流，回到 Credentials 頁面把那把金鑰刪掉，重新建立一把即可。

---

## 第 2 步：在自己的電腦上跑起來

### 2-1 下載程式

打開終端機，輸入下面的指令：

```bash
git clone https://github.com/starknows/oshi-series.git
```

```bash
cd oshi-series
```

### 2-2 啟動後端

```bash
cd backend
```

```bash
npm install
```

```bash
cp .env.example .env
```

用文字編輯器（記事本、VS Code 都可以）打開 `backend/.env`，在 `YOUTUBE_API_KEY=` 後面貼上第 1 步拿到的金鑰，存檔。其他兩行先不用改。

```bash
npm start
```

看到 `=== SERVICE LISTENING ON PORT: 8080 ===` 就是啟動成功。用瀏覽器打開 <http://localhost:8080>，應該會看到：

```json
{"status":"ok"}
```

**這個終端機視窗不要關**，後端要一直開著。

### 2-3 啟動前端

**另外開一個新的終端機視窗**，回到 `oshi-series` 資料夾後輸入：

```bash
cd frontend
```

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run dev
```

看到 `Local: http://localhost:5173/` 後，用瀏覽器打開 <http://localhost:5173>。

> 如果顯示的不是 5173（例如 5174），代表 5173 已經被別的程式占用。請把 `backend/.env` 裡的 `ALLOWED_ORIGINS` 改成畫面上顯示的那個網址，然後在後端的終端機按 `Ctrl + C` 停止，再 `npm start` 重新啟動。

### 2-4 試試看

- 在首頁輸入 `@TED`，按 Enter → 應該看到「距離 TED 上次在 YouTube 開台已經過了 … 天 … 時 … 分 … 秒」，而且秒數會一直增加。
- 點首頁下方的「>> 改查『你推最近開了多久？』」，輸入 `@NASA` → 應該看到「最近 30 天內 NASA 在 YouTube 總共直播了 … 時 … 分 … 秒」。

兩個都有結果，就代表程式和金鑰都沒問題，可以開始部署到網路上了。要停止時，在兩個終端機視窗各按一次 `Ctrl + C`。

---

## 第 3 步：把程式放到你的 GitHub

Render 和 Cloudflare 都是從 GitHub 讀取程式，所以你的 GitHub 帳號底下要有一份。

- **最簡單的方法**：在這個專案的 GitHub 頁面按右上角的 **Fork**，就會複製一份到你的帳號。
- 之後如果你改了文字或外觀，把修改上傳（push）到你的 GitHub，Render 和 Cloudflare 會自動重新部署。

> 上傳前請確認沒有把 `.env` 一起傳上去。這個專案的 `.gitignore` 已經排除了 `.env`，正常情況下不會被上傳。

---

## 第 4 步：把後端部署到 Render

1. 登入 [Render Dashboard](https://dashboard.render.com/)，點 **New** → **Web Service**。
2. 選 **Git Provider**，依畫面指示連結你的 GitHub 帳號，然後選擇你的 `oshi-series`。
3. 填寫設定：

   | 欄位 | 要填的值 |
   |------|----------|
   | **Name** | 自己取，會成為網址的一部分（例如 `my-oshi-api`） |
   | **Region** | `Singapore`（離台灣最近） |
   | **Branch** | `main` |
   | **Language** | `Node` |
   | **Build Command** | `npm install` |
   | **Start Command** | `npm start` |
   | 方案（compute plan） | **Free** |

   > **重要：指定後端所在的資料夾。** 這個專案的後端放在 `backend` 資料夾裡，必須告訴 Render。如果表單上有 **Root Directory** 欄位，直接填 `backend`；如果沒有，先完成建立（第一次建置可能會失敗，沒關係），再到該服務的 **Settings** → **Build & Deploy** → **Root Directory** → **Edit**，填入 `backend` 後按 **Save Changes**，Render 會重新建置。

4. 展開 **Advanced**（或建立後到該服務左側的 **Environment** 頁面，按 **+ Add Environment Variable**），新增兩個環境變數：

   | Key | Value |
   |-----|-------|
   | `YOUTUBE_API_KEY` | 第 1 步拿到的金鑰 |
   | `ALLOWED_ORIGINS` | 先填 `http://localhost:5173`，第 6 步會回來改 |

   不需要設定 `PORT`，Render 會自動提供。

5. 按 **Create Web Service**，等幾分鐘讓它建置完成。
6. 完成後，頁面上方會顯示你的後端網址（`https://你取的名字.onrender.com`）。用瀏覽器打開它，看到 `{"status":"ok"}` 就成功了。**把這個網址記下來**，下一步會用到。

---

## 第 5 步：把前端部署到 Cloudflare Pages

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)，從左側選單進入 **Workers & Pages**。
2. 點 **Create application** → 切到 **Pages** 分頁 → **Import an existing Git repository**。
3. 依畫面指示連結 GitHub 帳號（**Install & Authorize**），選擇你的 `oshi-series`，按 **Begin setup**。
4. 在 **Set up builds and deployments** 填寫：

   | 欄位 | 要填的值 |
   |------|----------|
   | **Project name** | 自己取，會成為網址的一部分（例如 `my-oshi`） |
   | **Production branch** | `main` |
   | **Framework preset** | `Vue`（或 `None`） |
   | **Build command** | `npm run build` |
   | **Build output directory** | `dist` |
   | **Root directory (advanced)** → **Path** | `frontend` |

5. 在同一頁的 **Environment variables (optional)** 新增：

   | Variable name | Value |
   |---------------|-------|
   | `VITE_API_URL` | 第 4 步記下的後端網址，例如 `https://my-oshi-api.onrender.com`（結尾不要加 `/`） |

6. 按 **Save and Deploy**，等它建置完成。
7. 完成後會拿到前端網址（`https://你取的名字.pages.dev`）。**把這個網址記下來**。

> **之後想修改 `VITE_API_URL`**：到該專案的 **Settings** → **Environment variables**（介面上也可能叫 **Variables and Secrets**）修改後，必須**重新建置一次**才會生效，因為前端的設定值是在「建置當下」寫進網頁裡的。最確定的做法是推送（push）任何一個新的修改到 GitHub，Cloudflare 就會自動重新建置；如果 **Deployments** 頁面上那筆部署的選單裡有重新部署的選項，也可以直接用它。
>
> **如果建置失敗且訊息提到 Node.js 版本**：在同一個環境變數頁面新增 `NODE_VERSION`，值填 `22`，再重新建置。

---

## 第 6 步：讓前端和後端互相認得（CORS）

**為什麼要做這一步？** 瀏覽器有一個安全規則叫 CORS：網頁 A 想向網站 B 要資料時，B 必須明確表示「我允許 A」，否則瀏覽器會擋下來。所以要告訴後端「我的前端網址是這個，請放行」。這同時也避免別人的網站直接盜用你的後端。

1. 回到 [Render Dashboard](https://dashboard.render.com/)，點進你的後端服務 → 左側 **Environment**。
2. 把 `ALLOWED_ORIGINS` 的值改成第 5 步的前端網址，例如：

   ```
   https://my-oshi.pages.dev
   ```

   注意事項：
   - 開頭要有 `https://`，結尾**不要**有 `/`。
   - 要同時允許多個網址（例如之後綁了自己的網域），用逗號隔開：`https://my-oshi.pages.dev,https://oshi.example.com`

3. 按儲存按鈕旁的選單，選 **Save and deploy**，等後端重新啟動完成。

---

## 第 7 步：確認兩個功能都正常

依序檢查，每一項都通過就完成了：

- [ ] 打開後端網址（`https://….onrender.com`）→ 看到 `{"status":"ok"}`
- [ ] 打開前端網址（`https://….pages.dev`）→ 看到「你推多久沒開台了？」和輸入框
- [ ] 輸入 `@TED` 按 Enter → 出現天、時、分、秒的計時器，秒數持續增加
- [ ] 回首頁，點「>> 改查『你推最近開了多久？』」，輸入 `@NASA` → 出現直播總時數與「最長紀錄」
- [ ] 把結果頁的網址（例如 `https://….pages.dev/last/@TED`）直接貼到新分頁 → 一樣能看到結果

> 後端閒置一陣子後第一次查詢會比較慢（最多約一分鐘），畫面會顯示「伺服器可能正在喚醒」，這是免費方案的正常現象，請見[配額與免費方案的限制](#配額與免費方案的限制)。

---

## 遇到問題怎麼辦

先看後端的紀錄：Render Dashboard → 你的服務 → **Logs** 頁面。大部分問題的原因都會寫在那裡。

| 畫面上的狀況 | 可能原因與處理方式 |
|--------------|--------------------|
| 一直停在「分析中...」約一分鐘後才有結果 | 後端休眠後被喚醒，屬正常現象。 |
| 兩個功能都顯示「發生錯誤，請稍後再試」，而後端網址打得開 | 多半是 CORS 沒設好。檢查 Render 的 `ALLOWED_ORIGINS` 是否**完全等於**前端網址（`https://` 開頭、結尾沒有 `/`），以及 Cloudflare 的 `VITE_API_URL` 是否等於後端網址。改完記得重新部署（Render 可用 **Manual Deploy** → **Deploy latest commit**）。 |
| 「最近開了多久」正常，「多久沒開台」顯示錯誤 | 金鑰有問題。Logs 會出現 `YouTube Data API 400` 或 `403`：確認 `YOUTUBE_API_KEY` 有填對、專案已啟用 YouTube Data API v3、金鑰的 API 限制有勾 YouTube Data API v3。若訊息含 `quotaExceeded` 代表今天的配額用完了，隔天會恢復。 |
| Logs 出現 `channel page fetch failed … status: 429` | YouTube 暫時限制了這台主機的請求，請過一段時間再試。 |
| 顯示「帳號代碼或格式錯誤，無法找到頻道」 | 帳號代碼要包含開頭的 `@`，而且要是頻道網址裡 `youtube.com/` 後面那一段（例如 `@NASA`），不是頻道的顯示名稱。 |
| 顯示「查詢次數過多」或「目前查詢人數較多」 | 觸發了內建的流量限制（見下一節），稍等再試。 |
| 所有頻道都查不到直播紀錄 | YouTube 的網頁格式可能改版了，請見[已知限制與注意事項](#已知限制與注意事項)。 |

---

## 配額與免費方案的限制

### YouTube Data API 配額

- 每個 Google Cloud 專案預設**每天 10,000 單位**，在太平洋時間午夜重置（約為台灣時間下午 3 點或 4 點）。
- 這個專案只用到 `videos.list` 這一種查詢，**每次消耗 1 單位**。失敗的查詢（例如金鑰錯誤）一樣會扣。
- 實際消耗方式：

  | 功能 | 什麼時候會消耗配額 |
  |------|--------------------|
  | 多久沒開台 | 查到的「上一場直播」和後端記住的不一樣時，消耗 1 單位。同一個頻道在它下次開台之前重複查詢，都不會再消耗。 |
  | 最近開了多久 | 完全不消耗配額（資料來自頻道頁面）。 |

- 換句話說，最糟的情況下一天大約可以查 10,000 次「多久沒開台」，一般個人或小社群使用很難用完。
- 後端休眠或重新啟動後，記住的結果會清空，同一個頻道第一次被查詢時會再消耗 1 單位。
- 可以在 Google Cloud Console 的 [Quotas](https://console.cloud.google.com/iam-admin/quotas) 頁面看到目前的使用量。

### Render 免費方案

- **會休眠**：連續 15 分鐘沒有人連線，服務就會休眠；下次有人查詢時需要約一分鐘喚醒。
- 每個工作區每月有 750 小時的免費執行時數（休眠期間不計）；用完的話當月所有免費服務會暫停。
- 平台可能隨時重新啟動免費服務；沒有永久儲存空間（這個專案不需要）。
- 如果不想要休眠，需要把該服務升級為付費方案。

### Cloudflare Pages 免費方案

- 每月可建置 500 次、一次只能跑一個建置。對這個專案來說綽綽有餘（只有修改程式或設定時才會建置）。

### 後端內建的保護機制

- 每個 IP 每 8 小時最多查詢 250 次，超過會回應「查詢次數過多」。
- 「最近開了多久」同一時間最多處理 2 個尚未暫存的查詢，其餘會回應「目前查詢人數較多」。
- 暫存：「最近開了多久」的結果暫存 4 小時；頻道名稱暫存 5 天。

---

## 已知限制與注意事項

- **直播清單來自 YouTube 的公開網頁，不是官方 API。** 後端會讀取頻道的「直播」分頁並解析內容。YouTube 一旦調整網頁格式，功能就可能失效，需要更新 `backend/src/` 裡的解析規則。
- **雲端主機可能被 YouTube 限制。** YouTube 有時會限制來自雲端機房的請求，此時查詢會失敗（Logs 顯示 `429`）。
- **「最近 30 天」是近似值。** 判斷依據是 YouTube 頁面上的相對時間（顯示「X 個月前」之前的都算），不是精確的 30 × 24 小時。
- **最多統計約 60 場直播。** 一個月內直播超過這個數量的頻道，總時數會被低估。
- **只計算已結束且公開顯示在「直播」分頁的直播。** 正在進行中的直播、待機室不會計入。
- **贊助連結**：如果頻道近期影片的說明欄裡有綠界（ECPay）或 DeerDonate 的贊助連結，結果頁會多顯示「>> 贊助主播」。
- **服務條款**：使用 YouTube Data API 代表你同意 [YouTube API 服務條款](https://developers.google.com/youtube/terms/api-services-terms-of-service) 與[開發人員政策](https://developers.google.com/youtube/terms/developer-policies)（其中要求在對外服務上提供 [YouTube 服務條款](https://www.youtube.com/t/terms)與 [Google 隱私權政策](https://policies.google.com/privacy)的連結）；讀取 YouTube 網頁的行為也受 YouTube 服務條款規範。公開架設前請自行評估，風險由架設者自負。

---

## 想改外觀或文字

| 想改的東西 | 改哪裡 |
|------------|--------|
| 瀏覽器分頁標題、分享時的說明文字 | `frontend/index.html`、`frontend/src/router/index.js` |
| 頁面最下方加上自己的署名與連結 | 設定環境變數 `VITE_FOOTER_TEXT`、`VITE_FOOTER_URL`（本機改 `frontend/.env`，上線改 Cloudflare 的 Environment variables） |
| 首頁標題、範例頻道 | `frontend/src/views/Home.vue` |
| 結果頁上的文字（例如「>> 訂閱頻道」） | `frontend/src/views/LastLive.vue`、`frontend/src/views/RecentLive.vue` |
| 背景顏色 | `frontend/src/App.vue` |
| 網站小圖示 | `frontend/public/favicon.svg` |
| 綁定自己的網域 | Cloudflare Pages 專案的 **Custom domains**；綁定後記得把新網址加進 Render 的 `ALLOWED_ORIGINS` |

---

## 給開發者的技術說明

- 後端：Node.js（20 以上）＋ Express 5，沒有資料庫，所有暫存都在記憶體裡。
- 前端：Vue 3 ＋ Vite ＋ Vue Router，樣板使用 Pug、樣式使用 Sass。

### 環境變數

| 位置 | 變數 | 必填 | 說明 |
|------|------|------|------|
| 後端 | `YOUTUBE_API_KEY` | 是 | YouTube Data API v3 金鑰 |
| 後端 | `ALLOWED_ORIGINS` | 是 | 允許呼叫後端的前端網址，逗號分隔 |
| 後端 | `PORT` | 否 | 連接埠，預設 `8080`；Render 會自動設定 |
| 前端 | `VITE_API_URL` | 是 | 後端網址，結尾不加 `/` |
| 前端 | `VITE_FOOTER_TEXT` | 否 | 頁尾署名文字 |
| 前端 | `VITE_FOOTER_URL` | 否 | 頁尾署名連結 |

### 後端 API

兩支 API 都是 `POST`，內容為 JSON：`{ "channelId": "@帳號代碼" }`。

| 路徑 | 成功回應（200） | 其他狀態 |
|------|-----------------|----------|
| `/api/channel-last-live` | `{ name, lastLiveId, lastLiveTime, deer?, ecpay?, message }` | `422` 正在直播 `{ count, lastLiveId }`、`403` 沒有直播紀錄、`400` 找不到頻道、`429` 流量限制、`500` 查詢失敗 |
| `/api/channel-diligence` | `{ data: { name, deer?, ecpay?, list: [{ id, length }] } }` | `403` 沒有直播紀錄、`400` 找不到頻道、`429` 流量限制或忙碌、`500` 查詢失敗 |

`GET /` 會回應 `{"status":"ok"}`，可當作健康檢查。

### 前端網址

| 網址 | 畫面 |
|------|------|
| `/` | 首頁（多久沒開台） |
| `/recent` | 首頁（最近開了多久） |
| `/last/@帳號代碼` | 多久沒開台的結果 |
| `/recent/@帳號代碼` | 最近開了多久的結果 |

---

## 授權

本專案以 [MIT License](LICENSE) 釋出。
