# 🌸 部署指南 — 一步一步照做

## Step 1：設定 Supabase 資料庫

### 1-1. 建立資料表
1. 打開 [Supabase Dashboard](https://supabase.com/dashboard)
2. 選你的專案（或新建一個，名字隨便取，例如 `kaitsukelist`，Region 選 **Northeast Asia (Tokyo)**）
3. 左側選單點 **SQL Editor**
4. 把 `supabase-setup.sql` 的內容全部貼上
5. 點右下角 **Run** 執行
6. 看到綠色 Success 就對了 ✅

### 1-2. 建立圖片儲存空間
1. 左側選單點 **Storage**
2. 點 **New bucket**
3. Name 填：`product-images`
4. ⚠️ 勾選 **Public bucket**（讓圖片可以被看到）
5. 點 Create

### 1-3. 設定 Storage 權限
1. 點進剛建的 `product-images` bucket
2. 點上方 **Policies** 分頁
3. 點 **New Policy** → **For full customization**
4. 建立以下政策：

**允許上傳：**
- Policy name: `Allow uploads`
- Allowed operation: `INSERT`
- Target roles: 選 `anon`
- WITH CHECK expression: `true`

**允許讀取：**
- Policy name: `Allow public read`
- Allowed operation: `SELECT`
- Target roles: 選 `anon`
- USING expression: `true`

### 1-4. 取得 API Keys
1. 左側選單 **Settings** → **API**
2. 複製這兩個值（等等要用）：
   - **Project URL**（長得像 `https://xxxxx.supabase.co`）
   - **anon public key**（很長一串 `eyJhbGci...`）

---

## Step 2：取得 Gemini API Key

1. 打開 [Google AI Studio](https://aistudio.google.com/apikey)
2. 點 **Create API Key**
3. 選一個 Google Cloud 專案（或建新的）
4. 複製 API Key（等等要用）

---

## Step 3：上傳程式碼到 GitHub

1. 在 GitHub 建一個新的 Repository
   - 名字：`kaitsukelist`（或你喜歡的名字）
   - 選 **Private**（私人）
2. 把我給你的整個專案資料夾推上去：

```bash
cd kaitsukelist
git init
git add .
git commit -m "🌸 初始版本"
git branch -M main
git remote add origin https://github.com/你的帳號/kaitsukelist.git
git push -u origin main
```

---

## Step 4：部署到 Vercel

1. 打開 [Vercel Dashboard](https://vercel.com/dashboard)
2. 點 **Add New** → **Project**
3. 選你剛上傳的 `kaitsukelist` GitHub repo
4. 在 **Environment Variables** 區域，加入以下 4 個變數：

| KEY | VALUE |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | 你的 Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 你的 Supabase anon key |
| `GEMINI_API_KEY` | 你的 Google Gemini API Key |
| `NEXT_PUBLIC_SITE_URL` | 先空著，部署完再填 |

5. 點 **Deploy**，等 1-2 分鐘
6. 部署完成後，Vercel 會給你一個網址（例如 `kaitsukelist.vercel.app`）
7. 回到 Vercel **Settings** → **Environment Variables**，把 `NEXT_PUBLIC_SITE_URL` 填上你的網址 `https://kaitsukelist.vercel.app`
8. 點 **Redeploy**（重新部署一次）

---

## Step 5：測試

1. 打開你的網址
2. 輸入你的名字，進入清單
3. 測試打「樂敦眼藥水」，看 AI 能不能辨識
4. 測試拍照上傳
5. 進管理後台（首頁底部「管理員入口」），第一次進會要你設定密碼
6. 把網址分享給朋友同事！

---

## 🎉 完成！

分享給朋友的訊息範例：

> 嗨～我禮拜六去日本，如果有想代購的東西，
> 打開這個網址就能提交：
> https://你的網址.vercel.app
> 
> 輸入你的名字 → 打字或拍照告訴 AI 你想買什麼
> AI 會自動幫你查好價格和哪裡買 🌸
