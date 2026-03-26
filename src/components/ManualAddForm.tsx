"use client";

import { useState, useRef } from "react";

interface ManualAddFormProps {
  userId: string;
  exchangeRate: number;
  onAdd: (item: {
    productName: string;
    priceJpy: number;
    priceTwd: number;
    brand?: string;
    productUrl?: string;
    imageUrl?: string;
    weightG?: number;
    quantity: number;
    note?: string;
  }) => void;
  disabled?: boolean;
}

export default function ManualAddForm({
  userId,
  exchangeRate,
  onAdd,
  disabled,
}: ManualAddFormProps) {
  // 必填
  const [name, setName] = useState("");
  const [priceJpy, setPriceJpy] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  // 進階
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [brand, setBrand] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [weightInput, setWeightInput] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const priceTwd = Math.round((Number(priceJpy) || 0) * exchangeRate);
  const isDisabled = disabled || uploading;

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("請上傳圖片檔案"); return; }
    try {
      const imageCompression = (await import("browser-image-compression")).default;
      const compressed = await imageCompression(file, { maxWidthOrHeight: 800, maxSizeMB: 0.3, useWebWorker: true });
      setImageFile(compressed);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(compressed);
      setError("");
    } catch { setError("圖片處理失敗，請換一張試試"); }
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) { setError("請輸入商品名稱"); return; }
    if (!priceJpy || Number(priceJpy) <= 0) { setError("請輸入日幣價格"); return; }

    setUploading(true);
    setError("");
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        const { uploadImage } = await import("@/lib/supabase");
        imageUrl = await uploadImage(imageFile, userId);
      }
      onAdd({
        productName: trimmedName,
        priceJpy: Math.round(Number(priceJpy)),
        priceTwd,
        brand: brand.trim() || undefined,
        productUrl: productUrl.trim() || undefined,
        imageUrl,
        weightG: weightInput ? Number(weightInput) : undefined,
        quantity,
        note: note.trim() || undefined,
      });
      // 重置
      setName(""); setPriceJpy(""); setQuantity(1); setNote("");
      setBrand(""); setProductUrl(""); setWeightInput("");
      clearImage();
    } catch { setError("新增失敗，請重試"); }
    finally { setUploading(false); }
  }

  return (
    <div className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-opacity ${disabled ? "opacity-50" : ""}`}>

      {/* ── 必填區 ── */}

      {/* 商品名稱 */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-gray-500">
          商品名稱 <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          placeholder="例：白色戀人 18枚入"
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base transition-colors placeholder:text-gray-400 focus:border-sakura-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sakura-100"
          disabled={isDisabled}
        />
      </div>

      {/* 日幣價格 + 數量（同一行） */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            日幣價格 <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">¥</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={priceJpy}
              onChange={(e) => { setPriceJpy(e.target.value); setError(""); }}
              placeholder="1728"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-7 pr-3 text-base transition-colors placeholder:text-gray-400 focus:border-sakura-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sakura-100"
              disabled={isDisabled}
            />
          </div>
          {Number(priceJpy) > 0 && (
            <p className="mt-0.5 text-xs text-gray-400">≈ NT${priceTwd.toLocaleString()}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">數量</label>
          <div className="flex h-[46px] items-center rounded-xl border border-gray-200 bg-gray-50">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="flex h-full w-11 items-center justify-center text-lg text-gray-500 transition-colors hover:text-gray-800 disabled:opacity-40"
              disabled={isDisabled || quantity <= 1}
            >
              −
            </button>
            <span className="flex-1 text-center text-sm font-semibold">{quantity}</span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="flex h-full w-11 items-center justify-center text-lg text-gray-500 transition-colors hover:text-gray-800 disabled:opacity-40"
              disabled={isDisabled}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* 備註（必填區最顯眼的位置） */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-gray-500">
          📝 備註給代購人（選填）
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="口味、尺寸、顏色、特殊需求等"
          rows={2}
          className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm leading-relaxed placeholder:text-gray-400 focus:border-sakura-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sakura-100"
          disabled={isDisabled}
        />
      </div>

      {/* ── 進階選項 toggle ── */}
      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="mb-3 flex w-full items-center gap-1 text-xs text-gray-400 transition-colors hover:text-gray-600"
      >
        <span className="mr-0.5">{showAdvanced ? "▲" : "▼"}</span>
        {showAdvanced ? "收起進階選項" : "更多選項（品牌、網址、圖片、重量）"}
      </button>

      {/* ── 進階選項區 ── */}
      {showAdvanced && (
        <div className="mb-3 space-y-3 border-t border-gray-100 pt-3">
          {/* 品牌 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">品牌（選填）</label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="例：ISHIYA、資生堂"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm transition-colors placeholder:text-gray-400 focus:border-sakura-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sakura-100"
              disabled={isDisabled}
            />
          </div>

          {/* 商品網址 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">商品網址（選填）</label>
            <input
              type="url"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="https://amazon.co.jp/dp/..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm transition-colors placeholder:text-gray-400 focus:border-sakura-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sakura-100"
              disabled={isDisabled}
            />
          </div>

          {/* 商品圖片 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">商品圖片（選填）</label>
            {imagePreview ? (
              <div className="relative inline-block">
                <img src={imagePreview} alt="商品圖片預覽" className="h-20 w-20 rounded-xl border border-gray-200 object-cover" />
                <button onClick={clearImage} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-800 text-xs text-white shadow-md">
                  ✕
                </button>
              </div>
            ) : (
              <label className={`flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-2.5 text-sm text-gray-500 transition-colors hover:border-sakura-300 hover:bg-sakura-50 ${isDisabled ? "pointer-events-none" : ""}`}>
                📷 選擇圖片
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageSelect} className="hidden" disabled={isDisabled} />
              </label>
            )}
          </div>

          {/* 重量 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">重量 g（選填）</label>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              placeholder="例：250"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-sakura-300 focus:outline-none focus:ring-1 focus:ring-sakura-200"
              disabled={isDisabled}
            />
          </div>
        </div>
      )}

      {/* 錯誤訊息 */}
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">⚠️ {error}</p>
      )}

      {/* 送出按鈕 */}
      <button
        onClick={handleSubmit}
        disabled={isDisabled || !name.trim() || !priceJpy}
        className="flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-xl bg-sakura-500 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-sakura-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? "新增中..." : "✓ 加入清單"}
      </button>
    </div>
  );
}
