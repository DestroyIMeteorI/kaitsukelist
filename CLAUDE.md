# KaitsukeList — 日本代購清單網站

## 專案概要
- **框架**: Next.js 15 + TypeScript + Tailwind CSS v4
- **資料庫**: Supabase (PostgreSQL + Storage)
- **AI**: Google Gemini 2.5 Flash API (商品辨識 + 搜尋)
- **部署**: Vercel
- **目標用戶**: ~10 人（4 朋友 + 5 同事），台灣使用者

## 技術規範
- 所有 UI 文字使用**繁體中文**（台灣用語）
- API routes 在 `src/app/api/`
- 前端頁面在 `src/app/` (首頁、/list、/admin)
- 共用元件在 `src/components/`
- 工具函式在 `src/lib/`
- 使用 Tailwind CSS v4 語法（@import "tailwindcss" + @theme）
- 自定義顏色用 sakura-* 系列（粉色櫻花主題）

## 架構重點
- **隱私**: 每個使用者只能看到自己的清單，管理員能看到全部
- **登入**: 輸入名字即可（不用帳密），存 localStorage
- **AI 辨識流程**: 使用者輸入文字或上傳圖片 → Gemini API 辨識 → 回傳 JSON（商品名/價格/購買地點/連結）
- **匯率**: 日幣→台幣即時換算，API route 快取 1 小時
- **圖片壓縮**: 瀏覽器端壓縮到 800px / 300KB 再上傳到 Supabase Storage

## 環境變數
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase 專案 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- `GEMINI_API_KEY` — Google Gemini API Key
- `NEXT_PUBLIC_SITE_URL` — 網站網址

## 程式碼風格
- 元件用 function component + hooks
- 避免 class component
- 動態 import supabase 函式（避免 SSR build 錯誤）
- 檔案命名用 PascalCase（元件）和 camelCase（工具函式）
- commit message 用中文 + emoji

## UI/UX 優化（2026-03-26）
- [x] **動畫主題強化** — globals.css 加入 fadeIn/scaleIn/slideInRight 動畫、sakura-700、斜角漸層背景、`.card-hover` hover 效果、粉色調 shimmer
- [x] **Toast 通知元件** — `Toast.tsx` + `useToast()` hook，取代所有 `alert()`，支援 success/error/info 三種類型，3 秒自動消失
- [x] **首頁 UX 優化** — 桌面兩欄版面、步驟指示器（圓點）、PIN 眼睛圖示顯示/隱藏、輸入滿 4 位自動送出
- [x] **ProductCard 互動** — inline 兩步刪除確認（取代 `window.confirm()`）、`.card-hover` 上浮效果
- [x] **SubmitForm 優化** — 圖片預覽放大至 120px、有圖時按鈕改為「更換圖片」
- [x] **桌面寬版版面** — /list 與 /admin 均支援 `md:max-w-3xl`，admin 商品列表改為 `md:grid-cols-2`
- [x] **section 標題統一** — 改為 `text-xs font-semibold uppercase tracking-wider text-gray-400`

## 新增功能（2026-03-26）
- [x] **使用者加備註 + 手動編輯商品** — ProductCard 加 ✏️ 編輯按鈕，inline 展開表單（含備註、重量）
- [x] **清單搜尋 / 排序** — /list 與 /admin 均支援搜尋框 + 排序下拉（最新/最舊/價格/重量）
- [x] **行李重量追蹤** — 加入清單時可選填重量（克），admin 顯示總重 + 20kg 警示進度條
- [x] **PWA** — 加入 manifest.json + sakura SVG icon，支援「加到主畫面」
- [x] **使用者名稱衝突防護（4碼 PIN）** — 新登入流程：名字 → PIN（SHA-256 雜湊後送 /api/auth 驗證）

## 已知問題 / TODO
- [x] AI 辨識回傳格式偶爾異常 — 已加入欄位驗證、預設值補齊、第二次 retry（更嚴格 prompt）
- [x] 管理後台密碼改用 Supabase Auth — 使用 `supabase.auth.signInWithPassword`，移除 localStorage 密碼
- [x] 手機版 UI 優化 — 按鈕點擊區 ≥ 44px、圖片放大、價格區塊 flex-wrap
- [x] 離線讀取模式 — 快取至 localStorage，離線時顯示 OfflineBanner，停用 AI 新增功能

## E2E 測試（Playwright）
```bash
npm run test:e2e          # 跑所有測試（無頭模式）
npm run test:e2e:ui       # 開啟 Playwright UI
npm run test:e2e:headed   # 有頭模式（看瀏覽器操作）
```
- 測試檔案在 `e2e/` 目錄
- `e2e/helpers.ts` — 共用 mock helper（API/Supabase/匯率）
- `e2e/auth.spec.ts` — 登入流程（8 個案例）
- `e2e/list.spec.ts` — 清單頁（11 個案例）
- `e2e/admin.spec.ts` — 管理後台（12 個案例）
- 所有外部 API（Supabase、Gemini、匯率）均以 `page.route()` mock，無需真實金鑰

## AI 辨識流程（2026-03-26 重構）
- 支援三種輸入：文字、圖片、商品網址（URL）
- URL 輸入時 server-side fetch 頁面內容；被擋時從 URL 結構抽取線索
- Gemini 2.5 Flash + `responseSchema` 強制結構化 JSON 輸出
- AI 自動列出商品所有品項（`variants` 陣列），使用者可選擇
- 搜尋連結（Amazon/樂天/Google）取代 AI 幻覺 URL
- 支援手動修改商品名稱與價格
- `📝 手動新增` 模式可跳過 AI，直接輸入商品資訊

## 管理後台功能（2026-03-26）
- 帳號管理分頁：改名、重設 PIN、刪除帳號
- 「✓ 已買」時可輸入實際購買金額（日幣 + 台幣換算）和數量
- items 表有 `actual_price_jpy`、`actual_quantity` 欄位

## 監控與部署
- `/api/health` 端點供 UptimeRobot 監控（每 5 分鐘 ping）
- 同時防止 Supabase free tier 因 7 天無活動暫停
- Vercel App 可手機遠端 Redeploy

## Supabase Auth 設定（管理員）
管理員帳號需在 Supabase Dashboard 手動建立：
1. 進入 Supabase 專案 → **Authentication** → **Users**
2. 點選 **Add user** → 填入 Email + 密碼
3. 使用該 Email/密碼登入 `/admin`
