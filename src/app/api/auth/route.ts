import { NextRequest, NextResponse } from "next/server";
import { getUserByName, createUserWithPin, setUserPin } from "@/lib/supabase";

// === PIN 認證 API ===
// 白話：處理使用者名稱 + 4碼 PIN 的登入/註冊流程
// 客戶端已用 SHA-256 雜湊 PIN，這裡只做字串比對，不做額外加密

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, name, pinHash } = body as {
      action: "check" | "login" | "register" | "set_pin";
      name?: string;
      pinHash?: string;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: "名字不能是空的" }, { status: 400 });
    }

    const trimmedName = name.trim();

    // action: check — 查詢名字是否存在及是否有 PIN
    if (action === "check") {
      const user = await getUserByName(trimmedName);
      if (!user) {
        return NextResponse.json({ exists: false });
      }
      return NextResponse.json({
        exists: true,
        hasPin: !!user.pin_hash,
      });
    }

    // 以下 action 都需要 pinHash
    if (!pinHash) {
      return NextResponse.json({ error: "請提供 PIN" }, { status: 400 });
    }

    // action: register — 新使用者，建立帳號並設定 PIN
    if (action === "register") {
      const existing = await getUserByName(trimmedName);
      if (existing) {
        return NextResponse.json({ error: "名字已被使用" }, { status: 409 });
      }
      const user = await createUserWithPin(trimmedName, pinHash);
      return NextResponse.json({ success: true, user });
    }

    // action: login — 既有使用者，驗證 PIN
    if (action === "login") {
      const user = await getUserByName(trimmedName);
      if (!user) {
        return NextResponse.json({ error: "找不到此使用者" }, { status: 404 });
      }
      if (user.pin_hash !== pinHash) {
        return NextResponse.json({ error: "PIN 碼錯誤" }, { status: 401 });
      }
      const { pin_hash: _, ...safeUser } = user;
      return NextResponse.json({ success: true, user: safeUser });
    }

    // action: set_pin — 既有使用者（舊帳號無 PIN）首次設定 PIN
    if (action === "set_pin") {
      const user = await getUserByName(trimmedName);
      if (!user) {
        return NextResponse.json({ error: "找不到此使用者" }, { status: 404 });
      }
      await setUserPin(user.id, pinHash);
      const { pin_hash: _, ...safeUser } = user;
      return NextResponse.json({ success: true, user: safeUser });
    }

    return NextResponse.json({ error: "無效的 action" }, { status: 400 });
  } catch (error: any) {
    console.error("PIN 認證錯誤:", error);
    return NextResponse.json({ error: error.message || "伺服器錯誤" }, { status: 500 });
  }
}
