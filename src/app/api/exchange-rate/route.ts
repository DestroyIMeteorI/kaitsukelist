import { NextResponse } from "next/server";

// === 匯率 API ===
// 白話：這個程式會去網路上查「現在 1 日幣等於多少台幣」

// Next.js App Router 原生快取：1 小時重新驗證一次
// Vercel Edge Network 會快取回應，不需要每次都跑 serverless function
export const revalidate = 3600;

export async function GET() {
  try {
    const res = await fetch(
      "https://api.exchangerate-api.com/v4/latest/JPY",
      // next: { revalidate } 讓 Next.js 在 fetch 層快取外部 API 回應
      { next: { revalidate: 3600 } }
    );
    const data = await res.json();

    const rate = data.rates?.TWD;
    if (!rate) throw new Error("找不到 TWD 匯率");

    const result = {
      rate: Math.round(rate * 10000) / 10000, // 保留 4 位小數
      updated_at: new Date().toISOString(),
    };

    return NextResponse.json(result, {
      headers: {
        // 讓 Vercel CDN / 瀏覽器快取 1 小時
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
      },
    });
  } catch {
    // 查詢失敗時回傳預設值
    return NextResponse.json(
      { rate: 0.2012, updated_at: "2026-03-25T00:00:00Z" },
      { headers: { "Cache-Control": "public, s-maxage=300" } } // 失敗時只快取 5 分鐘
    );
  }
}
