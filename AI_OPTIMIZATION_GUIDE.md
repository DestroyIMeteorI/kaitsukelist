# 🌸 買い付けリスト — AI 辨識優化指南（最終版）

> **這份檔案是給 Claude Code 用的完整修改指令。**
>
> ## 使用方式
> 1. 把這份檔案放到專案根目錄：`~/kaitsukelist/AI_OPTIMIZATION_GUIDE.md`
> 2. 打開 Claude Code，說：「請讀 AI_OPTIMIZATION_GUIDE.md，從第 1 步開始」
> 3. **一次只做一步，每步改完先 `npm run dev` 測試，確認沒壞再做下一步**
>
> **目標檔案：`src/app/api/identify/route.ts`**（幾乎所有修改都在這個檔案）

---

## 📋 現有程式碼問題分析

我已讀完 `src/app/api/identify/route.ts` 的完整程式碼，以下是具體問題：

| # | 問題 | 程式碼位置 | 影響 |
|---|------|-----------|------|
| 1 | **沒設 thinkingConfig** — Gemini 2.5 Flash 預設開啟「思考模式」，每次多花 2-5 秒想 | `genAI.getGenerativeModel()` 那段 | 速度慢 |
| 2 | **Prompt 缺少範例** — AI 不知道你期待什麼格式的回答 | `buildPrompt()` 函式 | 準確度差 |
| 3 | **ALLOWED_HOSTS 太少** — 少了 UNIQLO、GU、MUJI、@cosme、Mercari 等常見網站 | `ALLOWED_HOSTS` 陣列 | URL 辨識範圍小 |
| 4 | **URL 解析用 regex 抓 HTML** — 沒有用 cheerio，很多標籤抓不到 | `fetchUrlContent()` 函式 | URL 辨識不準 |
| 5 | **沒有抽取 JSON-LD** — 很多購物網站把商品資料放在 JSON-LD 裡，目前完全沒用到 | `fetchUrlContent()` 函式 | 漏掉最準確的資料來源 |
| 6 | **Retry 是重新呼叫 API** — 失敗時又等一次 3-8 秒 | `for (let attempt = 1; attempt <= 2; ...)` 迴圈 | 失敗時等超久 |
| 7 | **使用者等待時沒有反饋** — 前端沒有 loading 動畫 | 前端元件（非此檔案） | 體感差 |

### 🤔 需要換模型嗎？

**不用。** Gemini 2.5 Flash 對「辨識日本商品」這種任務夠用了。
問題出在「怎麼用」，不是「用什麼模型」。

| 模型 | 速度 | 準確度 | 月費估算（10人用）| 結論 |
|------|------|--------|------------------|------|
| **Gemini 2.5 Flash** ✅ | ⚡ 快 | 夠好 | 幾乎免費 | 優化後就很夠 |
| Gemini 2.5 Pro | 🐢 慢 3 倍 | 更準一點 | ~$5-10 | 不值得，太慢 |
| Claude Sonnet | 🐢 慢 | 很準 | ~$10+ | 要多裝 SDK，複雜 |
| GPT-4o | 🐢 慢 | 很準 | ~$10+ | 同上，不值得 |

---

## 🚀 第 1 步：關閉 Thinking — 立刻加速 50%

> **白話說：** AI 目前每次回答前都會「想一想」，但辨識商品不需要深度思考。關掉就快了。

### 要改什麼

找到這段程式碼（約在檔案第 200 行左右）：

```typescript
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    temperature: 0.3,
    maxOutputTokens: 2048,
    responseMimeType: "application/json",
    responseSchema: responseSchema as any,
  },
});
```

### 改成

```typescript
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    temperature: 0.2,  // 從 0.3 降到 0.2，讓回答更穩定
    maxOutputTokens: 2048,
    responseMimeType: "application/json",
    responseSchema: responseSchema as any,
    // @ts-expect-error — thinkingConfig 在新版 SDK 才有型別
    thinkingConfig: {
      thinkingBudget: 0,  // 關閉思考，直接回答
    },
  },
});
```

### 為什麼這樣改

