"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import SubmitForm from "@/components/SubmitForm";
import AiResultCard from "@/components/AiResultCard";
import ProductCard from "@/components/ProductCard";
import type { AiResponse, Item, User, ExchangeRate } from "@/lib/types";

export default function ListPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);

  // AI 辨識結果（等待確認加入清單）
  const [pendingResult, setPendingResult] = useState<{
    data: AiResponse;
    exchangeRate: number;
    inputText?: string;
    imageUrl?: string;
  } | null>(null);

  // 初始化
  useEffect(() => {
    async function init() {
      const name = localStorage.getItem("userName");
      if (!name) {
        router.push("/");
        return;
      }

      try {
        const { getOrCreateUser, getUserItems } = await import("@/lib/supabase");
        const userData = await getOrCreateUser(name);
        setUser(userData);
        const itemsData = await getUserItems(userData.id);
        setItems(itemsData || []);
      } catch (err) {
        console.error("初始化失敗:", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router]);

  // 載入匯率
  useEffect(() => {
    fetch("/api/exchange-rate")
      .then((r) => r.json())
      .then(setExchangeRate)
      .catch(() => {});
  }, []);

  // AI 辨識完成
  const handleAiResult = useCallback(
    (data: AiResponse, rate: number, inputText?: string, imageUrl?: string) => {
      setPendingResult({ data, exchangeRate: rate, inputText, imageUrl });
    },
    []
  );

  // 確認加入清單
  async function handleConfirmAdd(quantity: number) {
    if (!user || !pendingResult) return;

    try {
      const { addItem } = await import("@/lib/supabase");
      const newItem = await addItem({
        user_id: user.id,
        input_text: pendingResult.inputText || null,
        input_image_url: pendingResult.imageUrl || null,
        ai_product_name: pendingResult.data.product_name_zh,
        ai_product_name_ja: pendingResult.data.product_name_ja,
        ai_brand: pendingResult.data.brand,
        ai_price_jpy: pendingResult.data.estimated_price_jpy,
        ai_price_twd: pendingResult.data.estimated_price_twd,
        ai_exchange_rate: pendingResult.exchangeRate,
        ai_where_to_buy: pendingResult.data.where_to_buy,
        ai_product_url: pendingResult.data.buy_url,
        ai_description: pendingResult.data.description,
        ai_confidence: pendingResult.data.confidence,
        ai_summary: JSON.stringify(pendingResult.data),
        quantity,
      });

      // 加到清單最前面
      setItems((prev) => [newItem, ...prev]);
      setPendingResult(null);
    } catch (err) {
      console.error("加入清單失敗:", err);
      alert("加入清單失敗，請重試");
    }
  }

  // 刪除商品
  async function handleDelete(itemId: string) {
    try {
      const { deleteItem } = await import("@/lib/supabase");
      await deleteItem(itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err) {
      console.error("刪除失敗:", err);
      alert("刪除失敗，請重試");
    }
  }

  // 登出
  function handleLogout() {
    localStorage.removeItem("userName");
    router.push("/");
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center">
          <div className="mb-3 text-4xl">🌸</div>
          <div className="shimmer mx-auto h-4 w-32 rounded-full" />
        </div>
      </div>
    );
  }

  const totalTwd = items.reduce(
    (sum, i) => sum + (i.ai_price_twd || 0) * (i.quantity || 1),
    0
  );

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-8">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              🌸 {user?.name} 的清單
            </h1>
            {exchangeRate && (
              <p className="text-xs text-gray-400">
                匯率 ¥1 ≈ NT${exchangeRate.rate} ・
                更新 {new Date(exchangeRate.updated_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            切換身份
          </button>
        </div>
      </header>

      <main className="space-y-4 px-4 pt-4">
        {/* 統計資訊 */}
        {items.length > 0 && (
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl bg-sakura-50 p-3 text-center">
              <p className="text-2xl font-bold text-sakura-600">{items.length}</p>
              <p className="text-xs text-gray-500">商品數</p>
            </div>
            <div className="flex-1 rounded-xl bg-sakura-50 p-3 text-center">
              <p className="text-2xl font-bold text-sakura-600">
                ${totalTwd.toLocaleString()}
              </p>
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
          <h2 className="mb-2 text-sm font-medium text-gray-500">
            ✨ 想買什麼？告訴 AI
          </h2>
          {user && (
            <SubmitForm onResult={handleAiResult} userId={user.id} />
          )}
        </div>

        {/* AI 辨識結果（等待確認） */}
        {pendingResult && (
          <div>
            <h2 className="mb-2 text-sm font-medium text-gray-500">
              🔍 AI 辨識結果
            </h2>
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

        {/* 我的清單 */}
        <div>
          <h2 className="mb-2 text-sm font-medium text-gray-500">
            📋 我的代購清單
            {items.length > 0 && (
              <span className="ml-1 text-gray-400">({items.length})</span>
            )}
          </h2>

          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 py-12 text-center">
              <p className="text-3xl">🛒</p>
              <p className="mt-2 text-sm text-gray-400">
                還沒有商品，上面輸入或拍照試試看！
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
