-- ============================================
-- 🌸 買い付けリスト — Supabase 資料庫設定
-- 把這整段 SQL 複製貼到 Supabase SQL Editor 執行
-- ============================================

-- 1️⃣ 建立 users 表（使用者）
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2️⃣ 建立 items 表（代購商品）
CREATE TABLE IF NOT EXISTS items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  input_text TEXT,
  input_image_url TEXT,
  ai_product_name TEXT,
  ai_product_name_ja TEXT,
  ai_brand TEXT,
  ai_price_jpy INTEGER,
  ai_price_twd INTEGER,
  ai_exchange_rate DECIMAL(10, 4),
  ai_where_to_buy TEXT[],
  ai_product_url TEXT,
  ai_description TEXT,
  ai_confidence TEXT CHECK (ai_confidence IN ('high', 'medium', 'low')),
  ai_summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'bought', 'unavailable', 'out_of_stock')),
  note TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3️⃣ 建立索引（加速查詢）
CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);

-- 4️⃣ 開啟 RLS（Row Level Security）隱私保護
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- 5️⃣ 設定 RLS 政策
-- 任何人都可以查詢/新增 users（因為用名字登入，不需要帳密）
CREATE POLICY "Anyone can read users" ON users FOR SELECT USING (true);
CREATE POLICY "Anyone can insert users" ON users FOR INSERT WITH CHECK (true);

-- 任何人都可以操作 items（前端會用 user_id 過濾，簡化架構）
CREATE POLICY "Anyone can read items" ON items FOR SELECT USING (true);
CREATE POLICY "Anyone can insert items" ON items FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update items" ON items FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete items" ON items FOR DELETE USING (true);

-- 6️⃣ 自動更新 updated_at 的觸發器
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ✅ 完成！
-- 接下來去 Storage 建立 bucket（下一步會告訴你怎麼做）
