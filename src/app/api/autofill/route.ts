import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// === AI 商品自動補齊 API ===
// 根據已知的商品資訊，讓 AI 補齊缺失欄位（名稱、品牌、重量、哪裡買等）

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

interface AutofillRequest {
  product_name?: string;
  product_name_ja?: string;
  brand?: string;
  price_jpy?: number;
  where_to_buy?: string[];
  weight_g?: number;
  description?: string;
  note?: string;
  product_url?: string;
}

// Gemini responseSchema — 補齊用，含 weight_g
const autofillSchema = {
  type: SchemaType.OBJECT,
  properties: {
    product_name_zh: {
      type: SchemaType.STRING,
      description: "商品中文名稱（繁體中文）",
    },
    product_name_ja: {
      type: SchemaType.STRING,
      description: "商品日文原名",
    },
    brand: {
      type: SchemaType.STRING,
      description: "品牌名稱",
    },
    estimated_price_jpy: {
      type: SchemaType.INTEGER,
      description: "日幣建議售價（整數）",
    },
    where_to_buy: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "日本可購買的實體店鋪名稱",
    },
    weight_g: {
      type: SchemaType.INTEGER,
      description: "商品單件淨重估算（克），含包裝的大約重量",
    },
    description: {
      type: SchemaType.STRING,
      description: "商品簡短描述（30字內，繁體中文）",
    },
  },
  required: [
    "product_name_zh",
    "product_name_ja",
    "brand",
    "estimated_price_jpy",
    "where_to_buy",
    "weight_g",
    "description",
  ],
};

function buildAutofillPrompt(item: AutofillRequest, exchangeRate: number): string {
  const knownParts: string[] = [];
  if (item.product_name) knownParts.push(`中文名稱：${item.product_name}`);
  if (item.product_name_ja) knownParts.push(`日文名稱：${item.product_name_ja}`);
  if (item.brand) knownParts.push(`品牌：${item.brand}`);
  if (item.price_jpy) knownParts.push(`日幣價格：¥${item.price_jpy}`);
  if (item.where_to_buy?.length) knownParts.push(`購買地點：${item.where_to_buy.join("、")}`);
  if (item.weight_g) knownParts.push(`重量：${item.weight_g}g`);
  if (item.description) knownParts.push(`描述：${item.description}`);
  if (item.note) knownParts.push(`使用者備註：${item.note}`);
  if (item.product_url) knownParts.push(`商品連結：${item.product_url}`);

  const knownInfo = knownParts.length > 0
    ? knownParts.join("\n")
    : "（無已知資訊）";

  return `你是一個專業的日本代購助手。以下是一個已加入代購清單的商品，部分欄位可能是空的。
請根據已知資訊，運用你對日本商品的知識，盡量補齊所有欄位。

目前日幣兌台幣匯率：1 JPY ≈ ${exchangeRate} TWD

已知商品資訊：
${knownInfo}

規則：
- product_name_zh：繁體中文商品名稱（台灣用語），要具體（含品牌 + 品名 + 主要規格）
- product_name_ja：日文原名（片假名/平假名/漢字皆可）
- brand：品牌名稱（用最常見的寫法）
- estimated_price_jpy：日幣建議售價，如果已知就沿用
- where_to_buy：日本實體可購買的店鋪（如「松本清」「唐吉訶德」「BicCamera」「7-ELEVEN」等），至少列 2-3 間
- weight_g：商品單件含包裝的預估重量（克），用於行李重量計算。請根據商品類型合理估算：
  - 零食糖果通常 50-300g
  - 藥品保健品通常 50-200g
  - 化妝品保養品通常 100-500g
  - 電子產品通常 200-2000g
  - 衣物通常 200-800g
- description：30 字內的繁體中文簡短描述

請盡力填寫所有欄位。如果某個欄位完全無法推測，仍要給出最合理的猜測。`;
}

export async function POST(req: NextRequest) {
  try {
    const body: AutofillRequest = await req.json();

    // 至少要有一個可辨識的欄位
    const hasContext = body.product_name || body.product_name_ja || body.brand || body.note || body.product_url;
    if (!hasContext) {
      return NextResponse.json(
        { success: false, error: "商品資訊不足，無法 AI 補齊" },
        { status: 400 }
      );
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

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        responseSchema: autofillSchema as any,
      },
    });

    const prompt = buildAutofillPrompt(body, exchangeRate);

    // 最多嘗試 2 次（與 identify route 一致）
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(responseText);
        } catch {
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              parsed = JSON.parse(jsonMatch[0]);
            } catch {
              // ignore
            }
          }
        }

        if (!parsed) {
          if (attempt === 1) {
            console.warn("AI 補齊第一次回覆解析失敗，正在重試。原始回覆：", responseText.slice(0, 200));
            continue;
          }
          return NextResponse.json({
            success: false,
            error: "AI 回覆格式異常，請重試",
          });
        }

        // 正規化回傳資料
        const data = {
          product_name_zh: String(parsed.product_name_zh || ""),
          product_name_ja: String(parsed.product_name_ja || ""),
          brand: String(parsed.brand || ""),
          estimated_price_jpy: Math.round(Number(parsed.estimated_price_jpy) || 0),
          where_to_buy: Array.isArray(parsed.where_to_buy)
            ? parsed.where_to_buy.map(String)
            : [],
          weight_g: Math.round(Number(parsed.weight_g) || 0),
          description: String(parsed.description || ""),
        };

        return NextResponse.json({
          success: true,
          data,
          exchange_rate: exchangeRate,
        });
      } catch (err: unknown) {
        lastError = err;
        if (attempt === 1) {
          console.warn("AI 補齊第一次呼叫失敗，正在重試:", err instanceof Error ? err.message : err);
          continue;
        }
      }
    }

    const errMsg = lastError instanceof Error ? lastError.message : String(lastError);
    const isQuota = errMsg.includes("429") || errMsg.includes("quota");
    console.error("AI 補齊錯誤（重試後仍失敗）:", lastError);
    return NextResponse.json(
      { success: false, error: isQuota ? "AI 額度已用完，請稍後再試（每日會重置）" : "AI 補齊失敗，請稍後再試" },
      { status: isQuota ? 429 : 500 }
    );
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const isQuota = errMsg.includes("429") || errMsg.includes("quota");
    console.error("AI 補齊錯誤:", error);
    return NextResponse.json(
      { success: false, error: isQuota ? "AI 額度已用完，請稍後再試（每日會重置）" : "AI 補齊失敗，請稍後再試" },
      { status: isQuota ? 429 : 500 }
    );
  }
}
