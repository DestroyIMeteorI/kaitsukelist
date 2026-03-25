import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AiResponse } from "@/lib/types";

// === AI 商品辨識 API ===
// 白話：使用者傳文字或圖片過來，這裡會叫 Gemini AI 去辨識是什麼商品

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// 建立辨識用的 prompt
function buildPrompt(inputText: string | null, exchangeRate: number) {
  const base = `你是一個專業的日本代購助手。你的任務是辨識商品並提供完整的購買資訊。

目前日幣兌台幣匯率：1 JPY ≈ ${exchangeRate} TWD

請嚴格按照以下 JSON 格式回覆，不要加入任何其他文字或 markdown 標記：
{
  "product_name_zh": "商品中文名稱（繁體中文）",
  "product_name_ja": "商品日文名稱",
  "brand": "品牌名稱",
  "estimated_price_jpy": 0,
  "estimated_price_twd": 0,
  "where_to_buy": ["店名1", "店名2"],
  "buy_url": "日本購物網站連結",
  "description": "簡短商品描述（30字內，繁體中文）",
  "confidence": "high"
}

重要規則：
- estimated_price_jpy：填日本當地零售價（數字，不含稅）
- estimated_price_twd：填 estimated_price_jpy × ${exchangeRate} 四捨五入到整數
- where_to_buy：列出日本實體店鋪名（如「松本清」「唐吉訶德」「BicCamera」等）
- buy_url：優先提供 Amazon.co.jp 或日本樂天的商品連結
- confidence：確定就填 high，有點不確定填 medium，很不確定填 low
- 所有中文必須使用繁體中文（台灣用語）
- 只回覆 JSON，不要有其他文字`;

  if (inputText) {
    return `${base}\n\n使用者想買的商品：「${inputText}」\n\n請使用 Google Search 搜尋確認商品資訊、價格和購買連結。`;
  }

  return `${base}\n\n使用者上傳了一張商品圖片，請仔細觀察圖片中的：
- 商品名稱文字（中文/日文/英文）
- 品牌 Logo
- 包裝特徵和顏色
- 產品規格

請辨識這個商品，並使用 Google Search 搜尋確認商品資訊、價格和購買連結。
如果圖片模糊或無法辨識，confidence 填 low。`;
}

// 僅在失敗重試時使用，去掉所有多餘說明，只要純 JSON
function buildRetryPrompt(inputText: string | null, exchangeRate: number) {
  return `只輸出一個 JSON 物件，不含任何說明文字。格式如下：
{"product_name_zh":"","product_name_ja":"","brand":"","estimated_price_jpy":0,"estimated_price_twd":0,"where_to_buy":[],"buy_url":"","description":"","confidence":"medium"}

匯率：1 JPY = ${exchangeRate} TWD
${inputText ? `商品：${inputText}` : "請辨識圖片中的商品"}`;
}

// 從 AI 回覆的原始物件中提取並補足必要欄位，避免前端因缺欄位崩潰
function normalizeAiResponse(raw: Record<string, unknown>, exchangeRate: number): AiResponse {
  const priceJpy = Number(raw.estimated_price_jpy) || 0;
  const priceTwd = Number(raw.estimated_price_twd) || Math.round(priceJpy * exchangeRate);
  const rawConfidence = String(raw.confidence || "");
  const confidence = (["high", "medium", "low"].includes(rawConfidence)
    ? rawConfidence
    : "medium") as AiResponse["confidence"];

  return {
    product_name_zh: String(raw.product_name_zh || raw.name || "未知商品"),
    product_name_ja: String(raw.product_name_ja || ""),
    brand: String(raw.brand || ""),
    estimated_price_jpy: priceJpy,
    estimated_price_twd: priceTwd,
    where_to_buy: Array.isArray(raw.where_to_buy) ? raw.where_to_buy.map(String) : [],
    buy_url: String(raw.buy_url || ""),
    description: String(raw.description || ""),
    confidence,
  };
}

// 嘗試從字串中解析 JSON（含 markdown 清理與 regex fallback）
function tryParseJson(text: string): Record<string, unknown> | null {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // 先嘗試直接解析
  try {
    return JSON.parse(cleaned);
  } catch {
    // ignore
  }

  // 找第一個 {...} 區塊
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const inputText = formData.get("text") as string | null;
    const imageFile = formData.get("image") as File | null;

    if (!inputText && !imageFile) {
      return NextResponse.json(
        { error: "請提供文字或圖片" },
        { status: 400 }
      );
    }

    // 先取得匯率
    let exchangeRate = 0.2012; // 預設值
    try {
      const rateRes = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/exchange-rate`
      );
      const rateData = await rateRes.json();
      exchangeRate = rateData.rate;
    } catch {
      // 用預設匯率
    }

    // 選擇 Gemini 模型
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.3, // 低溫度 = 更精確、較少創意
        maxOutputTokens: 1024,
        responseMimeType: "application/json", // 強制回傳純 JSON，避免 AI 加入多餘說明文字
      },
    });

    // 把圖片轉 base64（如有）
    let imagePart: { inlineData: { mimeType: string; data: string } } | null = null;
    if (imageFile) {
      const bytes = await imageFile.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      imagePart = { inlineData: { mimeType: imageFile.type || "image/jpeg", data: base64 } };
    }

    // 呼叫 Gemini，最多嘗試 2 次
    for (let attempt = 1; attempt <= 2; attempt++) {
      const prompt =
        attempt === 1
          ? buildPrompt(inputText, exchangeRate)
          : buildRetryPrompt(inputText, exchangeRate);

      const contents = imagePart ? [prompt, imagePart] : [prompt];
      const result = await model.generateContent(contents);
      const responseText = result.response.text();

      const raw = tryParseJson(responseText);

      if (raw) {
        const aiData = normalizeAiResponse(raw, exchangeRate);
        return NextResponse.json({
          success: true,
          data: aiData,
          exchange_rate: exchangeRate,
        });
      }

      // 第一次失敗：記錄 log 後繼續重試
      if (attempt === 1) {
        console.warn("AI 第一次回覆解析失敗，正在重試。原始回覆：", responseText.slice(0, 200));
      }
    }

    // 兩次都失敗
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
