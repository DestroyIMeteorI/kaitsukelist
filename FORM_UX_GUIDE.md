# 🌸 買い付けリスト — 表單 UX 優化指南

> **給 Claude Code 用的表單優化指令。**
> 建議在 AI 辨識優化做完之後再做這份。
>
> ## 使用方式
> 跟 Claude Code 說：「請讀 FORM_UX_GUIDE.md，從第 1 步開始」
> 一次一步，每步測試完再下一步。

---

## 🎯 兩種使用者、兩種痛點

### 👥 同事（委託代購的人）
- **痛點：不知道怎麼填，常漏填** → 我不清楚他到底要哪一款
- **使用場景：** 在台灣用手機/電腦，把想買的東西加到清單
- **需求：** 越簡單越好，最好貼個連結或打幾個字就搞定

### 🧳 我自己（去日本代購的人）
- **痛點：** 在日本現場用手機操作，需要快速確認/更新狀態
- **使用場景：** 站在藥妝店裡，一手拿商品一手滑手機
- **需求：** 快速標記「已買」、拍照記錄實際價格、一覽所有人的清單

---

## 🚀 第 1 步：簡化同事的新增流程 — 「一個輸入框搞定」

> **核心想法：** 目前手動表單有 7 個欄位，同事不知道該填哪些。
> 改成：**只要一個輸入框**（文字/網址/圖片），AI 填剩下的。
> 只有 AI 搞不定的時候，才展開完整表單讓他手動改。

### 目前的問題

截圖裡的「📝 手動新增」表單有 7 個欄位：商品名稱、品牌、商品網址、日幣價格、圖片、數量、重量。
同事常常只填「商品名稱」和「價格」就送出，少了品牌和規格 → 你在日本不知道到底要買哪個。

### 改法

把首頁的新增流程改成**兩階段**：

**第一階段：極簡輸入（所有人都用這個）**
```
┌─────────────────────────────────────────┐
│  想買什麼？（打字、貼網址、或拍照上傳）       │
│  ┌─────────────────────────────────────┐ │
│  │ 例：白色戀人 36入                      │ │
│  └─────────────────────────────────────┘ │
│              [📷 拍照/選圖]  [🔍 搜尋]     │
└─────────────────────────────────────────┘
```

**第二階段：AI 回傳結果 → 使用者確認/修改 → 加入清單**
```
┌─────────────────────────────────────────┐
│  🌸 AI 辨識結果                           │
│                                          │
│  石屋製菓 白色戀人                         │
│                                          │
│  📦 選擇規格：                            │
│  ○ 12入  ¥792  (≈NT$159)                │
│  ○ 24入  ¥1,566 (≈NT$315)               │
│  ● 36入  ¥2,160 (≈NT$434)  ← AI 推薦    │
│  ○ 54入  ¥3,240 (≈NT$651)               │
│                                          │
│  📝 備註給代購人（選填）                    │
│  ┌─────────────────────────────────────┐ │
│  │ 例：要白巧克力那款，不要黑巧克力          │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  [✏️ 修改細節]  [✅ 確認加入清單]           │
└─────────────────────────────────────────┘
```

只有按「✏️ 修改細節」才展開完整的手動編輯表單（品牌、價格、重量等）。

### 具體改法

在 `src/components/SubmitForm.tsx`（或相關元件）裡：

```tsx
// 新增一個狀態控制「兩階段」流程
type FormStage = 'input' | 'confirm' | 'manual-edit';
const [stage, setStage] = useState<FormStage>('input');
const [aiResult, setAiResult] = useState<AiResponse | null>(null);

// 第一階段：只顯示一個輸入框 + 拍照按鈕
// 第二階段：顯示 AI 結果卡片 + variants 選擇 + 備註框
// manual-edit：展開完整的 7 欄位表單（跟現在一樣）
```

