import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { AiResponse } from "@/lib/types";
import * as cheerio from 'cheerio';

// === AI 商品辨識 API ===

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// 偵測輸入是否為 URL
function isUrl(text: string): boolean {
  return /^https?:\/\//i.test(text.trim());
}

// 允許 fetch 的購物網站域名白名單（防止 SSRF）
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

function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ALLOWED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

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

/** 從 JSON-LD offers 欄位解析出價格與所有尺寸/規格 variants */
function extractOffersData(offers: any): {
  price: number;
  variants: Array<{ name: string; price_jpy: number }>;
} {
  if (!offers) return { price: 0, variants: [] };

  // Case 1: offers 是陣列（各尺寸各自一個 Offer）
  if (Array.isArray(offers)) {
    const variants = offers
      .map((o: any) => ({
        name: String(o.name || o.sku || o.additionalProperty?.find((p: any) => p.name === 'size')?.value || ''),
        price_jpy: Math.round(Number(o.price) || 0),
      }))
      .filter((v) => v.price_jpy > 0);
    // 取最常見的價格（眾數）作為主要價格
    const priceCounts: Record<number, number> = {};
    for (const v of variants) priceCounts[v.price_jpy] = (priceCounts[v.price_jpy] || 0) + 1;
    const price = variants.length > 0
      ? Number(Object.entries(priceCounts).sort((a, b) => b[1] - a[1])[0][0])
      : 0;
    return { price, variants };
  }

  // Case 2: AggregateOffer 裡面有 offers 子陣列
  if (offers['@type'] === 'AggregateOffer' && Array.isArray(offers.offers)) {
    const inner = extractOffersData(offers.offers);
    // AggregateOffer 的 lowPrice 通常是最低價，不一定是正確單一商品價
    // 若 inner.price 有效就用它，否則用 lowPrice
    const price = inner.price || Math.round(Number(offers.lowPrice) || 0);
    return { price, variants: inner.variants };
  }

  // Case 3: 單一 Offer 物件
  const price = Math.round(Number(offers.price) || Number(offers.lowPrice) || 0);
  return { price, variants: [] };
}

/** 從 JSON-LD image 欄位解析出完整圖片 URL */
function extractImageUrl(imageField: any, pageUrl: string): string | null {
  let raw: string | null = null;
  if (typeof imageField === 'string') raw = imageField;
  else if (Array.isArray(imageField) && imageField.length > 0) raw = String(imageField[0]);
  else if (imageField?.url) raw = String(imageField.url);
  else if (imageField?.contentUrl) raw = String(imageField.contentUrl);

  if (!raw) return null;
  try {
    return new URL(raw, pageUrl).href;
  } catch {
    return null;
  }
}

/**
 * 用 cheerio 從 HTML 抽取商品資訊（包含圖片和所有尺寸 variants）。
 * 依序嘗試：JSON-LD → OG meta + price selector。
 * 回傳 null 代表資訊不夠，需要繼續用 AI 辨識。
 */
