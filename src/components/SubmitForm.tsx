"use client";

import { useState, useRef } from "react";
import type { AiResponse } from "@/lib/types";

interface SubmitFormProps {
  /** AI 辨識完成後，使用者點「修改細節」才觸發 → 父層顯示完整 AiResultCard */
  onResult: (data: AiResponse, exchangeRate: number, inputText?: string, imageUrl?: string) => void;
  /** 使用者在確認卡片直接點「確認加入清單」→ 父層直接存入 DB */
  onQuickConfirm: (data: AiResponse, exchangeRate: number, note: string, imageUrl?: string) => void;
  userId: string;
  disabled?: boolean;
}

type FormStage = "input" | "confirm";

/** 根據商品名稱給備註框不同的 placeholder 提示 */
function getNotePlaceholder(productName: string): string {
  const lower = productName.toLowerCase();
  if (lower.match(/衣|shirt|heattech|uniqlo|gu|ジャケット|パンツ|tシャツ|スウェット|レギンス/)) {
    return "例：要 M 號、黑色";
  }
  if (lower.match(/鞋|shoe|靴|スニーカー|サンダル|ブーツ/)) {
    return "例：要 26cm / US 8";
  }
  if (lower.match(/口味|pocky|kit.?kat|零食|チョコ|キャンディ|グミ/)) {
    return "例：要抹茶口味，不要草莓";
  }
  if (lower.match(/面膜|化妝|美容|護膚|防曬|精華|乳液|化粧/)) {
    return "例：要清爽型，不要滋潤型";
  }
  if (lower.match(/藥|胃|感冒|痠痛|貼布|目薬|眼藥/)) {
    return "例：要大盒裝 / 要加強版";
  }
  return "備註給代購人（口味、尺寸、顏色、特殊需求等）";
}

interface FollowUpQuestion {
  id: string;
  question: string;
  options: string[];
}

/** 根據 AI 辨識結果，決定要追問哪些問題 */
function getFollowUpQuestions(result: AiResponse): FollowUpQuestion[] {
  // 有結構化 description（UNIQLO API 精準資料）→ 不需要追問
  if (result.description && result.description.includes('｜')) return [];
  const questions: FollowUpQuestion[] = [];
  const name = (result.product_name_zh + " " + result.product_name_ja).toLowerCase();

  // 衣服 → 問尺寸 + 顏色
  if (name.match(/衣|shirt|heattech|uniqlo|gu|ジャケット|パンツ|tシャツ|スウェット|レギンス|hoodie/)) {
    questions.push({
      id: "size",
      question: "👕 請選擇尺寸",
      options: ["XS", "S", "M", "L", "XL", "XXL", "不確定（幫我選）"],
    });
    questions.push({
      id: "color",
      question: "🎨 想要什麼顏色？",
      options: ["黑", "白", "灰", "深藍", "其他（備註說明）", "都可以"],
    });
  }

  // 鞋子 → 問尺寸
  if (name.match(/鞋|shoe|靴|スニーカー|サンダル|ブーツ/)) {
    questions.push({
      id: "shoe_size",
      question: "👟 鞋子尺寸（日本 cm）",
      options: ["23cm", "24cm", "24.5cm", "25cm", "25.5cm", "26cm", "26.5cm", "27cm", "其他"],
    });
  }

  // 面膜/多件商品 → 問數量
  if (name.match(/面膜|mask|マスク|貼布|パッチ|pack/)) {
    questions.push({
      id: "quantity",
      question: "📦 要幾個？（這類商品通常會多買）",
      options: ["1個就好", "2個", "3個", "越多越好"],
    });
  }

  // 有很多 variants → 確認一下
  if (result.variants.length > 3) {
    questions.push({
      id: "variant_confirm",
      question: `📦 這個商品有 ${result.variants.length} 種規格，確定要上面選的那個嗎？`,
      options: ["對，就那個", "讓代購人幫我選"],
    });
  }

  return questions;
}

