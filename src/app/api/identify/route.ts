import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { AiResponse } from "@/lib/types";

// === AI 商品辨識 API ===

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// 偵測輸入是否為 URL
function isUrl(text: string): boolean {
  return /^https?:\/\//i.test(text.trim());
}

// 從 URL 路徑抽取有用的線索（店鋪名、商品 ID、路徑關鍵字）
function extractUrlHints(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const pathParts = u.pathname.split("/").filter(Boolean);

    // 識別平台
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
      // Amazon URL 通常第一段是商品名（URL-encoded 日文）
      if (pathParts[0] && pathParts[0] !== "dp" && pathParts[0] !== "gp") {
        hints += `商品名: ${decodeURIComponent(pathParts[0]).replace(/-/g, " ")}\n`;
      }
    } else if (host.includes("yahoo.co.jp")) {
      platform = "Yahoo! ショッピング";
    } else {
      platform = host;
    }

    return `平台: ${platform}\n${hints}`.trim();
  } catch {
    return "";
  }
}

// 從網頁抓取商品資訊（server-side fetch），抓不到則用 URL 線索
async function fetchUrlContent(url: string): Promise<string> {
  const urlHints = extractUrlHints(url);

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
      return buildUrlFallback(url, urlHints);
    }

    const html = await res.text();

    // 抽取 OG / meta 資訊
    const title =
      html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || "";
    const ogTitle =
      html.match(
        /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i
      )?.[1] || "";
    const ogDesc =
      html.match(
        /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i
      )?.[1] || "";
    const metaDesc =
      html.match(
        /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i
      )?.[1] || "";

    // 抽取頁面文字
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyText = bodyMatch
      ? bodyMatch[1]
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 3000)
      : "";

    // 如果內容太少（被 bot 擋住），使用 URL 線索 fallback
    const usefulContent = (ogTitle || title || "").length + bodyText.length;
    if (usefulContent < 100) {
      return buildUrlFallback(url, urlHints);
    }

    return `以下是商品網頁的內容，請從中辨識商品資訊：
網頁標題: ${ogTitle || title}
網頁描述: ${ogDesc || metaDesc}
頁面內容: ${bodyText}`;
  } catch {
    return buildUrlFallback(url, urlHints);
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

回覆格式由 schema 控制，你只需填入正確的值。

規則：
- product_name_zh / description：使用繁體中文（台灣用語）
- estimated_price_jpy：填 selected_variant_index 對應品項的日幣價格
- estimated_price_twd：estimated_price_jpy × ${exchangeRate} 四捨五入到整數
- where_to_buy：日本實體店鋪（如「松本清」「唐吉訶德」「BicCamera」）
- confidence：確定 high、有點不確定 medium、很不確定 low
- variants：列出該商品所有常見的品項/規格/容量/數量/口味，每個品項附上名稱和日幣價格。至少列出 1 個品項，如果確實只有一種規格就填 1 個。
- selected_variant_index：預設選中最符合使用者描述的品項索引（從 0 開始）`;

  if (urlContent) {
    return `${base}\n\n${urlContent}`;
  }

  if (inputText) {
    return `${base}\n\n使用者想買的商品：「${inputText}」`;
  }

  return `${base}\n\n使用者上傳了一張商品圖片，請辨識圖片中的商品（注意名稱文字、品牌 Logo、包裝特徵）。如果圖片模糊或無法辨識，confidence 填 low。`;
}

// 僅在失敗重試時使用的精簡 prompt
function buildRetryPrompt(
  inputText: string | null,
  exchangeRate: number,
  urlContent?: string
) {
  const context = urlContent
    ? urlContent.slice(0, 500)
    : inputText
      ? `商品：${inputText}`
      : "請辨識圖片中的商品。";
  return `辨識以下日本商品，匯率 1 JPY = ${exchangeRate} TWD。列出所有品項規格到 variants 陣列。${context}`;
}

// 從 AI 回覆的原始物件中提取並補足必要欄位
function normalizeAiResponse(
  raw: Record<string, unknown>,
  exchangeRate: number,
  userUrl?: string
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
    if (inputText && isUrl(inputText)) {
      userUrl = inputText.trim();
      urlContent = await fetchUrlContent(userUrl);
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
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: responseSchema as any,
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

    // 呼叫 Gemini，最多嘗試 2 次
    for (let attempt = 1; attempt <= 2; attempt++) {
      const prompt =
        attempt === 1
          ? buildPrompt(urlContent ? null : inputText, exchangeRate, urlContent)
          : buildRetryPrompt(
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

      if (attempt === 1) {
        console.warn(
          "AI 第一次回覆解析失敗，正在重試。原始回覆：",
          responseText.slice(0, 200)
        );
      }
    }

    return NextResponse.json({
      success: false,
      error: "AI 回覆格式異常，請重試",
    });
  } catch (error: any) {
    console.error("AI 辨識錯誤:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "AI 辨識失敗，請稍後再試",
      },
      { status: 500 }
    );
  }
}
