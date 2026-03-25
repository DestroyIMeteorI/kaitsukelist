"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import type { Item } from "@/lib/types";
import { STATUS_MAP } from "@/lib/types";

export default function AdminPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | Item["status"]>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [error, setError] = useState("");
  const [hasExistingPassword, setHasExistingPassword] = useState(false);

  // 檢查是否已設定密碼
  useEffect(() => {
    setHasExistingPassword(!!localStorage.getItem("adminPassword"));
  }, []);

  // 驗證管理員密碼
  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const storedPwd = localStorage.getItem("adminPassword");
    if (storedPwd && password === storedPwd) {
      setAuthenticated(true);
      loadItems();
      return;
    }
    if (!storedPwd && password.length >= 4) {
      localStorage.setItem("adminPassword", password);
      setAuthenticated(true);
      loadItems();
      return;
    }
    setError(hasExistingPassword ? "密碼錯誤" : "請設定至少 4 位的管理密碼");
  }

  // 載入所有商品
  async function loadItems() {
    setLoading(true);
    try {
      const { getAllItems } = await import("@/lib/supabase");
      const data = await getAllItems();
      setItems(data || []);
    } catch (err) {
      console.error("載入失敗:", err);
    } finally {
      setLoading(false);
    }
  }

  // 更新狀態
  async function handleStatusChange(itemId: string, status: Item["status"]) {
    try {
      const { updateItemStatus } = await import("@/lib/supabase");
      await updateItemStatus(itemId, status);
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId ? { ...i, status, updated_at: new Date().toISOString() } : i
        )
      );
    } catch (err) {
      alert("更新失敗，請重試");
    }
  }

  // 刪除
  async function handleDelete(itemId: string) {
    try {
      const { deleteItem } = await import("@/lib/supabase");
      await deleteItem(itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err) {
      alert("刪除失敗，請重試");
    }
  }

  // 篩選後的結果
  const uniqueUsers = [...new Set(items.map((i) => i.user_name || "未知"))];

  const filtered = items.filter((item) => {
    if (filter !== "all" && item.status !== filter) return false;
    if (userFilter !== "all" && item.user_name !== userFilter) return false;
    return true;
  });

  // 統計數據
  const stats = {
    total: items.length,
    pending: items.filter((i) => i.status === "pending").length,
    bought: items.filter((i) => i.status === "bought").length,
    totalTwd: items.reduce(
      (sum, i) => sum + (i.ai_price_twd || 0) * (i.quantity || 1),
      0
    ),
  };

  // 未登入：顯示密碼輸入
  if (!authenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div className="w-full max-w-xs">
          <div className="mb-6 text-center">
            <div className="mb-2 text-4xl">🔐</div>
            <h1 className="text-xl font-bold text-gray-900">管理後台</h1>
            <p className="mt-1 text-sm text-gray-500">
              {hasExistingPassword
                ? "請輸入管理密碼"
                : "第一次使用，請設定管理密碼"}
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              placeholder="輸入密碼"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-lg tracking-widest shadow-sm focus:border-sakura-400 focus:outline-none focus:ring-2 focus:ring-sakura-200"
              autoFocus
            />
            {error && <p className="text-center text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.98]"
            >
              進入管理後台
            </button>
          </form>

          <button
            onClick={() => router.push("/")}
            className="mt-4 block w-full text-center text-sm text-gray-400 hover:text-gray-600"
          >
            ← 回首頁
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-8">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">🔐 管理後台</h1>
          <div className="flex gap-2">
            <button
              onClick={loadItems}
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-200"
            >
              🔄 重新整理
            </button>
          </div>
        </div>
      </header>

      <main className="space-y-4 px-4 pt-4">
        {/* 統計卡片 */}
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-xl bg-gray-50 p-2.5 text-center">
            <p className="text-xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-500">總商品</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-2.5 text-center">
            <p className="text-xl font-bold text-amber-600">{stats.pending}</p>
            <p className="text-xs text-gray-500">待處理</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-2.5 text-center">
            <p className="text-xl font-bold text-emerald-600">{stats.bought}</p>
            <p className="text-xs text-gray-500">已買到</p>
          </div>
          <div className="rounded-xl bg-sakura-50 p-2.5 text-center">
            <p className="text-xl font-bold text-sakura-600">
              ${(stats.totalTwd / 1000).toFixed(1)}k
            </p>
            <p className="text-xs text-gray-500">預估</p>
          </div>
        </div>

        {/* 篩選器 */}
        <div className="space-y-2">
          {/* 按人篩選 */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setUserFilter("all")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                userFilter === "all"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              全部人 ({items.length})
            </button>
            {uniqueUsers.map((name) => {
              const count = items.filter((i) => i.user_name === name).length;
              return (
                <button
                  key={name}
                  onClick={() => setUserFilter(name)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    userFilter === name
                      ? "bg-sakura-500 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {name} ({count})
                </button>
              );
            })}
          </div>

          {/* 按狀態篩選 */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilter("all")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === "all"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              全部
            </button>
            {(Object.keys(STATUS_MAP) as Item["status"][]).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === status
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {STATUS_MAP[status]} (
                {items.filter((i) => i.status === status).length})
              </button>
            ))}
          </div>
        </div>

        {/* 商品列表 */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="shimmer h-32 rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 py-12 text-center">
            <p className="text-3xl">📭</p>
            <p className="mt-2 text-sm text-gray-400">
              {items.length === 0
                ? "還沒有人提交商品"
                : "篩選條件下沒有商品"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                showUser
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