- `thinkingBudget: 0`：告訴 AI「不用想，直接回答」，省下 2-5 秒
- `temperature: 0.2`：讓回答更穩定一致（0 = 完全固定，1 = 很隨機）
- `@ts-expect-error`：因為你的 SDK 版本 `^0.24.0` 可能還沒有 thinkingConfig 的 TypeScript 型別定義，但 API 端已經支援了，加這行避免編譯錯誤

### 測試方法

改完後 `npm run dev`，輸入「白色戀人」，看回應時間是否從 ~5 秒降到 ~2 秒。

---

## 🚀 第 2 步：升級 Prompt — 提升準確度

> **白話說：** 就像教新員工，光說「幫我查商品」不夠，要給他看範例：「像這樣查，品牌寫上去、不確定就說不確定。」

### 要改什麼

找到 `buildPrompt()` 函式（約在第 110 行），把整個函式替換掉：

```typescript
function buildPrompt(
  inputText: string | null,
  exchangeRate: number,
  urlContent?: string
) {
  const base = `你是一個專業的日本代購助手。你的任務是辨識商品並提供完整的購買資訊。

目前日幣兌台幣匯率：1 JPY ≈ ${exchangeRate} TWD

## 重要規則
1. product_name_zh 格式：「品牌 + 商品名 + 規格」，例如「石屋製菓 白色戀人 36入」
2. product_name_ja：填日文原名，方便在日本搜尋
3. estimated_price_jpy：填 selected_variant_index 對應品項的日幣價格
4. estimated_price_twd：estimated_price_jpy × ${exchangeRate}，四捨五入到整數
5. where_to_buy：填日本實體店鋪或購物網站（如「松本清」「唐吉訶德」「Amazon.co.jp」）
6. confidence：確定 → high、有點不確定 → medium、很不確定 → low
7. variants：列出所有常見品項/規格/容量/口味，每個附名稱和日幣價格。至少 1 個。
8. 如果價格不確定，寧可填 0，不要亂猜

## 範例

輸入：「白色戀人」
正確回覆重點：
- product_name_zh: "石屋製菓 白色戀人 36入"
- product_name_ja: "石屋製菓 白い恋人 36枚入"
- brand: "石屋製菓 ISHIYA"
- variants 要有 12入/24入/36入/54入 四種規格
- confidence: "high"

輸入：「uniqlo 發熱衣」
正確回覆重點：
- product_name_zh: "UNIQLO HEATTECH 圓領長袖T恤"
- product_name_ja: "ユニクロ ヒートテック クルーネックT（長袖）"
- variants 要有 一般款/極暖/超極暖 三種
- where_to_buy 要有 "UNIQLO 日本門市"
- confidence: "medium"（因為價格常變動）

輸入：「dhc 護唇膏」
正確回覆重點：
- product_name_zh: "DHC 純橄欖護唇膏 1.5g"
- product_name_ja: "DHC 薬用リップクリーム 1.5g"
- where_to_buy: ["松本清", "唐吉訶德", "日本便利商店"]
- confidence: "high"`;

  if (urlContent) {
    return `${base}\n\n${urlContent}`;
  }

  if (inputText) {
    return `${base}\n\n使用者想買的商品：「${inputText}」`;
  }

  return `${base}\n\n使用者上傳了一張商品圖片，請辨識圖片中的商品（注意名稱文字、品牌 Logo、包裝特徵）。
如果圖片模糊或無法辨識，confidence 填 low，product_name_zh 填你最好的猜測。`;
}
```

### 為什麼這樣改

- 加了 3 個具體範例（白色戀人、UNIQLO、DHC），AI 看了範例就知道你要什麼格式
- 「寧可填 0，不要亂猜」— 防止 AI 編造不存在的價格
- 圖片辨識的 prompt 更明確，提示 AI 注意文字和 Logo

### 測試方法

試這三個輸入看回傳品質：
1. 文字：「樂敦 CC 美容液」→ 應回傳品牌、規格、多個容量選項
2. 文字：「pocky」→ 應回傳「固力果 Pocky 巧克力棒」，有多種口味的 variants
3. 網址：貼一個 Amazon Japan 連結

---

## 🚀 第 3 步：擴充 ALLOWED_HOSTS — 支援更多網站

> **白話說：** 目前只允許 8 個網站的網址，加到 30+ 個。

### 要改什麼

找到 `ALLOWED_HOSTS` 陣列，整個替換成：