**variants 選擇 UI（重要！）：**
```tsx
{/* AI 回傳的 variants 用 radio button 讓使用者選 */}
{aiResult?.variants && aiResult.variants.length > 1 && (
  <div className="space-y-2">
    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
      選擇規格
    </p>
    {aiResult.variants.map((v, i) => (
      <label
        key={i}
        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all
          ${selectedVariant === i
            ? 'border-pink-400 bg-pink-50'
            : 'border-gray-200 hover:border-pink-200'
          }`}
      >
        <div className="flex items-center gap-2">
          <input
            type="radio"
            name="variant"
            checked={selectedVariant === i}
            onChange={() => setSelectedVariant(i)}
            className="text-pink-500"
          />
          <span className="text-sm">{v.name}</span>
          {i === aiResult.selected_variant_index && (
            <span className="text-xs bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full">
              AI 推薦
            </span>
          )}
        </div>
        <div className="text-right">
          <span className="text-sm font-medium">¥{v.price_jpy.toLocaleString()}</span>
          <span className="text-xs text-gray-400 ml-1">
            ≈NT${Math.round(v.price_jpy * exchangeRate).toLocaleString()}
          </span>
        </div>
      </label>
    ))}
  </div>
)}
```

### 為什麼這樣改

- 同事只需打字或貼網址 → AI 搞定剩下的 → 點一下確認
- 有 variants 選擇，同事就不會漏填「到底要哪個規格」
- 備註欄位放在最顯眼的位置，方便寫「要大盒」「不要抹茶口味」等
- 手動編輯只在需要時才展開，不會嚇到不懂的同事

---

## 🚀 第 2 步：新增「備註給代購人」欄位的引導

> **核心想法：** 同事常漏掉重要資訊（要哪個口味、哪個尺寸）。
> 用 placeholder 提示他們該寫什麼。

### 改法

在備註欄位加上**情境化的 placeholder**：

```tsx
// 根據商品類型顯示不同的 placeholder 提示
function getNotePlaceholder(productName: string): string {
  const lower = productName.toLowerCase();

  if (lower.includes('衣') || lower.includes('shirt') || lower.includes('heattech')
      || lower.includes('uniqlo') || lower.includes('gu')) {
    return '例：要 M 號、黑色';
  }
  if (lower.includes('鞋') || lower.includes('shoe') || lower.includes('靴')) {
    return '例：要 26cm / US 8';
  }
  if (lower.includes('口味') || lower.includes('味') || lower.includes('pocky')
      || lower.includes('kit kat') || lower.includes('零食')) {
    return '例：要抹茶口味，不要草莓';
  }
  if (lower.includes('面膜') || lower.includes('化妝') || lower.includes('美容')
      || lower.includes('護膚') || lower.includes('防曬')) {
    return '例：要清爽型，不要滋潤型';
  }
  if (lower.includes('藥') || lower.includes('胃') || lower.includes('感冒')
      || lower.includes('痠痛') || lower.includes('貼布')) {
    return '例：要大盒裝 / 要加強版';
  }
  // 通用
  return '備註給代購人（口味、尺寸、顏色、特殊需求等）';
}
```

---

## 🚀 第 3 步：代購人現場模式 — 快速操作 UI

> **核心想法：** 你在日本藥妝店裡，一手拿商品一手滑手機。
> 需要：① 快速看清單 ② 一鍵標記已買 ③ 拍照記錄 ④ 輸入實際金額

### 改法：在 admin 頁面加一個「現場模式」按鈕

```tsx
// 在 /admin 頁面加一個切換按鈕
const [fieldMode, setFieldMode] = useState(false);

