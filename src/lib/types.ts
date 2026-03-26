// === 資料型別定義 ===
// 白話：這個檔案定義了「資料長什麼樣子」，就像 Excel 的欄位標題

export interface User {
  id: string;
  name: string;
  role: "admin" | "user";
  created_at: string;
}

export interface Item {
  id: string;
  user_id: string;
  user_name?: string; // 關聯查詢用
  input_text: string | null;
  input_image_url: string | null;
  ai_product_name: string | null;
  ai_product_name_ja: string | null;
  ai_brand: string | null;
  ai_price_jpy: number | null;
  ai_price_twd: number | null;
  ai_exchange_rate: number | null;
  ai_where_to_buy: string[] | null;
  ai_product_url: string | null;
  ai_description: string | null;
  ai_confidence: "high" | "medium" | "low" | null;
  ai_summary: string | null; // 完整 AI 回覆 JSON
  status: "pending" | "bought" | "unavailable" | "out_of_stock";
  note: string | null;
  quantity: number;
  weight_g: number | null; // 商品重量（克），選填
  actual_price_jpy: number | null; // 實際購買日幣價格
  actual_quantity: number | null; // 實際購買數量
  created_at: string;
  updated_at: string;
}

export interface Variant {
  name: string;
  price_jpy: number;
}

export interface AiResponse {
  product_name_zh: string;
  product_name_ja: string;
  brand: string;
  estimated_price_jpy: number;
  estimated_price_twd: number;
  where_to_buy: string[];
  buy_url: string; // 使用者提供的 URL（非 AI 生成）
  description: string;
  confidence: "high" | "medium" | "low";
  variants: Variant[];
  selected_variant_index: number;
}

export interface ExchangeRate {
  rate: number; // 1 JPY = ? TWD
  updated_at: string;
}

// 可編輯的商品欄位
export interface EditableItemFields {
  ai_product_name?: string;
  ai_product_name_ja?: string;
  ai_brand?: string;
  ai_price_jpy?: number;
  ai_price_twd?: number;
  input_image_url?: string | null;
  ai_where_to_buy?: string[];
  ai_product_url?: string;
  quantity?: number;
  weight_g?: number | null;
  note?: string | null;
}

// 使用者 + 統計資訊（管理員用）
export interface UserWithStats {
  id: string;
  name: string;
  role: "admin" | "user";
  created_at: string;
  pin_hash: string | null;
  item_count: number;
  pending_count: number;
  bought_count: number;
}

// 狀態的中文對照
export const STATUS_MAP: Record<Item["status"], string> = {
  pending: "待處理",
  bought: "已買到",
  unavailable: "買不到",
  out_of_stock: "缺貨中",
};

export const STATUS_COLORS: Record<Item["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  bought: "bg-emerald-100 text-emerald-700",
  unavailable: "bg-gray-100 text-gray-600",
  out_of_stock: "bg-red-100 text-red-700",
};