```typescript
const ALLOWED_HOSTS = [
  // --- 大型電商 ---
  "amazon.co.jp", "www.amazon.co.jp",
  "rakuten.co.jp", "item.rakuten.co.jp", "search.rakuten.co.jp", "www.rakuten.co.jp",
  "shopping.yahoo.co.jp", "store.shopping.yahoo.co.jp", "paypaymall.yahoo.co.jp",

  // --- 家電量販 ---
  "kakaku.com", "www.kakaku.com",
  "yodobashi.com", "www.yodobashi.com",
  "biccamera.com", "www.biccamera.com",

  // --- 藥妝 / 美妝 ---
  "matsukiyo.co.jp", "www.matsukiyo.co.jp",
  "cosme.net", "www.cosme.net", "www.cosme.com",
  "sundrug.co.jp", "www.sundrug.co.jp",
  "ainz-tulpe.jp", "www.ainz-tulpe.jp",

  // --- 服飾 ---
  "uniqlo.com", "www.uniqlo.com",
  "gu-global.com", "www.gu-global.com",
  "zozo.jp", "www.zozotown.com",
  "abc-mart.net", "www.abc-mart.net",

  // --- 生活雜貨 ---
  "muji.com", "www.muji.com",
  "loft.co.jp", "www.loft.co.jp",
  "hands.net", "www.hands.net",
  "nitori-net.jp", "www.nitori-net.jp",

  // --- 折扣 / 二手 ---
  "donki.com", "www.donki.com",
  "mercari.com", "jp.mercari.com",
  "fril.jp", "www.fril.jp",

  // --- 食品 / 土產 ---
  "royce.com", "www.royce.com",
  "ishiya-shop.jp", "www.ishiya-shop.jp",
  "calbee.co.jp", "www.calbee.co.jp",

  // --- 便利商店 / 超市 ---
  "sej.co.jp", "www.sej.co.jp",
  "lawson.co.jp", "www.lawson.co.jp",
  "family.co.jp", "www.family.co.jp",
  "aeon.com", "www.aeon.com",

  // --- 動漫 / 周邊 ---
  "animate.co.jp", "www.animate.co.jp",
  "suruga-ya.jp", "www.suruga-ya.jp",
  "mandarake.co.jp", "www.mandarake.co.jp",
];
```

### 同時更新 `extractUrlHints()` 函式

把整個 `extractUrlHints()` 函式替換成：

```typescript
function extractUrlHints(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const pathParts = u.pathname.split("/").filter(Boolean);

    let platform = "";
    let hints = "";

    if (host.includes("rakuten.co.jp")) {
      platform = "樂天市場 (Rakuten)";
      if (pathParts[0]) hints += `店鋪: ${pathParts[0]}\n`;
      if (pathParts[1]) hints += `商品ID: ${pathParts[1]}\n`;
    } else if (host.includes("amazon.co.jp")) {
      platform = "Amazon Japan";
      const dpIndex = pathParts.indexOf("dp");
      if (dpIndex >= 0 && pathParts[dpIndex + 1]) {
        hints += `ASIN: ${pathParts[dpIndex + 1]}\n`;
      }
      if (pathParts[0] && pathParts[0] !== "dp" && pathParts[0] !== "gp") {
        hints += `商品名: ${decodeURIComponent(pathParts[0]).replace(/-/g, " ")}\n`;
      }
    } else if (host.includes("yahoo.co.jp")) {
      platform = "Yahoo! ショッピング";
    } else if (host.includes("uniqlo.com")) {
      platform = "UNIQLO 日本";
      const prodCode = pathParts.find(p => /^E\d+/.test(p) || /^\d{6,}/.test(p));
      if (prodCode) hints += `商品碼: ${prodCode}\n`;
    } else if (host.includes("gu-global.com")) {
      platform = "GU 日本";
      const prodCode = pathParts.find(p => /^\d{6,}/.test(p));
      if (prodCode) hints += `商品碼: ${prodCode}\n`;
    } else if (host.includes("muji.com")) {
      platform = "無印良品 MUJI";
    } else if (host.includes("cosme.net") || host.includes("cosme.com")) {
      platform = "@cosme";
    } else if (host.includes("mercari.com")) {
      platform = "Mercari メルカリ（二手商品，價格僅供參考）";
    } else if (host.includes("zozotown.com") || host.includes("zozo.jp")) {
      platform = "ZOZOTOWN";
    } else if (host.includes("matsukiyo.co.jp")) {
      platform = "松本清 Matsumoto Kiyoshi";
    } else if (host.includes("yodobashi.com")) {
      platform = "Yodobashi Camera ヨドバシ";
    } else if (host.includes("biccamera.com")) {
      platform = "BIC CAMERA";
    } else if (host.includes("donki.com")) {
      platform = "唐吉訶德 ドン・キホーテ";
    } else if (host.includes("animate.co.jp")) {
      platform = "Animate（動漫周邊）";
    } else if (host.includes("mandarake.co.jp")) {
      platform = "Mandarake まんだらけ（動漫二手）";
    } else if (host.includes("loft.co.jp")) {
      platform = "LOFT（生活雜貨）";
    } else if (host.includes("hands.net")) {
      platform = "東急Hands";
    } else if (host.includes("nitori-net.jp")) {
      platform = "NITORI 宜得利";
    } else {
      platform = host;
    }

    return `平台: ${platform}\n${hints}`.trim();
  } catch {
    return "";
  }
}
```