function extractProductFromHtml(html: string, pageUrl: string): {
  productName: string;
  priceJpy: number;
  brand: string;
  description: string;
  imageUrl: string | null;
  variants: Array<{ name: string; price_jpy: number }>;
} | null {
  const $ = cheerio.load(html);

  // 圖片優先從 og:image 抓（所有路徑都可用）
  const ogImageRaw = $('meta[property="og:image"]').attr('content') || '';
  const ogImage = ogImageRaw ? (() => {
    try { return new URL(ogImageRaw, pageUrl).href; } catch { return null; }
  })() : null;

  // 第一優先：JSON-LD（最準確）
  const jsonLd = extractJsonLd($, 'Product');
  if (jsonLd && jsonLd.name) {
    const { price, variants } = extractOffersData(jsonLd.offers);
    const jsonLdImage = extractImageUrl(jsonLd.image, pageUrl);
    return {
      productName: String(jsonLd.name),
      priceJpy: price,
      brand: jsonLd.brand?.name || (typeof jsonLd.brand === 'string' ? jsonLd.brand : '') || '',
      description: String(jsonLd.description || '').slice(0, 200),
      imageUrl: jsonLdImage || ogImage,
      variants,
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
    '.a-price-whole',                               // Amazon
    '.price2', '.price--OX_YW',                     // 樂天
    '.elPriceNumber', '.Price__value',               // Yahoo Shopping
    '.productPrice', '.js_currentPrice',             // Yodobashi
    '.bcs_price',                                    // BIC CAMERA
    '.price', '.product-price', '.item-price',       // 通用
    '.selling-price', '.sale-price', '.regular-price',
    '[class*="price"]', '[class*="Price"]',          // 寬鬆比對
  ];
  let priceFromSelector = 0;
  for (const sel of priceSelectors) {
    const text = $(sel).first().text();
    const p = extractPrice(text);
    if (p > 0) { priceFromSelector = p; break; }
  }

  // body text regex fallback：找 ¥1,555 / 1,555円 等格式
  let priceFromBodyText = 0;
  if (!priceFromMeta && !priceFromSelector) {
    $('script, style, nav, footer, header, aside').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ');
    const pricePatterns = [
      /[¥￥](\d{1,3}(?:,\d{3})+)/,           // ¥1,555
      /(\d{1,3}(?:,\d{3})+)\s*円/,            // 1,555円
      /(\d{4,6})\s*円/,                        // 1555円（無逗號）
    ];
    for (const pat of pricePatterns) {
      const m = bodyText.match(pat);
      if (m) {
        const p = parseInt((m[1] || m[0]).replace(/[^0-9]/g, ''), 10);
        if (p > 100 && p < 500000) { priceFromBodyText = p; break; }
      }
    }
  }

  const finalPrice = priceFromMeta || priceFromSelector || priceFromBodyText;
  const title = ogTitle || $('title').text().trim();

  if (title && title.length > 3) {
    return {
      productName: title,
      priceJpy: finalPrice,
      brand: '',
      description: (ogDesc || '').slice(0, 200),
      imageUrl: ogImage,
      variants: [],
    };
  }

  return null; // 資訊不夠，交給 AI
}

// 從 URL 路徑抽取有用的線索（店鋪名、商品 ID、路徑關鍵字）
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
      const prodSegment = pathParts.find(p => /^E\d+/.test(p) || /^\d{6,}/.test(p));
      if (prodSegment) {
        const numericCode = prodSegment.match(/E?(\d{6,})/)?.[1] || prodSegment;
        hints += `商品番号: ${numericCode}\n`;
      }
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

/** 從 URL 抽取商品番号（目前僅支援 UNIQLO） */
function extractProductCode(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (u.hostname.includes('uniqlo.com')) {
      const pathParts = u.pathname.split('/').filter(Boolean);
      const seg = pathParts.find(p => /^E\d+/.test(p) || /^\d{6,}/.test(p));
      if (seg) return seg.match(/E?(\d{6,})/)?.[1] || undefined;
    }
  } catch { /* ignore */ }
  return undefined;
}

/** 判斷是否為服飾類網站（需要完整尺寸才跳過 AI） */
function isClothingSite(hostname: string): boolean {
  return /uniqlo|gu-global|zozotown|abc-mart/.test(hostname);
}

// === UNIQLO 官方 API 抓取（繞過 SPA 無法 scrape 的問題）===

interface UniqloL2 {
  color: {
    code: string;
    displayCode: string;
    name: string;
  };
  size: {
    code: string;
    displayCode: string;
    name: string;
  };
  prices: {
    base: { value: number; currency: string };
    promo: { value: number; currency: string } | null;
  };
}

/**
 * 從 UNIQLO 官方 API 精準取得商品資訊。
 *
 * 端點說明：
 * - /products?productIds=   → 商品名、性別分類、各色圖片 URL（正確格式含 _3x4 後綴）
 * - /price-groups/{group}   → 完整 l2s（含 color.name、size.name、prices）
 *   注意：/price-groups/{group}/l2s 是另一個端點，回傳的資料是精簡版（無 prices/name）
 */
