import { NextResponse } from "next/server";

// === Health Check API ===
// 給 UptimeRobot 等監控服務 ping 用的端點
// 同時也能防止 Supabase free tier 因 7 天無活動而暫停

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
