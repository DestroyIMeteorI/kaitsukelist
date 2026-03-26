"use client";

import { useState, useRef } from "react";
import type { AiResponse } from "@/lib/types";

interface SubmitFormProps {
  onResult: (data: AiResponse, exchangeRate: number, inputText?: string, imageUrl?: string) => void;
  userId: string;
  disabled?: boolean; // 離線時停用
}

export default function SubmitForm({ onResult, userId, disabled }: SubmitFormProps) {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 偵測輸入是否為 URL
  const isUrlInput = /^https?:\/\//i.test(text.trim());

  // 處理圖片選擇 + 壓縮
  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // 檢查是不是圖片
    if (!file.type.startsWith("image/")) {
      setError("請上傳圖片檔案");
      return;
    }

    try {
      // 動態載入壓縮套件（瀏覽器端壓縮，不用上傳大檔案）
      const imageCompression = (await import("browser-image-compression")).default;
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 800, // 最大 800px
        maxSizeMB: 0.3, // 最大 300KB
        useWebWorker: true,
      });

      setImageFile(compressed);

      // 產生預覽圖
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(compressed);
      setError("");
    } catch {
      setError("圖片處理失敗，請換一張試試");
    }
  }

  // 清除圖片
  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // 送出辨識請求
  async function handleSubmit() {
    if (!text.trim() && !imageFile) {
      setError("請輸入商品名稱或上傳圖片");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 如果有圖片，先上傳到 Supabase Storage
      let imageUrl: string | undefined;
      if (imageFile) {
        const { uploadImage } = await import("@/lib/supabase");
        imageUrl = await uploadImage(imageFile, userId);
      }

      // 呼叫 AI 辨識 API
      const formData = new FormData();
      if (text.trim()) formData.append("text", text.trim());
      if (imageFile) formData.append("image", imageFile);

      const res = await fetch("/api/identify", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (!result.success) {
        setError(result.error || "AI 辨識失敗，請重試");
        return;
      }

      // 把結果傳回上層
      onResult(result.data, result.exchange_rate, text.trim() || undefined, imageUrl);

      // 清空表單
      setText("");
      clearImage();
    } catch (err: any) {
      setError(err.message || "發生錯誤，請重試");
    } finally {
      setLoading(false);
    }
  }

  const isDisabled = disabled || loading;

  return (
    <div className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-opacity ${disabled ? "opacity-50" : ""}`}>
      {/* 文字/網址輸入 */}
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError("");
        }}
        placeholder="輸入商品名稱、描述或貼上商品網址&#10;例：樂敦眼藥水、白色戀人 18枚、https://amazon.co.jp/..."
        className="w-full resize-none rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-base leading-relaxed transition-colors placeholder:text-gray-400 focus:border-sakura-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sakura-100"
        rows={2}
        disabled={isDisabled}
      />
      {isUrlInput && (
        <p className="mt-1 text-xs text-blue-500">🔗 已偵測商品網址，將自動抓取頁面資訊</p>
      )}

      {/* 圖片預覽 */}
      {imagePreview && (
        <div className="relative mt-3 inline-block">
          <img
            src={imagePreview}
            alt="商品圖片預覽"
            className="h-30 w-30 rounded-xl border border-gray-200 object-cover"
          />
          <button
            onClick={clearImage}
            className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-gray-800 text-xs text-white shadow-md"
          >
            ✕
          </button>
        </div>
      )}

      {/* 操作按鈕列 */}
      <div className="mt-3 flex items-stretch gap-2">
        {/* 拍照/選圖按鈕 */}
        <label className={`flex min-h-[48px] cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 transition-colors hover:border-sakura-300 hover:bg-sakura-50 active:scale-[0.98] ${isDisabled ? "pointer-events-none" : ""}`}>
          <svg
            className="h-4 w-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
            />
          </svg>
          {imageFile ? "更換圖片" : "拍照 / 選圖"}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageSelect}
            className="hidden"
            disabled={isDisabled}
          />
        </label>

        {/* 送出辨識按鈕 */}
        <button
          onClick={handleSubmit}
          disabled={isDisabled || (!text.trim() && !imageFile)}
          className="ml-auto flex min-h-[48px] items-center gap-1.5 rounded-xl bg-sakura-500 px-5 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-sakura-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
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
              AI 辨識中...
            </>
          ) : (
            <>
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                />
              </svg>
              AI 辨識
            </>
          )}
        </button>
      </div>

      {/* 錯誤訊息 */}
      {error && (
        <p className="mt-2.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}
