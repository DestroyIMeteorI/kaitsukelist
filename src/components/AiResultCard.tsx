"use client";

import { useState } from "react";
import Image from "next/image";
import type { AiResponse } from "@/lib/types";

interface AiResultCardProps {
  data: AiResponse;
  exchangeRate: number;
  inputText?: string;
  imageUrl?: string;
  onConfirm: (quantity: number, weight?: number) => void;
  onDiscard: () => void;
}

const CONFIDENCE_MAP = {
  high: { label: "高信心", color: "bg-emerald-100 text-emerald-700" },
  medium: { label: "中信心", color: "bg-amber-100 text-amber-700" },
  low: { label: "低信心", color: "bg-red-100 text-red-700" },
};

export default function AiResultCard({
  data,
  exchangeRate,
  inputText,
  imageUrl,
  onConfirm,
  onDiscard,
}: AiResultCardProps) {
  const [quantity, setQuantity] = useState(1);
  const [weightInput, setWeightInput] = useState("");
  const conf = CONFIDENCE_MAP[data.confidence] || CONFIDENCE_MAP.medium;

  return (
    <div className="animate-slide-up rounded-2xl border-2 border-sakura-200 bg-white p-4 shadow-lg">
      {/* 標題列 */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-lg font-bold leading-snug text-gray-900">
            {data.product_name_zh}
          </h3>
          {data.product_name_ja && (
            <p className="mt-0.5 break-words text-sm text-gray-500">{data.product_name_ja}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${conf.color}`}>
          {conf.label}
        </span>
      </div>

      {/* 品牌 + 描述 */}
      {(data.brand || data.description) && (
        <div className="mb-3 text-sm text-gray-600">
          {data.brand && <span className="font-medium text-gray-700">{data.brand}</span>}
          {data.brand && data.description && <span className="text-gray-300"> — </span>}
          {data.description && <span className="text-gray-400">{data.description}</span>}
        </div>
      )}

      {/* 商品圖片：AI 範例圖 + 用戶上傳圖 */}
      {(data.image_url || imageUrl) && (
        <div className="mb-3 flex gap-3">
          {data.image_url && (
            <div className="text-center">
              <img
                src={data.image_url}
                alt={`${data.product_name_zh} 商品範例圖`}
                className="h-28 w-28 rounded-xl border border-sakura-200 object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <p className="mt-1 text-xs text-gray-400">📷 商品範例</p>
            </div>
          )}
          {imageUrl && (
            <div className="text-center">
              <Image
                src={imageUrl}
                alt="上傳的商品圖片"
                width={112}
                height={112}
                className="h-28 w-28 rounded-xl border border-gray-200 object-cover"
              />
              <p className="mt-1 text-xs text-gray-400">📎 你的圖片</p>
            </div>
          )}
        </div>
      )}

      {/* 價格區塊 */}
      <div className="mb-3 rounded-xl bg-sakura-50 p-3">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <div>
            <span className="text-xs text-gray-500">日幣</span>
            <p className="text-xl font-bold text-gray-900">
              ¥{data.estimated_price_jpy?.toLocaleString() ?? "—"}
            </p>
          </div>
          <span className="mb-1 text-gray-300">≈</span>
          <div>
            <span className="text-xs text-gray-500">台幣</span>
            <p className="text-xl font-bold text-sakura-600">
              NT${data.estimated_price_twd?.toLocaleString() ?? "—"}
            </p>
          </div>
        </div>
        <p className="mt-1.5 text-xs text-gray-400">匯率：¥1 ≈ NT${exchangeRate}</p>
      </div>

      {/* 去哪買 */}
      {data.where_to_buy && data.where_to_buy.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-gray-500">🏪 哪裡買得到</p>
          <div className="flex flex-wrap gap-1.5">
            {data.where_to_buy.map((shop, i) => (
              <span key={i} className="rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-700">
                {shop}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 購物連結 */}
      {data.buy_url && (
        <a href={data.buy_url} target="_blank" rel="noopener noreferrer"
          className="mb-3 flex items-center gap-1 text-sm text-blue-500 underline-offset-2 hover:underline">
          🔗 查看商品連結（確認是不是這個）
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </a>
      )}

      {/* 數量選擇 */}
      <div className="mb-3 flex items-center gap-3">
        <span className="text-sm text-gray-600">數量：</span>
        <div className="flex items-center rounded-xl border border-gray-200">
          <button onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="min-h-[44px] min-w-[44px] text-lg text-gray-500 transition-colors hover:text-gray-800 active:scale-[0.95]">
            −
          </button>
          <span className="min-w-[2rem] text-center text-base font-medium">{quantity}</span>
          <button onClick={() => setQuantity(quantity + 1)}
            className="min-h-[44px] min-w-[44px] text-lg text-gray-500 transition-colors hover:text-gray-800 active:scale-[0.95]">
            +
          </button>
        </div>
        {quantity > 1 && (
          <span className="text-sm font-medium text-sakura-500">
            共 NT${((data.estimated_price_twd || 0) * quantity).toLocaleString()}
          </span>
        )}
      </div>

      {/* 重量輸入（選填） */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-gray-500">
          ⚖️ 商品重量（克，選填）
        </label>
        <input
          type="number"
          min="0"
          value={weightInput}
          onChange={(e) => setWeightInput(e.target.value)}
          placeholder="例：250（不知道可以跳過）"
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-sakura-300 focus:outline-none focus:ring-1 focus:ring-sakura-200"
        />
      </div>

      {/* 確認 / 放棄按鈕 */}
      <div className="flex gap-2">
        <button onClick={onDiscard}
          className="min-h-[48px] flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-600 transition-all hover:bg-gray-50 active:scale-[0.98]">
          不需要
        </button>
        <button onClick={() => onConfirm(quantity, weightInput ? Number(weightInput) : undefined)}
          className="min-h-[48px] flex-1 rounded-xl bg-sakura-500 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-sakura-600 active:scale-[0.98]">
          ✓ 加入清單
        </button>
      </div>
    </div>
  );
}