// 現場模式 UI：每個商品變成簡潔的卡片，大按鈕
{fieldMode ? (
  // === 現場模式 ===
  <div className="space-y-3">
    {items.map(item => (
      <div
        key={item.id}
        className={`p-4 rounded-xl border-2 transition-all
          ${item.status === 'bought'
            ? 'border-green-300 bg-green-50 opacity-60'
            : 'border-pink-200 bg-white'
          }`}
      >
        {/* 第一行：商品名 + 委託人 */}
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="font-medium text-base">{item.ai_product_name}</p>
            <p className="text-xs text-gray-400">{item.user_name} 委託</p>
          </div>
          <span className="text-lg font-bold text-pink-600">
            ¥{item.ai_price_jpy?.toLocaleString()}
          </span>
        </div>

        {/* 第二行：備註（如果有的話，用醒目樣式） */}
        {item.note && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-2">
            <p className="text-sm text-yellow-800">📝 {item.note}</p>
          </div>
        )}

        {/* 第三行：操作按鈕 — 大而好按 */}
        {item.status !== 'bought' ? (
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => markAsBought(item.id)}
              className="flex-1 py-3 bg-green-500 text-white rounded-xl text-base font-medium
                         active:scale-95 transition-transform"
            >
              ✅ 已買到
            </button>
            <button
              onClick={() => markAsUnavailable(item.id)}
              className="py-3 px-4 bg-gray-200 text-gray-600 rounded-xl text-sm
                         active:scale-95 transition-transform"
            >
              ❌ 沒貨
            </button>
          </div>
        ) : (
          <p className="text-center text-green-600 text-sm mt-2">
            ✅ 已購買 — ¥{item.actual_price_jpy?.toLocaleString() || '?'}
          </p>
        )}
      </div>
    ))}
  </div>
) : (
  // === 一般模式（現有的 admin UI）===
  // ... 現有程式碼
)}
```

### 「已買到」的彈出框 — 快速輸入實際金額

按下「✅ 已買到」後，彈出一個簡潔的 modal：

```tsx
// 已買到確認 Modal
function BoughtModal({ item, onConfirm, onClose }) {
  const [actualPrice, setActualPrice] = useState(
    String(item.ai_price_jpy || '')
  );
  const [actualQty, setActualQty] = useState('1');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
      <div className="bg-white rounded-t-2xl w-full max-w-md p-6 pb-8
                      animate-slideInUp safe-area-bottom">
        <h3 className="text-lg font-bold mb-4">
          ✅ 確認購買 — {item.ai_product_name}
        </h3>

        {/* 實際金額 — 大輸入框，好按 */}
        <label className="text-sm text-gray-500">實際金額（日幣）</label>
        <div className="flex items-center gap-2 mt-1 mb-4">
          <span className="text-lg">¥</span>
          <input
            type="number"
            inputMode="numeric"  // 手機會彈出數字鍵盤
            value={actualPrice}
            onChange={e => setActualPrice(e.target.value)}
            className="flex-1 text-2xl font-bold text-center py-3 border-2
                       border-pink-300 rounded-xl focus:border-pink-500"
            autoFocus
          />
        </div>

        {/* 數量 */}
        <label className="text-sm text-gray-500">數量</label>
        <div className="flex items-center gap-4 mt-1 mb-6">
          <button
            onClick={() => setActualQty(String(Math.max(1, Number(actualQty) - 1)))}
            className="w-12 h-12 rounded-xl bg-gray-100 text-xl active:scale-95"
          >
            −
          </button>
          <span className="text-2xl font-bold w-8 text-center">{actualQty}</span>
          <button
            onClick={() => setActualQty(String(Number(actualQty) + 1))}
            className="w-12 h-12 rounded-xl bg-gray-100 text-xl active:scale-95"
          >
            +
          </button>
        </div>

        {/* 確認 / 取消 */}
        <button
          onClick={() => onConfirm({
            actual_price_jpy: Number(actualPrice),
            actual_quantity: Number(actualQty),
            status: 'bought',
          })}
          className="w-full py-4 bg-green-500 text-white rounded-xl text-lg
                     font-bold active:scale-95 transition-transform"
        >
          確認購買 ¥{Number(actualPrice).toLocaleString()}
        </button>
        <button
          onClick={onClose}
          className="w-full py-3 text-gray-400 text-sm mt-2"
        >
          取消
        </button>
      </div>
    </div>
  );
}
```

### 現場模式的重點設計

| 設計決策 | 原因 |
|---------|------|
| 大按鈕（py-3 以上） | 站在店裡單手操作，要好按 |
| `inputMode="numeric"` | 手機自動彈出數字鍵盤 |
| Modal 從底部滑出 | 手機單手操作更順 |
| 備註用黃底醒目顯示 | 在現場一眼就看到同事的特殊需求 |
| 已買的商品半透明 + 排到最後 | 快速知道還剩幾個要買 |
| 預填 AI 估價 | 大部分商品價格差不多，改幾個數字就好 |

---

## 🚀 第 4 步：新增「委託必填提示」— 防止同事漏填

> **核心想法：** 與其事後追問，不如在他送出前就問清楚。

### 改法：AI 辨識後，根據商品類型自動追問

```typescript
// 在 AI 辨識結果回來後，判斷是否需要追問
interface FollowUpQuestion {
  id: string;
  question: string;
  options?: string[];  // 有選項 = 選擇題，沒選項 = 填空
}

