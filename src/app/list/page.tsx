"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import SubmitForm from "@/components/SubmitForm";
import AiResultCard from "@/components/AiResultCard";
import ProductCard from "@/components/ProductCard";
import OfflineBanner from "@/components/OfflineBanner";
import Toast, { useToast } from "@/components/Toast";
import type { AiResponse, Item, User, ExchangeRate, EditableItemFields } from "@/lib/types";

const CACHE_KEY_PREFIX = "kaitsuke_items_";

type SortKey = "newest" | "oldest" | "price_high" | "price_low";

export default function ListPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const { toasts, show: showToast, dismiss: dismissToast } = useToast();

  const [pendingResult, setPendingResult] = useState<{
    data: AiResponse;
    exchangeRate: number;
    inputText?: string;
    imageUrl?: string;
  } | null>(null);

  // 監聽網路狀態
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // 初始化
  useEffect(() => {
    async function init() {
      const name = localStorage.getItem("userName");
      if (!name) { router.push("/"); return; }

      const cacheKey = `${CACHE_KEY_PREFIX}${name}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as { user: User; items: Item[] };
          setUser(parsed.user);
          setItems(parsed.items);
        } catch { /* 忽略損壞的快取 */ }
      }

      try {
        const { getUserByName, getUserItems } = await import("@/lib/supabase");
        const found = await getUserByName(name);
        if (!found) {
          localStorage.removeItem("userName");
          router.push("/");
          return;
        }
        const userData: User = { id: found.id, name: found.name, role: found.role, created_at: found.created_at };
        setUser(userData);
        const freshItems = await getUserItems(userData.id) || [];
        setItems(freshItems);
        localStorage.setItem(cacheKey, JSON.stringify({ user: userData, items: freshItems }));
      } catch (err) {
        console.error("初始化失敗（使用快取）:", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router]);

  // 載入匯率
  useEffect(() => {
    fetch("/api/exchange-rate").then((r) => r.json()).then(setExchangeRate).catch(() => {});
  }, []);

  // 搜尋 + 排序後的清單
  const filteredItems = useMemo(() => {
    let result = items;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((item) =>
        (item.ai_product_name || "").toLowerCase().includes(q) ||
        (item.ai_product_name_ja || "").toLowerCase().includes(q) ||
        (item.ai_brand || "").toLowerCase().includes(q) ||
        (item.input_text || "").toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => {
      if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "price_high") return ((b.ai_price_twd || 0) * b.quantity) - ((a.ai_price_twd || 0) * a.quantity);
      if (sortBy === "price_low") return ((a.ai_price_twd || 0) * a.quantity) - ((b.ai_price_twd || 0) * b.quantity);
      return 0;
    });
  }, [items, searchQuery, sortBy]);

  const handleAiResult = useCallback(
    (data: AiResponse, rate: number, inputText?: string, imageUrl?: string) => {
      setPendingResult({ data, exchangeRate: rate, inputText, imageUrl });
    }, []
  );

  async function handleConfirmAdd(data: AiResponse, quantity: number, weight?: number) {
    if (!user || !pendingResult) return;
    try {
      const { addItem } = await import("@/lib/supabase");
      const newItem = await addItem({
        user_id: user.id,
        input_text: pendingResult.inputText || null,
        input_image_url: pendingResult.imageUrl || null,
        ai_product_name: data.product_name_zh,
        ai_product_name_ja: data.product_name_ja,
        ai_brand: data.brand,
        ai_price_jpy: data.estimated_price_jpy,
        ai_price_twd: data.estimated_price_twd,
        ai_exchange_rate: pendingResult.exchangeRate,
        ai_where_to_buy: data.where_to_buy,
        ai_product_url: data.buy_url,
        ai_description: data.description,
        ai_confidence: data.confidence,
        ai_summary: JSON.stringify(data),
        quantity,
        weight_g: weight ?? null,
      });
      const updatedItems = [newItem, ...items];
      setItems(updatedItems);
      setPendingResult(null);
      showToast("已加入清單！", "success");
      if (user) {
        const name = localStorage.getItem("userName") || "";
        localStorage.setItem(`${CACHE_KEY_PREFIX}${name}`, JSON.stringify({ user, items: updatedItems }));
      }
    } catch (err) {
      console.error("加入清單失敗:", err);
      showToast("加入清單失敗，請重試", "error");
    }
  }

  async function handleItemEdit(itemId: string, fields: EditableItemFields) {
    try {
      const { updateItem } = await import("@/lib/supabase");
      await updateItem(itemId, fields);
      const updatedItems = items.map((i) =>
        i.id === itemId ? { ...i, ...fields, updated_at: new Date().toISOString() } : i
      );
      setItems(updatedItems);
      if (user) {
        const name = localStorage.getItem("userName") || "";
        localStorage.setItem(`${CACHE_KEY_PREFIX}${name}`, JSON.stringify({ user, items: updatedItems }));
      }
      showToast("已儲存變更", "success");
    } catch (err) {
      console.error("更新失敗:", err);
      showToast("更新失敗，請重試", "error");
    }
  }

  async function handleDelete(itemId: string) {
    try {
      const { deleteItem } = await import("@/lib/supabase");
      await deleteItem(itemId);
      const updatedItems = items.filter((i) => i.id !== itemId);
      setItems(updatedItems);
      if (user) {
        const name = localStorage.getItem("userName") || "";
        localStorage.setItem(`${CACHE_KEY_PREFIX}${name}`, JSON.stringify({ user, items: updatedItems }));
      }
      showToast("已刪除商品", "info");
    } catch (err) {
      console.error("刪除失敗:", err);
      showToast("刪除失敗，請重試", "error");
    }
  }

  function handleLogout() {
    localStorage.removeItem("userName");
    router.push("/");
  }

  if (loading && items.length === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center">
          <div className="mb-3 text-4xl">🌸</div>
          <div className="shimmer mx-auto h-4 w-32 rounded-full" />
        </div>
      </div>
    );
  }

  const totalTwd = items.reduce((sum, i) => sum + (i.ai_price_twd || 0) * (i.quantity || 1), 0);

  return (
    <div className={`page-safe-bottom mx-auto min-h-dvh max-w-lg md:max-w-3xl ${!isOnline ? "pt-10" : ""}`}>
      {!isOnline && <OfflineBanner />}
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <header className="header-safe sticky top-0 z-10 border-b border-gray-100 bg-white/80 px-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push("/")} className="group min-w-0 text-left" aria-label="回首頁">
            <h1 className="text-lg font-bold text-gray-900 transition-colors group-hover:text-sakura-500">
              🌸 {user?.name} 的清單
            </h1>
            {exchangeRate && (
              <p className="text-xs text-gray-400">
                匯率 ¥1 ≈ NT${exchangeRate.rate} ・
                更新 {new Date(exchangeRate.updated_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </button>
          <button onClick={handleLogout}
            className="shrink-0 rounded-lg px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
            切換身份
          </button>
        </div>
      </header>

      <main className="space-y-4 px-4 pt-4">
        {/* 統計 */}
        {items.length > 0 && (
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl bg-sakura-50 p-3 text-center">
              <p className="text-2xl font-bold text-sakura-600">{items.length}</p>
              <p className="text-xs text-gray-500">商品數</p>
            </div>
            <div className="flex-1 rounded-xl bg-sakura-50 p-3 text-center">
              <p className="text-2xl font-bold text-sakura-600">${totalTwd.toLocaleString()}</p>
              <p className="text-xs text-gray-500">預估台幣</p>
            </div>
            <div className="flex-1 rounded-xl bg-emerald-50 p-3 text-center">
              <p className="text-2xl font-bold text-emerald-600">
                {items.filter((i) => i.status === "bought").length}
              </p>
              <p className="text-xs text-gray-500">已買到</p>
            </div>
          </div>
        )}

        {/* 提交表單 */}
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            {isOnline ? "✨ 想買什麼？告訴 AI" : "✨ 想買什麼？（離線中暫時停用）"}
          </h2>
          {user && <SubmitForm onResult={handleAiResult} userId={user.id} disabled={!isOnline} />}
        </div>

        {/* AI 辨識結果 */}
        {pendingResult && (
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">🔍 AI 辨識結果</h2>
            <AiResultCard
              data={pendingResult.data}
              exchangeRate={pendingResult.exchangeRate}
              inputText={pendingResult.inputText}
              imageUrl={pendingResult.imageUrl}
              onConfirm={handleConfirmAdd}
              onDiscard={() => setPendingResult(null)}
            />
          </div>
        )}

        {/* 搜尋 + 排序 */}
        {items.length > 0 && (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜尋商品名稱..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm focus:border-sakura-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sakura-200"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-600 focus:border-sakura-300 focus:outline-none"
            >
              <option value="newest">最新</option>
              <option value="oldest">最舊</option>
              <option value="price_high">價格高→低</option>
              <option value="price_low">價格低→高</option>
            </select>
          </div>
        )}

        {/* 我的清單 */}
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            📋 我的代購清單
            {filteredItems.length > 0 && (
              <span className="ml-1 text-gray-400">
                ({filteredItems.length}{filteredItems.length !== items.length ? `/${items.length}` : ""})
              </span>
            )}
          </h2>

          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 py-12 text-center">
              <p className="text-3xl">🛒</p>
              <p className="mt-2 text-sm text-gray-400">還沒有商品，上面輸入或拍照試試看！</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 py-8 text-center">
              <p className="text-2xl">🔍</p>
              <p className="mt-2 text-sm text-gray-400">找不到符合「{searchQuery}」的商品</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredItems.map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  onDelete={isOnline ? handleDelete : undefined}
                  onEdit={isOnline ? handleItemEdit : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