async function fetchUniqloProduct(url: string): Promise<{
  productName: string;
  priceJpy: number;
  brand: string;
  description: string;
  imageUrl: string | null;
  variants: Array<{ name: string; price_jpy: number }>;
  productCode: string;
  selectedVariantIndex: number;
} | null> {
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split('/').filter(Boolean);

    // 路徑格式：/jp/ja/products/{fullCode}/{priceGroup}
    const productsIdx = pathParts.indexOf('products');
    if (productsIdx < 0 || !pathParts[productsIdx + 1]) return null;

    const fullCode = pathParts[productsIdx + 1]; // e.g., "E471809-000"
    const priceGroup = pathParts[productsIdx + 2] || '00';

    const numericCode = fullCode.match(/E?(\d{6,})/)?.[1];
    if (!numericCode) return null;

    const selectedColor = u.searchParams.get('colorDisplayCode'); // e.g., "09"
    const selectedSize = u.searchParams.get('sizeDisplayCode');   // e.g., "004"

    const apiBase = 'https://www.uniqlo.com/jp/api/commerce/v5/ja';
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'ja,zh-TW;q=0.9,en;q=0.8',
      'Referer': 'https://www.uniqlo.com/',
      'Origin': 'https://www.uniqlo.com',
    };

    // 並行呼叫兩個端點
    const [searchRes, priceGroupRes] = await Promise.all([
      fetch(`${apiBase}/products?productIds=${fullCode}`, {
        headers: fetchHeaders,
        signal: AbortSignal.timeout(8000),
      }),
      // 注意：不加 /l2s，直接呼叫 /price-groups/{group}，才有完整的 prices + name
      fetch(`${apiBase}/products/${fullCode}/price-groups/${priceGroup}`, {
        headers: fetchHeaders,
        signal: AbortSignal.timeout(8000),
      }),
    ]);

    if (!priceGroupRes.ok) return null;

    const priceGroupJson = await priceGroupRes.json();
    const l2s: UniqloL2[] = priceGroupJson?.result?.l2s || [];
    if (l2s.length === 0) return null;

    // 從 search 端點取商品名、性別分類、各色圖片
    let productName = '';
    let genderName = '';
    let imageUrl: string | null = null;
    if (searchRes.ok) {
      const searchJson = await searchRes.json();
      const item = searchJson?.result?.items?.[0];
      productName = String(item?.name || '');
      genderName = String(item?.genderName || '');
      // images.main 是以 colorDisplayCode 為 key 的物件：{ "09": { image: "https://..." } }
      const mainImages: Record<string, { image: string }> = item?.images?.main || {};
      const colorKey = selectedColor || Object.keys(mainImages)[0];
      if (colorKey && mainImages[colorKey]?.image) {
        imageUrl = String(mainImages[colorKey].image);
      }
    }

    // 篩選指定顏色的 L2s；若無指定，取第一個顏色
    const firstColorCode = l2s[0]?.color?.displayCode;
    const colorL2s = selectedColor
      ? l2s.filter((l) => l.color.displayCode === selectedColor)
      : l2s.filter((l) => l.color.displayCode === firstColorCode);
    const targetL2s = colorL2s.length > 0 ? colorL2s : l2s.slice(0, 20);

    // 依 displayCode 排序尺寸，去重後建立 variants
    const seen = new Set<string>();
    const variants: Array<{ name: string; price_jpy: number }> = [];
    for (const l of [...targetL2s].sort((a, b) => a.size.displayCode.localeCompare(b.size.displayCode))) {
      const key = l.size.displayCode;
      if (seen.has(key)) continue;
      seen.add(key);
      const price = l.prices?.promo?.value ?? l.prices?.base?.value ?? 0;
      variants.push({ name: l.size.name || l.size.displayCode, price_jpy: price });
    }

    // 找到使用者選中的 L2，取精確價格 + 顏色名 + 尺寸名
    const selectedL2 = (selectedColor && selectedSize)
      ? (l2s.find((l) => l.color.displayCode === selectedColor && l.size.displayCode === selectedSize) ?? targetL2s[0])
      : targetL2s[0];

    const priceJpy = selectedL2?.prices?.promo?.value ?? selectedL2?.prices?.base?.value ?? variants[0]?.price_jpy ?? 0;

    // 組合規格描述（カラー / サイズ / 商品番号）給使用者確認
    const colorCode = selectedL2?.color?.displayCode || selectedColor || '';
    const colorName = selectedL2?.color?.name || '';
    const colorLabel = [colorCode, colorName].filter(Boolean).join(' ');

    const sizeName = selectedL2?.size?.name || selectedL2?.size?.displayCode || '';
    const sizeLabel = genderName ? `${genderName} ${sizeName}`.trim() : sizeName;

    const descParts: string[] = [];
    if (colorLabel) descParts.push(`カラー: ${colorLabel}`);
    if (sizeLabel) descParts.push(`サイズ: ${sizeLabel}`);
    if (numericCode) descParts.push(`商品番号: ${numericCode}`);
    const description = descParts.join('｜');

    // 計算預選的 variant index（對應使用者 URL 指定的尺寸）
    const selectedVariantIndex = sizeName
      ? Math.max(0, variants.findIndex((v) => v.name === sizeName))
      : 0;

    // 圖片 fallback（search API 拿不到時用標準 URL 格式）
    if (!imageUrl && numericCode) {
      const colorSuffix = selectedColor || (firstColorCode ?? '00');
      imageUrl = `https://image.uniqlo.com/UQ/ST3/jp/imagesgoods/${numericCode}/item/jpgoods_${colorSuffix}_${numericCode}_3x4.jpg`;
    }

    return {
      productName: productName || `UNIQLO 商品 ${numericCode}`,
      priceJpy,
      brand: 'UNIQLO',
      description,
      imageUrl,
      variants,
      productCode: numericCode,
      selectedVariantIndex,
    };
  } catch {
    return null;
  }
}

