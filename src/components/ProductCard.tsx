"use client";

import type { Item } from "@/lib/types";
import { STATUS_MAP, STATUS_COLORS } from "@/lib/types";

interface ProductCardProps {
  item: Item;
  showUser?: boolean; // 管理後台顯示使用者名字
  onDelete?: (id: string) => void;
  onStatusChange?: (id: string, status: Item["status"]) => void;
}

export default function ProductCard({
  item,
  showUser,
  onDelete,
  onStatusChange,
}: ProductCardProps) {
  return (
    <div className="animate-slide-up rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all">
      {/* 頂部：商品名 + 狀態 */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {showUser && item.user_name && (
            <p className="mb-0.5 text-xs font-medium text-sakura-500">
              👤 {item.user_name}
            </p>
          )}
          <h3 className="truncate text-base font-bold text-gray-900">
            {item.ai_product_name || item.input_text || "未辨識商品"}
          </h3>
          {item.ai_product_name_ja && (
            <p className="truncate text-xs text-gray-400">
              {item.ai_product_name_ja}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[item.status]}`}
        >
          {STATUS_MAP[item.status]}
        </span>
      </div>

      {/* 圖片 + 資訊 */}
      <div className="flex gap-3">
        {item.input_image_url && (
          <img
            src={item.input_image_url}
            alt=""
            className="h-16 w-16 shrink-0 rounded-lg border border-gray-100 object-cover"
          />
        )}

        <div className="min-w-0 flex-1 text-sm">
          {/* 品牌 */}
          {item.ai_brand && (
            <p className="text-gray-500">{item.ai_brand}</p>
          )}

          {/* 價格 */}
          {item.ai_price_jpy && (
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-medium text-gray-700">
                ¥{item.ai_price_jpy.toLocaleString()}
              </span>
              {item.ai_price_twd && (
                <>
                  <span className="text-gray-300">≈</span>
                  <span className="font-bold text-sakura-600">
                    NT${item.ai_price_twd.toLocaleString()}
                  </span>
                </>
              )}
              {item.quantity > 1 && (
                <span className="text-xs text-gray-400">× {item.quantity}</span>
              )}
            </div>
          )}

          {/* 哪裡買 */}
          {item.ai_where_to_buy && item.ai_where_to_buy.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {item.ai_where_to_buy.map((shop, i) => (
                <span
                  key={i}
                  className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600"
                >
                  {shop}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 連結 */}
      {item.ai_product_url && (
        <a
          href={item.ai_product_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-blue-500 hover:underline"
        >
          🔗 商品連結
        </a>
      )}

      {/* 備註 */}
      {item.note && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
          📝 {item.note}
        </p>
      )}

      {/* 操作按鈕（管理員用 or 個人可刪除） */}
      <div className="mt-3 flex gap-1.5">
        {onStatusChange && (
          <>
            {item.status !== "bought" && (
              <button
                onClick={() => onStatusChange(item.id, "bought")}
                className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 active:scale-[0.97]"
              >
                ✓ 已買
              </button>
            )}
            {item.status !== "out_of_stock" && (
              <button
                onClick={() => onStatusChange(item.id, "out_of_stock")}
                className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 active:scale-[0.97]"
              >
                缺貨
              </button>
            )}
            {item.status !== "unavailable" && (
              <button
                onClick={() => onStatusChange(item.id, "unavailable")}
                className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 active:scale-[0.97]"
              >
                買不到
              </button>
            )}
            {item.status !== "pending" && (
              <button
                onClick={() => onStatusChange(item.id, "pending")}
                className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 active:scale-[0.97]"
              >
                ↩ 待處理
              </button>
            )}
          </>
        )}

        {onDelete && (
          <button
            onClick={() => {
              if (confirm("確定要刪除這個商品嗎？")) {
                onDelete(item.id);
              }
            }}
            className="ml-auto rounded-lg px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 active:scale-[0.97]"
          >
            🗑 刪除
          </button>
        )}
      </div>
    </div>
  );
}
