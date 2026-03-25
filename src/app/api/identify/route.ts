import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
      },
    });

    const prompt = buildPrompt(inputText, exchangeRate);

    // 根據有沒有圖片，用不同的方式呼叫 AI
    let result;

    if (imageFile) {
      // 有圖片：把圖片轉成 base64 送給 AI
      const bytes = await imageFile.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      const mimeType = imageFile.type || "image/jpeg";

      result = await model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType,
            data: base64,
          },
        },
      ]);
    } else {
      // 純文字
      result = await model.generateContent(prompt);
    }

    const responseText = result.response.text();

    // 嘗試解析 AI 回覆的 JSON
    let aiData;
    try {
      // 清理可能的 markdown 包裹
      const cleaned = responseText
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      aiData = JSON.parse(cleaned);
    } catch {
      // 如果 JSON 解析失敗，回傳原始文字讓前端處理
      return NextResponse.json({
        success: false,
        raw_response: responseText,
        error: "AI 回覆格式異常，請重試",
      });
    }

    return NextResponse.json({
      success: true,
      data: aiData,
      exchange_rate: exchangeRate,
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