/**
 * 從 URL 抽取商品資訊。
 * 新邏輯：先用 cheerio 抽取 → 抽到足夠資訊就直接用（跳過 AI） → 否則帶 hints 交給 AI
 */
async function fetchUrlContent(url: string): Promise<{
  prompt: string;
  directResult?: {
    productName: string;
    priceJpy: number;
    brand: string;
    description: string;
    imageUrl: string | null;
    variants: Array<{ name: string; price_jpy: number }>;
    productCode?: string;
    selectedVariantIndex?: number;
  };
}> {
  const urlHints = extractUrlHints(url);
  const productCode = extractProductCode(url);

  // SSRF 防護
  if (!isAllowedUrl(url)) {
    return { prompt: buildUrlFallback(url, urlHints) };
  }

  // UNIQLO 是 SPA，HTML scraping 無法拿到真實資料，改走官方 API
  if (new URL(url).hostname.includes('uniqlo.com')) {
    const uniqloData = await fetchUniqloProduct(url);
    if (uniqloData && uniqloData.productName && uniqloData.priceJpy > 0) {
      return { prompt: '', directResult: uniqloData };
    }
    // API 失敗時 fallback 到一般流程（可能拿到部分資料）
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
    const extracted = extractProductFromHtml(html, url);

    if (extracted && extracted.productName && extracted.priceJpy > 0) {
      // 服飾類網站：需要有至少 2 個 variants 才跳過 AI（確保尺寸齊全）
      const hasGoodVariants = extracted.variants.length >= 2 || !isClothingSite(hostname);

      if (hasGoodVariants) {
        return {
          prompt: '',
          directResult: { ...extracted, productCode },
        };
      }

      // 服飾類但 variants 不夠 → 帶部分資訊送 AI 補齊尺寸
      const variantInfo = extracted.variants.length > 0
        ? `\n已抽取到 ${extracted.variants.length} 個規格，價格 ¥${extracted.priceJpy}。請列出該商品所有可選尺寸（XS/S/M/L/XL 等），每個尺寸的日幣價格填 ${extracted.priceJpy}。`
        : `\n已抽取到商品名「${extracted.productName}」、價格 ¥${extracted.priceJpy}。請列出所有可選尺寸。`;

      // 資料不夠 → 用 cheerio 取摘要給 AI
      const $ = cheerio.load(html);
      const ogTitle = $('meta[property="og:title"]').attr('content')?.trim() || $('title').text().trim();
      const ogDesc = $('meta[property="og:description"]').attr('content')?.trim()
        || $('meta[name="description"]').attr('content')?.trim();
      $('script, style, nav, footer, header').remove();
      const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 2000);

      return {
        prompt: `以下是商品網頁的內容，請從中辨識商品資訊：
網頁標題: ${ogTitle}
網頁描述: ${ogDesc || ''}
頁面內容: ${bodyText}${variantInfo}`,
        // 即使走 AI，也保留已抽到的圖片和品番
        directResult: extracted.imageUrl || productCode ? {
          ...extracted,
          priceJpy: 0, // 讓 POST handler 不走直接路徑
          productCode,
        } : undefined,
      };
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

    const partialHints = extracted
      ? `\n已從網頁抽取到：商品名「${extracted.productName}」${extracted.brand ? `、品牌「${extracted.brand}」` : ''}，請補充完整。`
      : '';

    return {
      prompt: `以下是商品網頁的內容，請從中辨識商品資訊：
網頁標題: ${ogTitle}
網頁描述: ${ogDesc || ''}
頁面內容: ${bodyText}${partialHints}`,
      directResult: extracted?.imageUrl || productCode ? {
        productName: extracted?.productName || '',
        priceJpy: 0,
        brand: extracted?.brand || '',
        description: extracted?.description || '',
        imageUrl: extracted?.imageUrl || null,
        variants: [],
        productCode,
      } : undefined,
    };
  } catch {
    return { prompt: buildUrlFallback(url, urlHints) };
  }
}

