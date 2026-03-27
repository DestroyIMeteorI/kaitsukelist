"use client";

import { useState } from "react";
import Image from "next/image";
import type { AiResponse } from "@/lib/types";

interface AiResultCardProps {
  data: AiResponse;
  exchangeRate: number;
  inputText?: string;
  imageUrl?: string;
  onConfirm: (data: AiResponse, quantity: number, weight?: number) => void;
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
  const [selectedVariant, setSelectedVariant] = useState(
    data.selected_variant_index
  );
  const [quantity, setQuantity] = useState(1);
  const [weightInput, setWeightInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(data.product_name_zh);
  const [editPriceJpy, setEditPriceJpy] = useState(
    String(data.estimated_price_jpy)
  );

  const conf = CONFIDENCE_MAP[data.confidence] || CONFIDENCE_MAP.medium;

  // 根據選中品項計算目前價格
  const currentPriceJpy = isEditing
    ? Number(editPriceJpy) || 0
    : data.variants[selectedVariant]?.price_jpy ?? data.estimated_price_jpy;
  const currentPriceTwd = Math.round(currentPriceJpy * exchangeRate);
  const currentName = isEditing ? editName : data.product_name_zh;

  // 搜尋用的商品名
  const searchName = data.product_name_ja || data.product_name_zh;

  function handleVariantSelect(index: number) {
    setSelectedVariant(index);
    // 同步更新手動修改的價格
    const v = data.variants[index];
    if (v) {
      setEditPriceJpy(String(v.price_jpy));
    }
  }

  function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    const finalData: AiResponse = {
      ...data,
      product_name_zh: currentName,
      estimated_price_jpy: currentPriceJpy,
      estimated_price_twd: currentPriceTwd,
      selected_variant_index: selectedVariant,
    };
    onConfirm(
      finalData,
      quantity,
      weightInput ? Number(weightInput) : undefined
    );
  }