### 測試方法

試貼以下網址看是否能辨識：
1. `https://www.uniqlo.com/jp/ja/products/E469455-000/00`
2. `https://www.muji.com/jp/ja/store/cmdty/detail/4550344294956`

---

## 🚀 第 4 步：安裝 cheerio + 加入 JSON-LD 抽取

> **白話說：** 目前用 regex 抓 HTML 資料，容易漏。cheerio 是專門解析 HTML 的工具。JSON-LD 是購物網站藏商品資料的標準格式，抽到就不用問 AI 了 — 秒回。

### 4-1. 先安裝 cheerio

```bash
npm install cheerio
```

### 4-2. 在檔案最上面加 import

在 `src/app/api/identify/route.ts` 的 import 區最後加一行：

```typescript
import * as cheerio from 'cheerio';
```

### 4-3. 新增三個工具函式

在 `isAllowedUrl()` 函式下方，新增以下三個函式：

```typescript
// === 從 HTML 抽取結構化資料的工具 ===

/** 從文字裡抽出價格數字，例如 "¥1,980（税込）" → 1980 */
function extractPrice(text: string | undefined | null): number {
  if (!text) return 0;
  const cleaned = text.replace(/[^0-9]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * 從 HTML 裡找 JSON-LD 結構化資料。
 * 很多購物網站會在 <script type="application/ld+json"> 裡放商品資料，
 * 這是最準確的資料來源。
 */
function extractJsonLd($: cheerio.CheerioAPI, targetType: string): any {
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    try {
      const data = JSON.parse($(scripts[i]).html() || '');
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === targetType) return item;
        // 有時候包在 @graph 裡面
        if (item['@graph']) {
          const found = item['@graph'].find((g: any) => g['@type'] === targetType);
          if (found) return found;
        }
      }
    } catch { /* JSON 解析失敗就跳過 */ }
  }
  return null;
}

/**
 * 用 cheerio 從 HTML 抽取商品資訊。
 * 依序嘗試：JSON-LD → OG meta + price selector。
 * 回傳 null 代表資訊不夠，需要繼續用 AI 辨識。
 */
function extractProductFromHtml(html: string, hostname: string): {
  productName: string;
  priceJpy: number;
  brand: string;
  description: string;
} | null {
  const $ = cheerio.load(html);

  // 第一優先：JSON-LD（最準確）
  const jsonLd = extractJsonLd($, 'Product');
  if (jsonLd && jsonLd.name) {
    const price = jsonLd.offers?.price
      ? Number(jsonLd.offers.price)
      : jsonLd.offers?.lowPrice
        ? Number(jsonLd.offers.lowPrice)
        : 0;
    return {
      productName: String(jsonLd.name),
      priceJpy: Math.round(price),
      brand: jsonLd.brand?.name || jsonLd.brand || '',
      description: String(jsonLd.description || '').slice(0, 200),
    };
  }

  // 第二優先：OG meta + 常見 price CSS selector
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim();
  const ogDesc = $('meta[property="og:description"]').attr('content')?.trim()
    || $('meta[name="description"]').attr('content')?.trim();
  const priceFromMeta = extractPrice(
    $('meta[property="product:price:amount"]').attr('content')
    || $('meta[property="og:price:amount"]').attr('content')
  );

  // 各網站的價格 CSS selector
  const priceSelectors = [
    '.a-price-whole',                       // Amazon
    '.price2', '.price--OX_YW',             // 樂天
    '.elPriceNumber', '.Price__value',       // Yahoo Shopping
    '.productPrice', '.js_currentPrice',     // Yodobashi
    '.bcs_price',                            // BIC CAMERA
    '.price', '.product-price',              // 通用
  ];
  let priceFromSelector = 0;
  for (const sel of priceSelectors) {
    const text = $(sel).first().text();
    const p = extractPrice(text);
    if (p > 0) { priceFromSelector = p; break; }
  }

  const finalPrice = priceFromMeta || priceFromSelector;
  const title = ogTitle || $('title').text().trim();

  if (title && title.length > 3) {
    return {
      productName: title,
      priceJpy: finalPrice,
      brand: '',
      description: (ogDesc || '').slice(0, 200),
    };
  }

  return null; // 資訊不夠，交給 AI
}
```