function getFollowUpQuestions(result: AiResponse): FollowUpQuestion[] {
  const questions: FollowUpQuestion[] = [];
  const name = (result.product_name_zh + ' ' + result.product_name_ja).toLowerCase();

  // 衣服 → 問尺寸
  if (name.match(/衣|shirt|heattech|uniqlo|gu|ジャケット|パンツ|tシャツ/)) {
    questions.push({
      id: 'size',
      question: '👕 請選擇尺寸',
      options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '不確定（幫我選）'],
    });
    questions.push({
      id: 'color',
      question: '🎨 想要什麼顏色？',
      options: ['黑', '白', '灰', '深藍', '其他（備註說明）', '都可以'],
    });
  }

  // 鞋子 → 問尺寸
  if (name.match(/鞋|shoe|靴|スニーカー|サンダル/)) {
    questions.push({
      id: 'shoe_size',
      question: '👟 鞋子尺寸（日本 cm）',
      options: ['23cm', '24cm', '25cm', '26cm', '27cm', '28cm', '其他'],
    });
  }

  // 有多口味/多規格但使用者沒選 → 提醒
  if (result.variants && result.variants.length > 3) {
    questions.push({
      id: 'variant_confirm',
      question: `📦 這個商品有 ${result.variants.length} 種規格，你確定要上面選的那個嗎？`,
      options: ['對，就那個', '我再看看'],
    });
  }

  // 數量 > 1 的常見商品
  if (name.match(/面膜|pack|マスク|貼布|パッチ/)) {
    questions.push({
      id: 'quantity',
      question: '📦 要幾個？（這類商品通常會多買）',
      options: ['1個就好', '2個', '3個', '越多越好'],
    });
  }

  return questions;
}
```

**前端 UI：在 AI 結果和「確認加入」按鈕之間插入追問**

```tsx
{followUpQuestions.length > 0 && (
  <div className="space-y-3 my-4">
    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
      幫代購人確認一下
    </p>
    {followUpQuestions.map(q => (
      <div key={q.id} className="bg-gray-50 rounded-xl p-3">
        <p className="text-sm font-medium mb-2">{q.question}</p>
        {q.options ? (
          <div className="flex flex-wrap gap-2">
            {q.options.map(opt => (
              <button
                key={opt}
                onClick={() => setFollowUpAnswer(q.id, opt)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-all
                  ${followUpAnswers[q.id] === opt
                    ? 'bg-pink-500 text-white'
                    : 'bg-white border border-gray-200 hover:border-pink-300'
                  }`}
              >
                {opt}
              </button>
            ))}
          </div>
        ) : (
          <input
            type="text"
            placeholder="請輸入..."
            onChange={e => setFollowUpAnswer(q.id, e.target.value)}
            className="w-full p-2 border rounded-lg text-sm"
          />
        )}
      </div>
    ))}
  </div>
)}
```

追問的答案會自動合併到商品的 `note` 欄位：
```typescript
// 送出時，把追問答案合併到 note
function buildNote(userNote: string, followUpAnswers: Record<string, string>): string {
  const parts = [];
  if (followUpAnswers.size) parts.push(`尺寸: ${followUpAnswers.size}`);
  if (followUpAnswers.color) parts.push(`顏色: ${followUpAnswers.color}`);
  if (followUpAnswers.shoe_size) parts.push(`鞋碼: ${followUpAnswers.shoe_size}`);
  if (followUpAnswers.quantity && followUpAnswers.quantity !== '1個就好') {
    parts.push(`數量需求: ${followUpAnswers.quantity}`);
  }
  if (userNote) parts.push(userNote);
  return parts.join(' / ');
}
```

---

## 🚀 第 5 步：清單頁面「進度一覽」

> **核心想法：** 同事最想知道的就是「買了沒」「花多少錢」。
> 加一個一目了然的統計區。

### 改法：在 /list 頁面頂部加統計卡片

```tsx
// 清單統計
function ListStats({ items, exchangeRate }) {
  const total = items.length;
  const bought = items.filter(i => i.status === 'bought').length;
  const pending = items.filter(i => i.status === 'pending').length;
  const totalJpy = items
    .filter(i => i.status === 'bought')
    .reduce((sum, i) => sum + (i.actual_price_jpy || i.ai_price_jpy || 0), 0);

  return (
    <div className="grid grid-cols-3 gap-2 mb-4">
      <div className="bg-pink-50 rounded-xl p-3 text-center">
        <p className="text-2xl font-bold text-pink-600">{pending}</p>
        <p className="text-xs text-gray-500">待購買</p>
      </div>
      <div className="bg-green-50 rounded-xl p-3 text-center">
        <p className="text-2xl font-bold text-green-600">{bought}</p>
        <p className="text-xs text-gray-500">已買到</p>
      </div>
      <div className="bg-amber-50 rounded-xl p-3 text-center">
        <p className="text-2xl font-bold text-amber-600">
          ¥{totalJpy.toLocaleString()}
        </p>
        <p className="text-xs text-gray-500">
          ≈NT${Math.round(totalJpy * exchangeRate).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
```

### 同時在每個商品卡片加「狀態標籤」

```tsx
// 商品卡片上方的狀態 badge
function StatusBadge({ status }: { status: string }) {
  const config = {
    pending: { text: '⏳ 等待購買', bg: 'bg-gray-100', color: 'text-gray-600' },
    bought: { text: '✅ 已買到', bg: 'bg-green-100', color: 'text-green-700' },
    unavailable: { text: '❌ 買不到', bg: 'bg-red-100', color: 'text-red-600' },
    out_of_stock: { text: '😢 缺貨中', bg: 'bg-yellow-100', color: 'text-yellow-700' },
  }[status] || { text: status, bg: 'bg-gray-100', color: 'text-gray-600' };

  return (
    <span className={`text-xs px-2 py-1 rounded-full ${config.bg} ${config.color}`}>
      {config.text}
    </span>
  );
}
```

---

## 🚀 第 6 步：手動表單欄位簡化

> **核心想法：** 截圖裡的 7 欄位表單太多了。只保留必要的，其他收起來。

### 改法：分成「必填」和「進階」兩區

```
┌─ 必填 ─────────────────────────────────┐
│  商品名稱 *                              │
│  ┌────────────────────────────────────┐  │
│  │ 白色戀人 36入                        │  │
│  └────────────────────────────────────┘  │
│                                          │
│  日幣價格 *        數量                   │
│  ┌─────────────┐  ┌────────────┐         │
│  │ ¥ 2160      │  │  − 1 +    │         │
│  └─────────────┘  └────────────┘         │
│                                          │
│  📝 備註給代購人                           │
│  ┌────────────────────────────────────┐  │
│  │ 要白巧克力款                         │  │
│  └────────────────────────────────────┘  │
├─────────────────────────────────────────┤
│  ▼ 更多選項（品牌、網址、圖片、重量）        │
└─────────────────────────────────────────┘
```

```tsx
const [showAdvanced, setShowAdvanced] = useState(false);

// 必填區
<div className="space-y-3">
  {/* 商品名稱 */}
  <Input label="商品名稱" required ... />

  {/* 價格 + 數量 同一行 */}
  <div className="grid grid-cols-2 gap-3">
    <Input label="日幣價格" type="number" inputMode="numeric" required ... />
    <QuantitySelector value={qty} onChange={setQty} />
  </div>

  {/* 備註 — 放在必填區裡面！讓同事看到就填 */}
  <Textarea
    label="📝 備註給代購人"
    placeholder={getNotePlaceholder(productName)}
    ...
  />
</div>

{/* 進階選項 — 預設收起 */}
<button
  onClick={() => setShowAdvanced(!showAdvanced)}
  className="text-sm text-gray-400 mt-2"
>
  {showAdvanced ? '▲ 收起' : '▼ 更多選項（品牌、網址、圖片、重量）'}
</button>

{showAdvanced && (
  <div className="space-y-3 mt-2 pt-3 border-t border-gray-100">
    <Input label="品牌（選填）" ... />
    <Input label="商品網址（選填）" ... />
    <ImageUpload label="商品圖片（選填）" ... />
    <Input label="重量 g（選填）" type="number" ... />
  </div>
)}
```

---

## 📊 預期效果

| 改了什麼 | 改之前 | 改之後 |
|---------|--------|--------|
| 同事新增商品 | 要填 7 欄，常漏填 | **打字/貼網址 → AI 填好 → 點確認** |
| 漏填口味/尺寸 | 常發生 | **AI 自動追問，選一下就好** |
| 你在日本操作 | 小按鈕不好按 | **現場模式：大按鈕、底部 modal** |
| 標記已買 + 實際金額 | 要進編輯模式 | **一鍵標記 + 彈出數字鍵盤** |
| 同事查進度 | 要一個一個看 | **統計卡片：待買/已買/花費一目了然** |
| 手動表單 | 7 欄一字排開 | **3 必填 + 4 收起** |

---

## 🔧 Claude Code 指令清單

```
第 1 步：
請讀 FORM_UX_GUIDE.md 第 1 步，把 SubmitForm 改成兩階段流程：
第一階段只有一個輸入框 + 拍照；
第二階段顯示 AI 結果卡片 + variants radio 選擇 + 備註 + 確認按鈕。
只有按「修改細節」才展開完整表單。

第 2 步：
請讀 FORM_UX_GUIDE.md 第 2 步，在備註欄加上 getNotePlaceholder 動態 placeholder

第 3 步：
請讀 FORM_UX_GUIDE.md 第 3 步，在 /admin 頁面加一個「現場模式」切換，
現場模式下商品卡片要有大按鈕（已買到/沒貨），
按已買到要彈出底部 modal 輸入實際金額和數量

第 4 步：
請讀 FORM_UX_GUIDE.md 第 4 步，在 AI 結果確認畫面加入 getFollowUpQuestions 追問，
追問答案自動合併到 note 欄位

第 5 步：
請讀 FORM_UX_GUIDE.md 第 5 步，在 /list 頁面頂部加 ListStats 統計卡片，
每個商品卡片加 StatusBadge

第 6 步：
請讀 FORM_UX_GUIDE.md 第 6 步，把手動新增表單改成必填 3 欄 + 收起的進階選項
```
