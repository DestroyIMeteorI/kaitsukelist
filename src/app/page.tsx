"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// === 首頁：輸入名字進入 ===
// 白話：這是使用者打開網址看到的第一個畫面

export default function HomePage() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();

    if (!trimmed) {
      setError("請輸入你的名字");
      return;
    }

    if (trimmed.length > 20) {
      setError("名字最多 20 個字");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 把名字存到瀏覽器記憶體（localStorage）
      localStorage.setItem("userName", trimmed);
      // 跳轉到個人清單頁
      router.push("/list");
    } catch {
      setError("發生錯誤，請重試");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-12">
      {/* 櫻花裝飾背景 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden opacity-20">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-sakura-300"
            style={{
              width: `${20 + Math.random() * 40}px`,
              height: `${20 + Math.random() * 40}px`,
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              filter: "blur(8px)",
            }}
          />
        ))}
      </div>

      {/* Logo 區域 */}
      <div className="relative mb-8 text-center">
        <div className="mb-3 text-5xl">🌸</div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          買い付けリスト
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          日本代購清單 — AI 幫你找到想買的東西
        </p>
      </div>

      {/* 登入卡片 */}
      <div className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              你的名字
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              placeholder="輸入名字就能開始使用"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-base shadow-sm transition-all placeholder:text-gray-400 focus:border-sakura-400 focus:outline-none focus:ring-2 focus:ring-sakura-200"
              autoFocus
              autoComplete="name"
              maxLength={20}
            />
            {error && (
              <p className="mt-1.5 text-sm text-red-500">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full rounded-xl bg-sakura-500 px-4 py-3.5 text-base font-medium text-white shadow-md transition-all hover:bg-sakura-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="opacity-25"
                  />
                  <path
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    className="opacity-75"
                  />
                </svg>
                進入中...
              </span>
            ) : (
              "進入我的清單 →"
            )}
          </button>
        </form>

        {/* 管理員入口 */}
        <div className="mt-6 text-center">
          <button
            onClick={() => router.push("/admin")}
            className="text-sm text-gray-400 underline-offset-2 transition-colors hover:text-gray-600 hover:underline"
          >
            管理員入口
          </button>
        </div>

        {/* 說明 */}
        <div className="mt-8 rounded-xl border border-gray-100 bg-white/60 p-4 text-center">
          <p className="text-xs leading-relaxed text-gray-400">
            輸入名字後即可提交想代購的商品
            <br />
            支援文字輸入或拍照上傳，AI 自動辨識
            <br />
            <span className="text-sakura-400">
              🔒 只有你和代購者能看到你的清單
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
