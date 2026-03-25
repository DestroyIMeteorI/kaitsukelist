import { createClient } from "@supabase/supabase-js";

// === Supabase 連線設定 ===
// 白話：這就像「開一扇門」連到雲端資料庫

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// 給前端（瀏覽器）用的 client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// === 使用者相關操作 ===

// 用名字找使用者，找不到就自動建立一個
export async function getOrCreateUser(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("名字不能是空的");

  // 先找找看有沒有這個名字
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("name", trimmed)
    .single();

  if (existing) return existing;

  // 沒有的話就新建一個
  const { data: newUser, error } = await supabase
    .from("users")
    .insert({ name: trimmed, role: "user" })
    .select()
    .single();

  if (error) throw error;
  return newUser;
}

// === 商品清單操作 ===

// 取得某個使用者的所有商品
export async function getUserItems(userId: string) {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// 取得所有人的商品（管理員用）
export async function getAllItems() {
  const { data, error } = await supabase
    .from("items")
    .select("*, users(name)")
    .order("created_at", { ascending: false });

  if (error) throw error;
  // 把 users.name 展開到 user_name
  return data?.map((item: any) => ({
    ...item,
    user_name: item.users?.name || "未知",
  }));
}

// 新增一個商品到清單
export async function addItem(item: {
  user_id: string;
  input_text?: string | null;
  input_image_url?: string | null;
  ai_product_name?: string | null;
  ai_product_name_ja?: string | null;
  ai_brand?: string | null;
  ai_price_jpy?: number | null;
  ai_price_twd?: number | null;
  ai_exchange_rate?: number | null;
  ai_where_to_buy?: string[] | null;
  ai_product_url?: string | null;
  ai_description?: string | null;
  ai_confidence?: string | null;
  ai_summary?: string | null;
  quantity?: number;
}) {
  const { data, error } = await supabase
    .from("items")
    .insert({
      ...item,
      status: "pending",
      quantity: item.quantity || 1,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 更新商品狀態（管理員用）
export async function updateItemStatus(
  itemId: string,
  status: string,
  note?: string
) {
  const { error } = await supabase
    .from("items")
    .update({
      status,
      note: note || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) throw error;
}

// 刪除商品
export async function deleteItem(itemId: string) {
  const { error } = await supabase.from("items").delete().eq("id", itemId);
  if (error) throw error;
}

// === 圖片上傳 ===

export async function uploadImage(file: File, userId: string) {
  const fileName = `${userId}/${Date.now()}-${file.name}`;

  const { data, error } = await supabase.storage
    .from("product-images")
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw error;

  // 取得公開網址
  const {
    data: { publicUrl },
  } = supabase.storage.from("product-images").getPublicUrl(data.path);

  return publicUrl;
}
