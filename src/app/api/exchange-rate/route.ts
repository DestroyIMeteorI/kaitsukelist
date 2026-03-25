import { NextResponse } from "next/server";

// === 匯率 API ===
// 白話：這個程式會去網路上查「現在 1 日幣等於多少台幣」

// 快取匯率，避免太頻繁查詢
let cachedRate: { rate: number; updated_at: string } | null = null;
let lastFetch = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 小時

export async function GET() {
  const now = Date.now();

  // 如果快取還新鮮（1 小時內），直接回傳
  if (cachedRate && now - lastFetch < CACHE_DURATION) {
    return NextResponse.json(cachedRate);
  }

  try {
    // 用免費 API 查詢匯率
    const res = await fetch(
      "https://api.exchangerate-api.com/v4/latest/JPY"
    );
    const data = await res.json();

    const rate = data.rates?.TWD;
    if (!rate) throw new Error("找不到 TWD 匯率");

    cachedRate = {
      rate: Math.round(rate * 10000) / 10000, // 保留 4 位小數
      updated_at: new Date().toISOString(),
    };
    lastFetch = now;

    return NextResponse.json(cachedRate);
  } catch (error) {
    // 如果查詢失敗但有舊的快取，就用舊的
    if (cachedRate) {
      return NextResponse.json(cachedRate);
    }

    // 完全沒有快取的話，用預設值
    return NextResponse.json({
      rate: 0.2012, // 2026/03/25 的匯率作為備案
      updated_at: "2026-03-25T00:00:00Z",
    });
  }
}
