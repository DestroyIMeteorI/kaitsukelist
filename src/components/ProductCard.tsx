"use client";

import { useState, memo } from "react";
import Image from "next/image";
import type { Item, EditableItemFields } from "@/lib/types";
import { STATUS_MAP, STATUS_COLORS } from "@/lib/types";

interface ProductCardProps {
  item: Item;
  showUser?: boolean;
  onDelete?: (id: string) => void;
  onStatusChange?: (id: string, status: Item["status"]) => void;
  onEdit?: (id: string, fields: EditableItemFields) => void;
}

function ProductCard({
  item,
  showUser,
  onDelete,
  onStatusChange,
  onEdit,
}: ProductCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 編輯表單的本地狀態
  const [editName, setEditName] = useState(item.ai_product_name || "");
  const [editNameJa, setEditNameJa] = useState(item.ai_product_name_ja || "");
  const [editBrand, setEditBrand] = useState(item.ai_brand || "");
  const [editPriceJpy, setEditPriceJpy] = useState(String(item.ai_price_jpy || ""));
  const [editWhere, setEditWhere] = useState((item.ai_where_to_buy || []).join("、"));
  const [editUrl, setEditUrl] = useState(item.ai_product_url || "");
  const [editQuantity, setEditQuantity] = useState(String(item.quantity || 1));
  const [editWeight, setEditWeight] = useState(String(item.weight_g || ""));
  const [editNote, setEditNote] = useState(item.note || "");

  // 計算台幣（用已儲存匯率）
  const estimatedTwd = editPriceJpy && item.ai_exchange_rate
    ? Math.round(Number(editPriceJpy) * Number(item.ai_exchange_rate))
    : item.ai_price_twd;

  function handleEditOpen() {
    // 重置為目前值再開啟
    setEditName(item.ai_product_name || "");
    setEditNameJa(item.ai_product_name_ja || "");
    setEditBrand(item.ai_brand || "");
    setEditPriceJpy(String(item.ai_price_jpy || ""));
    setEditWhere((item.ai_where_to_buy || []).join("、"));
    setEditUrl(item.ai_product_url || "");
    setEditQuantity(String(item.quantity || 1));
    setEditWeight(String(item.weight_g || ""));
    setEditNote(item.note || "");
    setIsEditing(true);
  }

  function handleSave() {
    if (!onEdit) return;
    const priceJpy = Number(editPriceJpy) || 0;
    const whereToBuy = editWhere
      .split(/[、,，]/)
      .map((s) => s.trim())
      .filter(Boolean);

    onEdit(item.id, {
      ai_product_name: editName.trim() || undefined,
      ai_product_name_ja: editNameJa.trim() || undefined,
      ai_brand: editBrand.trim() || undefined,
      ai_price_jpy: priceJpy || undefined,
      ai_price_twd: (priceJpy && item.ai_exchange_rate)
        ? Math.round(priceJpy * Number(item.ai_exchange_rate))
        : undefined,
      ai_where_to_buy: whereToBuy.length ? whereToBuy : undefined,
      ai_product_url: editUrl.trim() || undefined,
      quantity: Number(editQuantity) || 1,
      weight_g: editWeight ? Number(editWeight) : null,
      note: editNote.trim() || null,
    });
    setIsEditing(false);
  }

  return (
    <div className="animate-slide-up card-hover rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      {/* 頂部：商品名 + 狀態 + 編輯按鈕 */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {showUser && item.user_name && (
            <p className="mb-0.5 text-xs font-medium text-sakura-500">
              👤 {item.user_name}
            </p>
          )}
          <h3 className="break-words text-base font-bold leading-snug text-gray-900">
            {item.ai_product_name || item.input_text || "未辨識商品"}
          </h3>
          {item.ai_product_name_ja && (
            <p className="mt-0.5 break-words text-xs leading-snug text-gray-400">
              {item.ai_product_name_ja}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onEdit && !isEditing && (
            <button
              onClick={handleEditOpen}
              className="rounded-lg px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              ✏️ 編輯
            </button>
          )}
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[item.status]}`}>
            {STATUS_MAP[item.status]}
          </span>
        </div>
      </div>

      {/* 一般顯示模式 */}
      {!isEditing && (
        <>
          {/* 圖片 + 資訊 */}
          <div className="flex gap-3">
            {item.input_image_url && (
              <Image
                src={item.input_image_url}
                alt=""
                width={80}
                height={80}
                className="h-20 w-20 shrink-0 rounded-xl border border-gray-100 object-cover"
              />
            )}
            <div className="min-w-0 flex-1 text-sm">
              {item.ai_brand && <p className="text-gray-500">{item.ai_brand}</p>}
              {item.ai_price_jpy ? (
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
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
              ) : null}
              {item.weight_g && (
                <p className="mt-1 text-xs text-gray-400">⚖️ {item.weight_g}g</p>
              )}
              {item.ai_where_to_buy && item.ai_where_to_buy.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {item.ai_where_to_buy.map((shop, i) => (
                    <span key={i} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">
                      {shop}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {item.ai_product_url && (
            <a
              href={item.ai_product_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 inline-flex items-center gap-1 text-xs text-blue-500 hover:underline"
            >
              🔗 商品連結
            </a>
          )}

          {item.note && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
              📝 {item.note}
            </p>
          )}

          {/* 操作按鈕 */}
          <div className="mt-3 flex flex-wrap gap-2">
            {onStatusChange && (
              <>
                {item.status !== "bought" && (
                  <button onClick={() => onStatusChange(item.id, "bought")}
                    className="min-h-[44px] rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 active:scale-[0.97]">
                    ✓ 已買
                  </button>
                )}
                {item.status !== "out_of_stock" && (
                  <button onClick={() => onStatusChange(item.id, "out_of_stock")}
                    className="min-h-[44px] rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 active:scale-[0.97]">
                    缺貨
                  </button>
                )}
                {item.status !== "unavailable" && (
                  <button onClick={() => onStatusChange(item.id, "unavailable")}
                    className="min-h-[44px] rounded-xl bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 active:scale-[0.97]">
                    買不到
                  </button>
                )}
                {item.status !== "pending" && (
                  <button onClick={() => onStatusChange(item.id, "pending")}
                    className="min-h-[44px] rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 active:scale-[0.97]">
                    ↩ 待處理
                  </button>
                )}
              </>
            )}
            {onDelete && !confirmDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="ml-auto min-h-[44px] rounded-xl px-3 py-2 text-xs text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 active:scale-[0.97]"
              >
                🗑 刪除
              </button>
            )}
            {onDelete && confirmDelete && (
              <div className="animate-scale-in ml-auto flex items-center gap-1.5">
                <span className="text-xs text-red-500">確定刪除？</span>
                <button
                  onClick={() => { setConfirmDelete(false); onDelete(item.id); }}
                  className="min-h-[36px] rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600 active:scale-[0.97]"
                >
                  確定
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-[36px] rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-200 active:scale-[0.97]"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* 編輯模式 */}
      {isEditing && (
        <div className="space-y-3 border-t border-gray-100 pt-3">
          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="mb-0.5 block text-xs text-gray-500">商品名稱（中文）</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sakura-300 focus:outline-none focus:ring-1 focus:ring-sakura-200" />
            </div>
            <div>
              <label className="mb-0.5 block text-xs text-gray-500">商品名稱（日文）</label>
              <input value={editNameJa} onChange={(e) => setEditNameJa(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sakura-300 focus:outline-none focus:ring-1 focus:ring-sakura-200" />
            </div>
            <div>
              <label className="mb-0.5 block text-xs text-gray-500">品牌</label>
              <input value={editBrand} onChange={(e) => setEditBrand(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sakura-300 focus:outline-none focus:ring-1 focus:ring-sakura-200" />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="mb-0.5 block text-xs text-gray-500">日幣價格（¥）</label>
                <input type="number" min="0" value={editPriceJpy} onChange={(e) => setEditPriceJpy(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sakura-300 focus:outline-none focus:ring-1 focus:ring-sakura-200" />
              </div>
              {estimatedTwd != null && (
                <p className="mb-2 shrink-0 text-xs text-sakura-500">≈ NT${estimatedTwd.toLocaleString()}</p>
              )}
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-0.5 block text-xs text-gray-500">數量</label>
                <input type="number" min="1" max="99" value={editQuantity} onChange={(e) => setEditQuantity(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sakura-300 focus:outline-none focus:ring-1 focus:ring-sakura-200" />
              </div>
              <div className="flex-1">
                <label className="mb-0.5 block text-xs text-gray-500">重量（克，選填）</label>
                <input type="number" min="0" value={editWeight} onChange={(e) => setEditWeight(e.target.value)}
                  placeholder="例：250"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sakura-300 focus:outline-none focus:ring-1 focus:ring-sakura-200" />
              </div>
            </div>
            <div>
              <label className="mb-0.5 block text-xs text-gray-500">哪裡買（用逗號分隔）</label>
              <input value={editWhere} onChange={(e) => setEditWhere(e.target.value)}
                placeholder="例：松本清、唐吉訶德"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sakura-300 focus:outline-none focus:ring-1 focus:ring-sakura-200" />
            </div>
            <div>
              <label className="mb-0.5 block text-xs text-gray-500">商品連結</label>
              <input type="url" value={editUrl} onChange={(e) => setEditUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sakura-300 focus:outline-none focus:ring-1 focus:ring-sakura-200" />
            </div>
            <div>
              <label className="mb-0.5 block text-xs text-gray-500">備註</label>
              <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)}
                placeholder="特殊需求、顏色、尺寸等…"
                rows={2}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sakura-300 focus:outline-none focus:ring-1 focus:ring-sakura-200" />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => setIsEditing(false)}
              className="min-h-[44px] flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-all hover:bg-gray-50 active:scale-[0.98]">
              取消
            </button>
            <button onClick={handleSave}
              className="min-h-[44px] flex-1 rounded-xl bg-sakura-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-sakura-600 active:scale-[0.98]">
              儲存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// React.memo：只有 item prop 真正改變時才重渲染
// 清單有多張卡片時，避免一張更新就全部重繪
export default memo(ProductCard);