  return (
    <div className="animate-slide-up rounded-2xl border-2 border-sakura-200 bg-white p-4 shadow-lg">
      {/* 標題列 */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-lg font-bold leading-snug text-gray-900">
            {currentName}
          </h3>
          {data.product_name_ja && (
            <p className="mt-0.5 break-words text-sm text-gray-500">
              {data.product_name_ja}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${conf.color}`}
        >
          {conf.label}
        </span>
      </div>

      {/* 品牌 + 描述 */}
      {(data.brand || data.description) && (
        <div className="mb-3 text-sm text-gray-600">
          {data.brand && (
            <span className="font-medium text-gray-700">{data.brand}</span>
          )}
          {data.brand && data.description && (
            <span className="text-gray-300"> — </span>
          )}
          {data.description && (
            <span className="text-gray-400">{data.description}</span>
          )}
        </div>
      )}

      {/* 商品番号（UNIQLO 等） */}
      {data.product_code && (
        <div className="mb-2 flex items-center gap-1.5">
          <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-500">
            品番 {data.product_code}
          </span>
        </div>
      )}

      {/* 圖片 + Google 圖片搜尋 */}
      <div className="mb-3 flex items-center gap-3">
        {/* 優先顯示使用者上傳的圖片，其次是從商品頁抽取的圖片 */}
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt="上傳的商品圖片"
            width={112}
            height={112}
            className="h-28 w-28 rounded-xl border border-gray-200 object-cover"
          />
        ) : data.product_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.product_image_url}
            alt="商品圖片"
            width={112}
            height={112}
            referrerPolicy="no-referrer"
            className="h-28 w-28 rounded-xl border border-gray-200 object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : null}
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(searchName)}&tbm=isch`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          📷 查看商品圖片
          <svg
            aria-hidden="true"
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
            />
          </svg>
        </a>
      </div>

      {/* 品項選擇 */}
      {data.variants.length > 1 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-gray-500">
            📦 選擇品項
          </p>
          <div className="space-y-1.5">
            {data.variants.map((v, i) => {
              const twd = Math.round(v.price_jpy * exchangeRate);
              const isSelected = i === selectedVariant;
              return (
                <button
                  key={i}
                  onClick={() => handleVariantSelect(i)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-all ${
                    isSelected
                      ? "border-sakura-400 bg-sakura-50 ring-1 ring-sakura-200"
                      : "border-gray-150 bg-white hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                        isSelected
                          ? "border-sakura-500"
                          : "border-gray-300"
                      }`}
                    >
                      {isSelected && (
                        <div className="h-2 w-2 rounded-full bg-sakura-500" />
                      )}
                    </div>
                    <span
                      className={
                        isSelected
                          ? "font-medium text-gray-900"
                          : "text-gray-700"
                      }
                    >
                      {v.name}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium text-gray-900">
                      ¥{v.price_jpy.toLocaleString()}
                    </span>
                    <span className="ml-1.5 text-xs text-gray-400">
                      ≈ NT${twd.toLocaleString()}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 價格區塊 */}
      <div className="mb-3 rounded-xl bg-sakura-50 p-3">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <div>
            <span className="text-xs text-gray-500">日幣</span>
            <p className="text-xl font-bold text-gray-900">
              ¥{currentPriceJpy.toLocaleString()}
            </p>
          </div>
          <span className="mb-1 text-gray-300">≈</span>
          <div>
            <span className="text-xs text-gray-500">台幣</span>
            <p className="text-xl font-bold text-sakura-600">
              NT${currentPriceTwd.toLocaleString()}
            </p>
          </div>
        </div>
        <p className="mt-1.5 text-xs text-gray-400">
          匯率：¥1 ≈ NT${exchangeRate.toFixed(4)}
        </p>
      </div>

      {/* 去哪買 */}
      {data.where_to_buy && data.where_to_buy.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-gray-500">
            🏪 哪裡買得到
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.where_to_buy.map((shop, i) => (
              <span
                key={i}
                className="rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-700"
              >
                {shop}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 搜尋連結 */}
      <div className="mb-3">
        <p className="mb-1.5 text-xs font-medium text-gray-500">
          🔍 在以下平台搜尋此商品
        </p>
        <div className="flex flex-wrap gap-1.5">
          {/* 只有使用者本來就輸入網址時才顯示，防止 AI 幻覺假連結 */}
          {data.buy_url && inputText && /^https?:\/\//i.test(inputText.trim()) && (
            <a
              href={data.buy_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-sakura-50 px-2.5 py-1.5 text-xs font-medium text-sakura-600 transition-colors hover:bg-sakura-100"
            >
              🔗 原始商品頁面
            </a>
          )}
          <a
            href={`https://www.amazon.co.jp/s?k=${encodeURIComponent(searchName)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 transition-colors hover:bg-amber-100"
          >
            Amazon Japan
          </a>
          <a
            href={`https://search.rakuten.co.jp/search/mall/${encodeURIComponent(searchName)}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-100"
          >
            樂天市場
          </a>
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(searchName)}&tbm=shop`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs text-blue-600 transition-colors hover:bg-blue-100"
          >
            Google Shopping
          </a>
        </div>
      </div>

      {/* 手動修改 */}
      <div className="mb-3">
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="mb-2 flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-gray-600"
        >
          ✏️ {isEditing ? "收起修改" : "手動修改名稱 / 價格"}
        </button>
        {isEditing && (
          <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">
                商品名稱
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-sakura-300 focus:outline-none focus:ring-1 focus:ring-sakura-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">
                日幣價格
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  ¥
                </span>
                <input
                  type="number"
                  min="0"
                  value={editPriceJpy}
                  onChange={(e) => setEditPriceJpy(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-7 pr-3 text-sm focus:border-sakura-300 focus:outline-none focus:ring-1 focus:ring-sakura-200"
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">
                ≈ NT$
                {Math.round(
                  (Number(editPriceJpy) || 0) * exchangeRate
                ).toLocaleString()}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 數量選擇 */}
      <div className="mb-3 flex items-center gap-3">
        <span className="text-sm text-gray-600">數量：</span>
        <div className="flex items-center rounded-xl border border-gray-200">
          <button
            aria-label="減少數量"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="min-h-[44px] min-w-[44px] text-lg text-gray-500 transition-colors hover:text-gray-800 active:scale-[0.95]"
          >
            −
          </button>
          <span className="min-w-[2rem] text-center text-base font-medium">
            {quantity}
          </span>
          <button
            aria-label="增加數量"
            onClick={() => setQuantity(Math.min(99, quantity + 1))}
            className="min-h-[44px] min-w-[44px] text-lg text-gray-500 transition-colors hover:text-gray-800 active:scale-[0.95]"
          >
            +
          </button>
        </div>
        {quantity > 1 && (
          <span className="text-sm font-medium text-sakura-500">
            共 NT${(currentPriceTwd * quantity).toLocaleString()}
          </span>
        )}
      </div>

      {/* 重量輸入 */}
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
        <button
          onClick={onDiscard}
          className="min-h-[48px] flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-600 transition-all hover:bg-gray-50 active:scale-[0.98]"
        >
          不需要
        </button>
        <button
          onClick={handleConfirm}
          disabled={submitting}
          className="min-h-[48px] flex-1 rounded-xl bg-sakura-500 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-sakura-600 active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? "加入中…" : "✓ 加入清單"}
        </button>
      </div>
    </div>
  );
}
