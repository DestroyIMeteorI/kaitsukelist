"use client";

import { useState, useEffect } from "react";
import type { Item } from "@/lib/types";

interface BoughtModalProps {
  item: Item;
  onConfirm: (details: { actual_price_jpy: number; actual_quantity: number }) => void;
  onClose: () => void;
}

export default function BoughtModal({ item, onConfirm, onClose }: BoughtModalProps) {
  const [actualPrice, setActualPrice] = useState(String(item.ai_price_jpy || ""));
  const [actualQty, setActualQty] = useState(String(item.quantity || 1));
  const [priceError, setPriceError] = useState(false);

  // 按 ESC 關閉
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleConfirm() {
    const price = Number(actualPrice);
    if (!price || price <= 0) {
      setPriceError(true);
      return;
    }
    onConfirm({
      actual_price_jpy: Math.round(price),
      actual_quantity: Number(actualQty) || 1,
    });
  }

  const rate = item.ai_exchange_rate ? Number(item.ai_exchange_rate) : 0.2012;
  const twd = actualPrice ? Math.round(Number(actualPrice) * rate) : 0;

  return (
    /* 背景遮罩 */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal 卡片 — 從底部滑出 */}
      <div className="w-full max-w-md animate-slideInRight rounded-t-2xl bg-white px-6 pb-8 pt-6 shadow-2xl">
        {/* 把手 */}
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-gray-200" />

        <h3 className="mb-1 text-lg font-bold text-gray-900">
          ✅ 確認購買
        </h3>
        <p className="mb-5 line-clamp-1 text-sm text-gray-500">
          {item.ai_product_name || item.input_text || "商品"}
        </p>

        {/* 備註（如有） */}
        {item.note && (
          <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2">
            <p className="text-sm text-yellow-800">📝 {item.note}</p>
          </div>
        )}

        {/* 實際金額 */}
        <label className="mb-1 block text-sm text-gray-500">實際金額（日幣）</label>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xl text-gray-500">¥</span>
          <input
            type="number"
            inputMode="numeric"
            value={actualPrice}
            onChange={(e) => { setActualPrice(e.target.value); setPriceError(false); }}
            placeholder="輸入實際購買金額"
            className="flex-1 rounded-xl border-2 border-sakura-300 py-3 text-center text-2xl font-bold focus:border-sakura-500 focus:outline-none"
            autoFocus
          />
        </div>
        {priceError && (
          <p className="mb-1 text-xs text-red-500">⚠️ 請輸入實際購買金額</p>
        )}
        {twd > 0 && (
          <p className="mb-4 text-right text-xs text-gray-400">≈ NT${twd.toLocaleString()}</p>
        )}

        {/* 數量 */}
        <label className="mb-1 block text-sm text-gray-500">數量</label>
        <div className="mb-6 flex items-center gap-4">
          <button
            aria-label="減少數量"
            onClick={() => setActualQty(String(Math.max(1, Number(actualQty) - 1)))}
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-xl active:scale-95 transition-transform"
          >
            −
          </button>
          <span className="w-8 text-center text-2xl font-bold">{actualQty}</span>
          <button
            aria-label="增加數量"
            onClick={() => setActualQty(String(Math.min(99, Number(actualQty) + 1)))}
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-xl active:scale-95 transition-transform"
          >
            +
          </button>
          {Number(actualQty) > 1 && (
            <span className="ml-auto text-sm text-gray-400">
              小計 ¥{(Number(actualPrice) * Number(actualQty)).toLocaleString()}
            </span>
          )}
        </div>

        {/* 確認按鈕 */}
        <button
          onClick={handleConfirm}
          className="w-full rounded-xl bg-emerald-500 py-4 text-lg font-bold text-white transition-all active:scale-[0.98] hover:bg-emerald-600"
        >
          確認購買 {actualPrice ? `¥${Number(actualPrice).toLocaleString()}` : ""}
        </button>
        <button
          onClick={onClose}
          className="mt-2 w-full py-3 text-center text-sm text-gray-400"
        >
          取消
        </button>
      </div>
    </div>
  );
}