/** 把追問答案合併到 note 欄位 */
function buildNote(userNote: string, followUpAnswers: Record<string, string>): string {
  const parts: string[] = [];
  if (followUpAnswers.size) parts.push(`尺寸: ${followUpAnswers.size}`);
  if (followUpAnswers.color && followUpAnswers.color !== "都可以") parts.push(`顏色: ${followUpAnswers.color}`);
  if (followUpAnswers.shoe_size) parts.push(`鞋碼: ${followUpAnswers.shoe_size}`);
  if (followUpAnswers.quantity && followUpAnswers.quantity !== "1個就好") {
    parts.push(`數量需求: ${followUpAnswers.quantity}`);
  }
  if (followUpAnswers.variant_confirm === "讓代購人幫我選") parts.push("規格請代購人協助選擇");
  if (userNote.trim()) parts.push(userNote.trim());
  return parts.join(" / ");
}

const LOADING_MSGS = [
  "🔍 AI 正在辨識商品...",
  "💰 查詢日幣價格中...",
  "🏪 尋找購買地點...",
  "📦 整理商品資訊...",
];

export default function SubmitForm({ onResult, onQuickConfirm, userId, disabled }: SubmitFormProps) {
  // === 第一階段：輸入 ===
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // === 第二階段：確認 ===
  const [stage, setStage] = useState<FormStage>("input");
  const [aiResult, setAiResult] = useState<AiResponse | null>(null);
  const [aiRate, setAiRate] = useState(0.2012);
  const [aiInputText, setAiInputText] = useState("");
  const [aiImageUrl, setAiImageUrl] = useState<string | undefined>();
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [noteText, setNoteText] = useState("");
  const [imgError, setImgError] = useState(false);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>({});

  const isUrlInput = /^https?:\/\//i.test(text.trim());
  const isDisabled = disabled || loading;

  // 處理圖片選擇 + 壓縮
  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("請上傳圖片檔案");
      return;
    }
    try {
      const imageCompression = (await import("browser-image-compression")).default;
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 800,
        maxSizeMB: 0.3,
        useWebWorker: true,
      });
      setImageFile(compressed);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(compressed);
      setError("");
    } catch {
      setError("圖片處理失敗，請換一張試試");
    }
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // 送出 AI 辨識請求
  async function handleSubmit() {
    if (!text.trim() && !imageFile) {
      setError("請輸入商品名稱或上傳圖片");
      return;
    }
    setLoading(true);
    setLoadingMsg(LOADING_MSGS[0]);
    setError("");

    let idx = 0;
    const timer = setInterval(() => {
      idx = (idx + 1) % LOADING_MSGS.length;
      setLoadingMsg(LOADING_MSGS[idx]);
    }, 1500);

    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        const { uploadImage } = await import("@/lib/supabase");
        imageUrl = await uploadImage(imageFile, userId);
      }

      const formData = new FormData();
      if (text.trim()) formData.append("text", text.trim());
      if (imageFile) formData.append("image", imageFile);

      const res = await fetch("/api/identify", { method: "POST", body: formData });
      const result = await res.json();

      if (!result.success) {
        setError(result.error || "AI 辨識失敗，請重試");
        return;
      }

      // 進入確認階段
      setAiResult(result.data);
      setAiRate(result.exchange_rate);
      setAiInputText(text.trim());
      setAiImageUrl(imageUrl);
      setSelectedVariant(result.data.selected_variant_index ?? 0);
      // 優先用 description（UNIQLO 等會帶 カラー/サイズ/商品番号），否則 fallback 到品番
      setNoteText(result.data.description || (result.data.product_code ? `品番: ${result.data.product_code}` : ""));
      setImgError(false);
      setFollowUpAnswers({});
      setStage("confirm");

      // 清空輸入（保留圖片預覽供確認階段使用）
      setText("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "發生錯誤，請重試");
    } finally {
      clearInterval(timer);
      setLoading(false);
      setLoadingMsg("");
    }
  }

  // 返回輸入階段
  function handleBack() {
    setStage("input");
    setAiResult(null);
    clearImage();
  }

  // 快速確認（不展開完整表單）
  function handleQuickConfirm() {
    if (!aiResult) return;
    const finalData: AiResponse = {
      ...aiResult,
      selected_variant_index: selectedVariant,
      estimated_price_jpy: aiResult.variants[selectedVariant]?.price_jpy ?? aiResult.estimated_price_jpy,
      estimated_price_twd: Math.round(
        (aiResult.variants[selectedVariant]?.price_jpy ?? aiResult.estimated_price_jpy) * aiRate
      ),
    };
    onQuickConfirm(finalData, aiRate, buildNote(noteText, followUpAnswers), aiImageUrl);
    handleBack();
  }

  // 點「修改細節」→ 交給父層顯示完整 AiResultCard（帶入已合併的 note）
  function handleDetailEdit() {
    if (!aiResult) return;
    const mergedNote = buildNote(noteText, followUpAnswers);
    // 把追問答案先合併回 noteText，讓完整表單可預填
    if (mergedNote !== noteText) setNoteText(mergedNote);
    const finalData: AiResponse = {
      ...aiResult,
      selected_variant_index: selectedVariant,
    };
    onResult(finalData, aiRate, aiInputText, aiImageUrl);
    handleBack();
  }

  // ── 確認階段 UI ──────────────────────────────
  if (stage === "confirm" && aiResult) {
    const CONF_MAP = {
      high: { label: "高信心", color: "bg-emerald-100 text-emerald-700" },
      medium: { label: "中信心", color: "bg-amber-100 text-amber-700" },
      low: { label: "低信心", color: "bg-red-100 text-red-700" },
    };
    const conf = CONF_MAP[aiResult.confidence] || CONF_MAP.medium;
    const currentPrice =
      aiResult.variants[selectedVariant]?.price_jpy ?? aiResult.estimated_price_jpy;
    const displayImage = imagePreview || (!imgError ? aiResult.product_image_url : undefined);

    return (
      <div className="animate-fadeIn rounded-2xl border-2 border-sakura-200 bg-white p-4 shadow-lg">
        {/* 標題列 */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
              🌸 AI 辨識結果
            </p>
            <h3 className="break-words text-base font-bold leading-snug text-gray-900">
              {aiResult.product_name_zh}
            </h3>
            {aiResult.product_name_ja && (
              <p className="mt-0.5 text-xs text-gray-400">{aiResult.product_name_ja}</p>
            )}
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${conf.color}`}>
            {conf.label}
          </span>
        </div>

        {/* 品番 + 圖片 */}
        <div className="mb-3 flex items-start gap-3">
          {displayImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayImage}
              alt="商品圖片"
              referrerPolicy="no-referrer"
              className="h-20 w-20 shrink-0 rounded-xl border border-gray-200 object-cover"
              onError={() => setImgError(true)}
            />
          )}
          <div className="min-w-0 flex-1 space-y-0.5">
            {aiResult.brand && (
              <p className="text-xs text-gray-500">{aiResult.brand}</p>
            )}
            {aiResult.product_code && (
              <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-500">
                品番 {aiResult.product_code}
              </span>
            )}
            {aiResult.description && (
              <p className="text-xs text-gray-400 leading-relaxed">{aiResult.description}</p>
            )}
          </div>
        </div>

        {/* Variants 選擇 */}
        {aiResult.variants.length > 1 && (
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
              📦 選擇規格
            </p>
            <div className="space-y-1.5">
              {aiResult.variants.map((v, i) => {
                const twd = Math.round(v.price_jpy * aiRate);
                const isSelected = i === selectedVariant;
                return (
                  <label
                    key={i}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-all ${
                      isSelected
                        ? "border-sakura-400 bg-sakura-50"
                        : "border-gray-200 hover:border-sakura-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="variant"
                        checked={isSelected}
                        onChange={() => setSelectedVariant(i)}
                        className="accent-pink-500"
                      />
                      <span className="text-sm">{v.name}</span>
                      {i === aiResult.selected_variant_index && (
                        <span className="rounded-full bg-sakura-100 px-2 py-0.5 text-xs text-sakura-600">
                          AI 推薦
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium">¥{v.price_jpy.toLocaleString()}</span>
                      <span className="ml-1 text-xs text-gray-400">≈NT${twd.toLocaleString()}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* 單一 variant 的價格顯示 */}
        {aiResult.variants.length <= 1 && currentPrice > 0 && (
          <div className="mb-3 flex items-baseline gap-2 rounded-xl bg-gray-50 px-4 py-2.5">
            <span className="text-lg font-bold text-gray-900">¥{currentPrice.toLocaleString()}</span>
            <span className="text-sm text-gray-400">
              ≈ NT${Math.round(currentPrice * aiRate).toLocaleString()}
            </span>
          </div>
        )}

        {/* 追問（依商品類型自動出現） */}
        {(() => {
          const questions = getFollowUpQuestions(aiResult);
          if (questions.length === 0) return null;
          return (
            <div className="mb-3 space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                幫代購人確認一下
              </p>
              {questions.map((q) => (
                <div key={q.id} className="rounded-xl bg-gray-50 p-3">
                  <p className="mb-2 text-sm font-medium text-gray-700">{q.question}</p>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() =>
                          setFollowUpAnswers((prev) => ({
                            ...prev,
                            [q.id]: prev[q.id] === opt ? "" : opt,
                          }))
                        }
                        className={`rounded-lg px-3 py-1.5 text-sm transition-all ${
                          followUpAnswers[q.id] === opt
                            ? "bg-sakura-500 text-white shadow-sm"
                            : "border border-gray-200 bg-white hover:border-sakura-300 text-gray-600"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* 備註欄 */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-gray-500">
            📝 備註給代購人（選填）
          </label>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder={getNotePlaceholder(aiResult.product_name_zh)}
            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm leading-relaxed placeholder:text-gray-400 focus:border-sakura-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sakura-100"
            rows={2}
          />
        </div>

        {/* 操作按鈕 */}
        <div className="flex gap-2">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-500 transition-colors hover:bg-gray-50"
          >
            ← 返回
          </button>
          <button
            onClick={handleDetailEdit}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
          >
            ✏️ 修改細節
          </button>
          <button
            onClick={handleQuickConfirm}
            className="ml-auto flex items-center gap-1.5 rounded-xl bg-sakura-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-sakura-600 active:scale-[0.98]"
          >
            ✅ 確認加入清單
          </button>
        </div>
      </div>
    );
  }

  // ── 第一階段：輸入 UI ──────────────────────────
  return (
    <div className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-opacity ${disabled ? "opacity-50" : ""}`}>
      {/* 文字/網址輸入 */}
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setError(""); }}
        placeholder={"輸入商品名稱、描述或貼上商品網址\n例：樂敦眼藥水、白色戀人 18枚、https://amazon.co.jp/..."}
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
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
          </svg>
          {imageFile ? "更換圖片" : "上傳圖片"}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
            disabled={isDisabled}
          />
        </label>

        {/* AI 辨識按鈕 */}
        <button
          onClick={handleSubmit}
          disabled={isDisabled || (!text.trim() && !imageFile)}
          className="ml-auto flex min-h-[48px] items-center gap-1.5 rounded-xl bg-sakura-500 px-5 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-sakura-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
              </svg>
              AI 辨識中...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              AI 辨識
            </>
          )}
        </button>
      </div>

      {/* Loading 動畫 */}
      {loadingMsg && (
        <div className="flex flex-col items-center gap-3 py-6 animate-fadeIn">
          <div className="text-2xl animate-spin" style={{ animationDuration: "2s" }}>🌸</div>
          <p className="text-sm text-gray-400 animate-pulse">{loadingMsg}</p>
        </div>
      )}

      {/* 錯誤訊息 */}
      {error && (
        <p className="mt-2.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}