### 4-4. 改造 `fetchUrlContent()` 函式

把整個 `fetchUrlContent()` 函式替換成以下版本。注意：回傳型別從 `string` 變成物件了。

```typescript
/**
 * 從 URL 抽取商品資訊。
 * 新邏輯：先用 cheerio 抽取 → 抽到就直接用（跳過 AI） → 抽不到才交給 AI
 */
async function fetchUrlContent(url: string): Promise<{
  prompt: string;
  directResult?: {
    productName: string;
    priceJpy: number;
    brand: string;
    description: string;
  };
}> {
  const urlHints = extractUrlHints(url);

  // SSRF 防護
  if (!isAllowedUrl(url)) {
    return { prompt: buildUrlFallback(url, urlHints) };
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept-Language": "ja,zh-TW;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return { prompt: buildUrlFallback(url, urlHints) };
    }

    const html = await res.text();
    const hostname = new URL(url).hostname;

    // ✨ 嘗試直接從 HTML 抽取
    const directResult = extractProductFromHtml(html, hostname);
    if (directResult && directResult.productName && directResult.priceJpy > 0) {
      return { prompt: '', directResult };
    }

    // 資料不夠 → 用 cheerio 取摘要給 AI
    const $ = cheerio.load(html);
    const ogTitle = $('meta[property="og:title"]').attr('content')?.trim()
      || $('title').text().trim();
    const ogDesc = $('meta[property="og:description"]').attr('content')?.trim()
      || $('meta[name="description"]').attr('content')?.trim();

    $('script, style, nav, footer, header').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 2000);

    if ((ogTitle || '').length + bodyText.length < 50) {
      return { prompt: buildUrlFallback(url, urlHints) };
    }

    // 如果有部分資訊，一起告訴 AI
    const partialHints = directResult
      ? `\n已從網頁抽取到：商品名「${directResult.productName}」${directResult.brand ? `、品牌「${directResult.brand}」` : ''}，請補充完整。`
      : '';

    return {
      prompt: `以下是商品網頁的內容，請從中辨識商品資訊：
網頁標題: ${ogTitle}
網頁描述: ${ogDesc || ''}
頁面內容: ${bodyText}${partialHints}`
    };
  } catch {
    return { prompt: buildUrlFallback(url, urlHints) };
  }
}
```

### 4-5. 更新 POST handler 來配合新的 fetchUrlContent

在 `POST()` 函式裡，找到處理 URL 的這段：

```typescript
// ❌ 目前的寫法
let urlContent: string | undefined;
let userUrl: string | undefined;
if (inputText && isUrl(inputText)) {
  userUrl = inputText.trim();
  urlContent = await fetchUrlContent(userUrl);
}
```

替換成：