function buildUrlFallback(url: string, urlHints: string): string {
  return `使用者提供了一個日本購物網站的商品連結，但網頁無法直接存取（被防爬蟲機制擋住）。
請根據網址結構和你的知識，盡力辨識這個商品。

商品網址: ${url}
${urlHints}

請根據以上線索推測商品資訊。如果不太確定，confidence 填 medium 並在 description 中說明。`;
}

// 建立辨識用的 prompt
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

// 從 AI 回覆的原始物件中提取並補足必要欄位
function normalizeAiResponse(
  raw: Record<string, unknown>,
  exchangeRate: number,
  userUrl?: string,
  extractedImageUrl?: string | null,
  extractedProductCode?: string
): AiResponse {
  const variants = Array.isArray(raw.variants)
    ? raw.variants.map((v: any) => ({
        name: String(v.name || ""),
        price_jpy: Math.round(Number(v.price_jpy) || 0),
      }))
    : [];

  const selectedIndex = Math.min(
    Math.max(0, Number(raw.selected_variant_index) || 0),
    Math.max(0, variants.length - 1)
  );

  // 價格優先用選中品項的價格
  const priceJpy =
    variants[selectedIndex]?.price_jpy ||
    Math.round(Number(raw.estimated_price_jpy) || 0);
  const priceTwd =
    Math.round(Number(raw.estimated_price_twd) || 0) ||
    Math.round(priceJpy * exchangeRate);

  const rawConfidence = String(raw.confidence || "");
  const confidence = (
    ["high", "medium", "low"].includes(rawConfidence)
      ? rawConfidence
      : "medium"
  ) as AiResponse["confidence"];

  return {
    product_name_zh: String(raw.product_name_zh || "未知商品"),
    product_name_ja: String(raw.product_name_ja || ""),
    brand: String(raw.brand || ""),
    estimated_price_jpy: priceJpy,
    estimated_price_twd: priceTwd,
    where_to_buy: Array.isArray(raw.where_to_buy)
      ? raw.where_to_buy.map(String)
      : [],
    buy_url: userUrl || "",
    description: String(raw.description || ""),
    confidence,
    variants,
    selected_variant_index: selectedIndex,
    // 優先用已從 HTML 抽取的圖片，其次用 AI 回傳的（通常 AI 不填）
    product_image_url: extractedImageUrl || (raw.product_image_url ? String(raw.product_image_url) : undefined) || undefined,
    product_code: extractedProductCode || (raw.product_code ? String(raw.product_code) : undefined) || undefined,
  };
}

// 嘗試從字串中解析 JSON（含 markdown 清理與 regex fallback）
function tryParseJson(text: string): Record<string, unknown> | null {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // ignore
  }

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

