"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// === 首頁：名字 + PIN 兩步驟登入 ===
// 防止同名使用者共用清單

type PinMode = "set" | "enter" | "set_existing";

// 用瀏覽器內建 Web Crypto 做 SHA-256 雜湊
async function hashPin(name: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`${name}:${pin}`);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function HomePage() {
  const router = useRouter();
  const [step, setStep] = useState<"name" | "pin">("name");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [pinMode, setPinMode] = useState<PinMode>("set");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPin, setShowPin] = useState(false);

  // 步驟 1：送出名字，查詢是否已存在
  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError("請輸入你的名字"); return; }
    if (trimmed.length > 20) { setError("名字最多 20 個字"); return; }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check", name: trimmed }),
      });
      const data = await res.json();

      if (!data.exists) {
        setPinMode("set");
      } else if (data.hasPin) {
        setPinMode("enter");
      } else {
        setPinMode("set_existing");
      }
      setStep("pin");
    } catch {
      setError("網路錯誤，請重試");
    } finally {
      setLoading(false);
    }
  }

  // 步驟 2：送出 PIN
  async function handlePinSubmit(pinValue: string) {
    if (pinValue.length !== 4 || !/^\d{4}$/.test(pinValue)) return;

    setLoading(true);
    setError("");
    try {
      const pinHash = await hashPin(name.trim(), pinValue);
      const action = pinMode === "enter" ? "login" : pinMode === "set" ? "register" : "set_pin";

      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, name: name.trim(), pinHash }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "驗證失敗，請重試");
        setPin("");
        return;
      }

      localStorage.setItem("userName", name.trim());
      router.push("/list");
    } catch {
      setError("網路錯誤，請重試");
    } finally {
      setLoading(false);
    }
  }

  // PIN 輸入改變時，若已達 4 位則自動送出
  function handlePinChange(value: string) {
    const cleaned = value.replace(/\D/g, "").slice(0, 4);
    setPin(cleaned);
    setError("");
    if (cleaned.length === 4) {
      handlePinSubmit(cleaned);
    }
  }

  const pinLabels: Record<PinMode, { title: string; desc: string }> = {
    set: {
      title: "設定你的 PIN 碼",
      desc: "首次使用，請設定 4 位數字 PIN，下次在其他裝置登入時需要輸入",
    },
    enter: {
      title: `歡迎回來，${name}！`,
      desc: "請輸入你的 4 位數字 PIN 碼",
    },
    set_existing: {
      title: "保護你的帳號",
      desc: `「${name}」這個名字已有人使用。如果這是你，請設定 PIN 碼來綁定帳號；若不是，請返回換個名字。`,
    },
  };

  // 靜態裝飾圓形（避免 SSR/CSR hydration mismatch）
  const decorCircles = [
    { w: 33, h: 33, top: 17, left: 23 },
    { w: 46, h: 46, top: 34, left: 46 },
    { w: 26, h: 26, top: 51, left: 69 },
    { w: 59, h: 59, top: 68, left: 15 },
    { w: 38, h: 38, top: 85, left: 61 },
    { w: 52, h: 52, top:  8, left: 80 },
  ];

  return (
    <div className="min-h-dvh-safe">
      {/* 櫻花裝飾背景 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden opacity-20">
        {decorCircles.map((circle, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-sakura-300"
            style={{
              width: `${circle.w}px`,
              height: `${circle.h}px`,
              top: `${circle.top}%`,
              left: `${circle.left}%`,
              filter: "blur(8px)",
            }}
          />
        ))}
      </div>

      {/* 桌面：兩欄；手機：單欄置中 */}
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col items-center justify-center px-6 py-12 md:flex-row md:gap-16">

        {/* 左欄：Logo + 說明（桌面顯示完整說明）*/}
        <div className="mb-8 text-center md:mb-0 md:flex-1 md:text-left">
          <div className="mb-3 text-5xl">🌸</div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
            買い付けリスト
          </h1>
          <p className="mt-2 text-sm text-gray-500 md:text-base">
            日本代購清單 — AI 幫你找到想買的東西
          </p>

          {/* 桌面才顯示的功能說明 */}
          <div className="mt-6 hidden space-y-3 md:block">
            {[
              { icon: "✨", text: "輸入文字或拍照，AI 自動辨識商品" },
              { icon: "💴", text: "即時日幣 → 台幣換算" },
              { icon: "🔒", text: "PIN 碼保護你的清單不被冒用" },
              { icon: "📦", text: "追蹤購買狀態與行李重量" },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm text-gray-600">
                <span className="text-lg">{icon}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 右欄：表單區 */}
        <div className="w-full max-w-sm md:flex-none">
          {/* 步驟指示器 */}
          <div className="mb-6 flex items-center justify-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
              step === "name" ? "bg-sakura-500 text-white shadow-md" : "bg-sakura-200 text-sakura-700"
            }`}>
              {step === "pin" ? "✓" : "1"}
            </div>
            <div className={`h-0.5 w-8 rounded-full transition-all ${step === "pin" ? "bg-sakura-400" : "bg-gray-200"}`} />
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
              step === "pin" ? "bg-sakura-500 text-white shadow-md" : "bg-gray-100 text-gray-400"
            }`}>
              2
            </div>
          </div>

          {/* 步驟 1：輸入名字 */}
          {step === "name" && (
            <form onSubmit={handleNameSubmit} className="animate-fade-in space-y-4">
              <div>
                <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-gray-700">
                  你的名字
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(""); }}
                  placeholder="輸入名字就能開始使用"
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-base shadow-sm transition-all placeholder:text-gray-400 focus:border-sakura-400 focus:outline-none focus:ring-2 focus:ring-sakura-200"
                  autoFocus
                  autoComplete="name"
                  maxLength={20}
                />
                {error && <p className="mt-1.5 text-sm text-red-500">{error}</p>}
              </div>
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="w-full rounded-xl bg-sakura-500 px-4 py-3.5 text-base font-medium text-white shadow-md transition-all hover:bg-sakura-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "查詢中..." : "繼續 →"}
              </button>
            </form>
          )}

          {/* 步驟 2：設定或輸入 PIN */}
          {step === "pin" && (
            <div className="animate-fade-in space-y-4">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h2 className="mb-1 text-lg font-bold text-gray-900">
                  {pinLabels[pinMode].title}
                </h2>
                <p className="mb-4 text-sm text-gray-500">
                  {pinLabels[pinMode].desc}
                </p>

                {/* PIN 輸入框 + 眼睛圖示 */}
                <div className="relative">
                  <input
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    pattern="\d{4}"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => handlePinChange(e.target.value)}
                    placeholder="• • • •"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 text-center text-2xl tracking-[0.5em] shadow-sm focus:border-sakura-400 focus:outline-none focus:ring-2 focus:ring-sakura-200"
                    autoFocus
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                    aria-label={showPin ? "隱藏 PIN" : "顯示 PIN"}
                  >
                    {showPin ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>

                {loading && (
                  <p className="mt-2 text-center text-xs text-sakura-500">驗證中...</p>
                )}
                {error && <p className="mt-2 text-center text-sm text-red-500">{error}</p>}
              </div>

              <button
                type="button"
                onClick={() => { setStep("name"); setPin(""); setError(""); setShowPin(false); }}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-600"
              >
                ← 重新輸入名字
              </button>
            </div>
          )}

          {/* 管理員入口 */}
          <div className="mt-6 text-center">
            <button
              onClick={() => router.push("/admin")}
              className="text-sm text-gray-400 underline-offset-2 transition-colors hover:text-gray-600 hover:underline"
            >
              管理員入口
            </button>
          </div>

          {/* 手機版說明（桌面隱藏） */}
          <div className="mt-6 rounded-xl border border-gray-100 bg-white/60 p-4 text-center md:hidden">
            <p className="text-xs leading-relaxed text-gray-400">
              輸入名字 + 4 位 PIN 即可使用
              <br />
              支援文字輸入或拍照上傳，AI 自動辨識
              <br />
              <span className="text-sakura-400">
                🔒 PIN 碼保護你的清單不被冒用
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