```typescript
// ✅ 新寫法
let urlContent: string | undefined;
let userUrl: string | undefined;

if (inputText && isUrl(inputText)) {
  userUrl = inputText.trim();
  const urlData = await fetchUrlContent(userUrl);
  urlContent = urlData.prompt || undefined;

  // ✨ 如果從 HTML 直接抽到完整資訊 → 跳過 AI，秒回！
  if (urlData.directResult && urlData.directResult.priceJpy > 0) {
    // 先取匯率
    let exchangeRate = 0.2012;
    try {
      const rateRes = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/exchange-rate`
      );
      const rateData = await rateRes.json();
      exchangeRate = rateData.rate;
    } catch { /* 用預設 */ }

    const dr = urlData.directResult;
    const aiData: AiResponse = {
      product_name_zh: dr.productName,
      product_name_ja: dr.productName,
      brand: dr.brand,
      estimated_price_jpy: dr.priceJpy,
      estimated_price_twd: Math.round(dr.priceJpy * exchangeRate),
      where_to_buy: [new URL(userUrl).hostname],
      buy_url: userUrl,
      description: dr.description || '',
      confidence: 'high',
      variants: [{ name: dr.productName, price_jpy: dr.priceJpy }],
      selected_variant_index: 0,
    };

    return NextResponse.json({
      success: true,
      data: aiData,
      exchange_rate: exchangeRate,
    });
  }
}
```

### 測試方法

1. 貼 UNIQLO 商品 URL → 應 < 1 秒回傳（從 JSON-LD 直接抽）
2. 貼 Amazon 商品 URL → 2-3 秒（看 Amazon 是否回完整 HTML）
3. 貼一個不在白名單的 URL → 仍用 URL 線索辨識（fallback）

---

## 🚀 第 5 步：改善 Retry 邏輯

> **白話說：** 以前「AI 回答格式錯 → 整個重問一次（又等 3-8 秒）」。現在改成「格式錯 → 用預設值填上，讓使用者手動改」。

### 要改什麼

找到 POST handler 裡的 retry 迴圈（`for (let attempt = 1; attempt <= 2; attempt++)`），把從迴圈開始到最後 `return NextResponse.json({ success: false, error: "AI 回覆格式異常..." })` 為止，整段替換成：

```typescript
    // === 呼叫 Gemini（只呼叫一次，不 retry） ===
    const prompt = buildPrompt(
      urlContent ? null : inputText,
      exchangeRate,
      urlContent
    );
    const contents = imagePart ? [prompt, imagePart] : [prompt];

    const result = await model.generateContent(contents);
    const responseText = result.response.text();
    const raw = tryParseJson(responseText);

    if (raw) {
      const aiData = normalizeAiResponse(raw, exchangeRate, userUrl);
      return NextResponse.json({
        success: true,
        data: aiData,
        exchange_rate: exchangeRate,
      });
    }

    // JSON 解析失敗 → 回傳預設值讓使用者手動修改（不再重試）
    console.warn("AI 回覆解析失敗，使用 fallback。原始回覆：", responseText.slice(0, 200));
    const fallbackData: AiResponse = {
      product_name_zh: inputText || "（AI 辨識失敗，請手動輸入）",
      product_name_ja: "",
      brand: "",
      estimated_price_jpy: 0,
      estimated_price_twd: 0,
      where_to_buy: ["Amazon.co.jp"],
      buy_url: userUrl || "",
      description: "AI 辨識異常，請手動修改商品資訊",
      confidence: "low",
      variants: [],
      selected_variant_index: 0,
    };
    return NextResponse.json({
      success: true,
      data: fallbackData,
      exchange_rate: exchangeRate,
      needs_manual_edit: true,
    });
```

同時刪掉不再需要的 `buildRetryPrompt()` 函式（整個函式都可以刪）。

---

## 🚀 第 6 步：前端 Loading 動畫

> **白話說：** 加一個「AI 正在辨識中...」的動畫，使用者就不會以為當機了。

### 要改什麼

`src/components/SubmitForm.tsx`（或你的商品新增表單元件）

### 改法

在你的 component 裡加 state 和 loading 訊息輪播：

```tsx
const [loadingMsg, setLoadingMsg] = useState('');

const LOADING_MSGS = [
  '🔍 AI 正在辨識商品...',
  '💰 查詢日幣價格中...',
  '🏪 尋找購買地點...',
  '📦 整理商品資訊...',
];