// Gemini responseSchema — 強制結構化輸出
const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    product_name_zh: {
      type: SchemaType.STRING,
      description: "商品中文名稱（繁體中文）",
    },
    product_name_ja: {
      type: SchemaType.STRING,
      description: "商品日文名稱",
    },
    brand: { type: SchemaType.STRING, description: "品牌名稱" },
    estimated_price_jpy: {
      type: SchemaType.INTEGER,
      description: "selected_variant_index 對應品項的日幣價格",
    },
    estimated_price_twd: {
      type: SchemaType.INTEGER,
      description: "台幣估算（整數）",
    },
    where_to_buy: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "日本可購買店鋪",
    },
    description: {
      type: SchemaType.STRING,
      description: "商品描述（30字內，繁體中文）",
    },
    confidence: {
      type: SchemaType.STRING,
      description: "辨識信心度：high / medium / low",
    },
    variants: {
      type: SchemaType.ARRAY,
      description: "該商品所有常見品項/規格/容量，至少 1 個",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: {
            type: SchemaType.STRING,
            description: "品項名稱（如 18枚入、60mL、抹茶口味）",
          },
          price_jpy: {
            type: SchemaType.INTEGER,
            description: "該品項日幣價格",
          },
        },
        required: ["name", "price_jpy"],
      },
    },
    selected_variant_index: {
      type: SchemaType.INTEGER,
      description: "預設選中的品項索引（從 0 開始，選最符合使用者描述的）",
    },
    product_image_url: {
      type: SchemaType.STRING,
      description: "商品圖片 URL（選填，從網頁 og:image 或 JSON-LD 取得，AI 不須填寫）",
      nullable: true,
    },
    product_code: {
      type: SchemaType.STRING,
      description: "商品番号（選填，如 UNIQLO 的 471809）",
      nullable: true,
    },
  },
  required: [
    "product_name_zh",
    "product_name_ja",
    "brand",
    "estimated_price_jpy",
    "estimated_price_twd",
    "where_to_buy",
    "description",
    "confidence",
    "variants",
    "selected_variant_index",
  ],
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const inputText = formData.get("text") as string | null;
    const imageFile = formData.get("image") as File | null;

    if (!inputText && !imageFile) {
      return NextResponse.json(
        { error: "請提供文字、圖片或網址" },
        { status: 400 }
      );
    }

    // 偵測 URL 輸入 → server-side fetch 網頁內容
    let urlContent: string | undefined;
    let userUrl: string | undefined;
    let urlData: Awaited<ReturnType<typeof fetchUrlContent>> | undefined;

    if (inputText && isUrl(inputText)) {
      userUrl = inputText.trim();
      urlData = await fetchUrlContent(userUrl);
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
        // variants：用抽到的，若無則以商品名為單一 variant
        const variants = dr.variants.length > 0
          ? dr.variants
          : [{ name: dr.productName, price_jpy: dr.priceJpy }];

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
          variants,
          selected_variant_index: dr.selectedVariantIndex ?? 0,
          product_image_url: dr.imageUrl || undefined,
          product_code: dr.productCode,
        };

        return NextResponse.json({
          success: true,
          data: aiData,
          exchange_rate: exchangeRate,
        });
      }
    }

    // 取得匯率
    let exchangeRate = 0.2012;
    try {
      const rateRes = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/exchange-rate`
      );
      const rateData = await rateRes.json();
      exchangeRate = rateData.rate;
    } catch {
      // 用預設匯率
    }

    // Gemini 模型 + 結構化 schema
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

    // 圖片轉 base64
    let imagePart: {
      inlineData: { mimeType: string; data: string };
    } | null = null;
    if (imageFile) {
      const bytes = await imageFile.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      imagePart = {
        inlineData: {
          mimeType: imageFile.type || "image/jpeg",
          data: base64,
        },
      };
    }

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
      // 若有走 AI 路徑但之前已抽到圖片/品番，一起帶進去
      const aiData = normalizeAiResponse(
        raw,
        exchangeRate,
        userUrl,
        urlData?.directResult?.imageUrl,
        urlData?.directResult?.productCode,
      );
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
  } catch (error: unknown) {
    console.error("AI 辨識錯誤:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    const isQuota = errMsg.includes("429") || errMsg.includes("quota");
    if (isQuota) {
      return NextResponse.json(
        {
          success: false,
          error: "AI 額度已用完，請稍後再試（每日會重置）",
        },
        { status: 429 }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: "AI 辨識失敗，請稍後再試",
      },
      { status: 500 }
    );
  }
}