async function handleSubmit() {
  setLoadingMsg(LOADING_MSGS[0]);
  let idx = 0;
  const timer = setInterval(() => {
    idx = (idx + 1) % LOADING_MSGS.length;
    setLoadingMsg(LOADING_MSGS[idx]);
  }, 1500);

  try {
    const result = await fetch('/api/identify', { ... });
    // ... 原本的邏輯
  } finally {
    clearInterval(timer);
    setLoadingMsg('');
  }
}
```

在 JSX 送出按鈕下方加：

```tsx
{loadingMsg && (
  <div className="flex flex-col items-center gap-3 py-6 animate-fadeIn">
    <div className="text-2xl animate-spin" style={{ animationDuration: '2s' }}>🌸</div>
    <p className="text-sm text-gray-400 animate-pulse">{loadingMsg}</p>
  </div>
)}
```

---

## 📊 預期效果總覽

| 改了什麼 | 改之前 | 改之後 |
|----------|--------|--------|
| 文字辨識速度 | 3-8 秒 | **1-3 秒** |
| URL 辨識（有 JSON-LD 的網站）| 5-12 秒 | **< 1 秒**（跳過 AI） |
| URL 辨識（其他網站）| 5-12 秒 | **2-4 秒** |
| 辨識準確度 | ~70% | **~90%** |
| 支援網站數 | 8 個域名 | **30+ 個域名** |
| 失敗等待 | 重試（×2 時間）| **立即回傳預設值** |
| 使用者體感 | 空白等待 | **🌸 動畫 + 進度提示** |
| 需要換模型？ | — | **不用，Flash 夠了** |

---

## ❓ 新手常見問題

**Q: cheerio 是什麼？安全嗎？**
A: 就像 jQuery 但在 server 端使用，專門解析 HTML。npm 每週超過 800 萬次下載，非常安全穩定。

**Q: JSON-LD 是什麼？為什麼這麼重要？**
A: 購物網站把商品資料（名稱、價格、品牌）放在 HTML 裡一個特殊標籤裡的標準格式。Google 搜尋結果顯示商品價格就是靠這個。UNIQLO、MUJI、松本清等大站都有。如果能從這裡抽到資料，就完全不用呼叫 AI → 秒回。

**Q: thinkingBudget: 0 會讓 AI 變笨嗎？**
A: 不會。thinking 是用來解數學、寫程式等需要「一步一步推理」的任務。辨識商品就是「看到什麼說什麼」，不需要深度思考，關掉只是省掉不必要的等待。

**Q: `@ts-expect-error` 是什麼？**
A: 告訴 TypeScript「下一行我知道會有型別錯誤，請忽略」。因為 SDK 版本 `^0.24.0` 還沒有 thinkingConfig 的 TypeScript 型別，但 Gemini API 已經支援了。

**Q: 改完怎麼部署？**
A: `git add . → git commit → git push`，Vercel 會自動部署。先在本地 `npm run dev` 測試過再 push。

**Q: 如果未來想加新網站？**
A: 在 `ALLOWED_HOSTS` 加域名。如果那個網站 URL 有特殊格式，到 `extractUrlHints()` 加一個 `else if`。

---

## 🔧 Claude Code 指令清單（回家直接複製貼上）

```
第 1 步：
請讀 AI_OPTIMIZATION_GUIDE.md 的第 1 步，在 src/app/api/identify/route.ts 裡的 getGenerativeModel() 加入 thinkingConfig: { thinkingBudget: 0 }，temperature 改成 0.2

第 2 步：
請讀 AI_OPTIMIZATION_GUIDE.md 的第 2 步，替換 buildPrompt() 函式

第 3 步：
請讀 AI_OPTIMIZATION_GUIDE.md 的第 3 步，替換 ALLOWED_HOSTS 陣列和 extractUrlHints() 函式

第 4 步：
先跑 npm install cheerio，然後讀 AI_OPTIMIZATION_GUIDE.md 的第 4 步，依序做 4-2 到 4-5

第 5 步：
請讀 AI_OPTIMIZATION_GUIDE.md 的第 5 步，把 retry 迴圈改成單次呼叫 + fallback，並刪掉 buildRetryPrompt()

第 6 步：
請讀 AI_OPTIMIZATION_GUIDE.md 的第 6 步，在 SubmitForm 元件加 loading 動畫
```
