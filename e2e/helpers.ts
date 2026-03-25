import { Page, Route } from "@playwright/test";

// ===== API Mock Helpers =====

/** Mock /api/auth */
export async function mockAuthApi(page: Page, overrides: {
  checkExists?: boolean;
  checkHasPin?: boolean;
  loginSuccess?: boolean;
  loginError?: string;
  registerSuccess?: boolean;
} = {}) {
  await page.route("/api/auth", async (route: Route) => {
    const body = await route.request().postDataJSON();
    if (body.action === "check") {
      await route.fulfill({
        json: { exists: overrides.checkExists ?? false, hasPin: overrides.checkHasPin ?? false },
      });
    } else if (body.action === "login") {
      if (overrides.loginError) {
        await route.fulfill({ status: 401, json: { success: false, error: overrides.loginError } });
      } else {
        await route.fulfill({ json: { success: overrides.loginSuccess ?? true } });
      }
    } else {
      await route.fulfill({ json: { success: overrides.registerSuccess ?? true } });
    }
  });
}

/** Mock /api/exchange-rate */
export async function mockExchangeRate(page: Page, rate = 0.212) {
  await page.route("/api/exchange-rate", (route) =>
    route.fulfill({ json: { rate, updated_at: "2026-03-26T00:00:00Z" } })
  );
}

/** Mock /api/identify */
export async function mockIdentifyApi(page: Page, productName = "資生堂防曬乳") {
  await page.route("/api/identify", (route) =>
    route.fulfill({
      json: {
        success: true,
        exchange_rate: 0.212,
        data: {
          product_name_zh: productName,
          product_name_ja: "アネッサ パーフェクトUV",
          brand: "資生堂",
          description: "高防護防曬乳液",
          estimated_price_jpy: 1800,
          estimated_price_twd: 382,
          where_to_buy: ["藥妝店", "唐吉訶德"],
          buy_url: null,
          confidence: "high",
        },
      },
    })
  );
}

/** Mock 所有 Supabase REST 呼叫（items + users）*/
export async function mockSupabaseRest(page: Page, items: object[] = MOCK_ITEMS) {
  // items REST: GET 回傳假清單，其他操作回傳成功
  await page.route("**/rest/v1/items**", (route) => {
    const method = route.request().method();
    if (method === "GET") return route.fulfill({ json: items });
    return route.fulfill({ json: items[0] ?? {} }); // POST / PATCH / DELETE
  });
  // users REST: 回傳測試使用者
  await page.route("**/rest/v1/users**", (route) =>
    route.fulfill({
      json: [{ id: "test-user-id", name: "測試小明", pin_hash: "abc123", created_at: "2026-03-26T00:00:00Z" }],
    })
  );
}

/**
 * 設定 Supabase Auth session 到 localStorage
 * Supabase v2 的 getSession() 先讀 localStorage，token 未過期不發網路請求
 *
 * 注意：supabaseUrl 在 Node.js 端讀取（playwright.config.ts 已載入 .env.local）
 *       不可在 page.evaluate() 中讀取 process.env（瀏覽器沒有 process 物件）
 */
export async function setSupabaseSession(page: Page): Promise<boolean> {
  // 在 Node.js 端取得 Supabase URL（playwright.config.ts 載入了 .env.local）
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;

  try {
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    const key = `sb-${projectRef}-auth-token`;
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;

    // 把 session 寫入 localStorage（在瀏覽器端執行，但參數從 Node.js 傳入）
    await page.evaluate(
      ({ k, data }) => localStorage.setItem(k, JSON.stringify(data)),
      {
        k: key,
        data: {
          access_token: "test-access-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: expiresAt,
          refresh_token: "test-refresh-token",
          user: {
            id: "admin-id",
            email: "admin@test.com",
            role: "authenticated",
            app_metadata: { provider: "email" },
            user_metadata: {},
          },
        },
      }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * 列表頁共用設定：
 * 1. 預填 localStorage（userName + 快取），讓頁面跳過 Supabase 直接顯示
 * 2. mock 匯率
 * 3. mock Supabase REST（供新增/刪除等操作使用）
 */
export async function setupListPage(page: Page, items = MOCK_ITEMS) {
  const mockUser = { id: "test-user-id", name: "測試小明", pin_hash: "abc", created_at: "2026-03-26T00:00:00Z" };

  await mockExchangeRate(page);
  await mockSupabaseRest(page, items);

  // 先 goto 建立同源後再設定 localStorage
  await page.goto("/");
  await page.evaluate(
    ({ user, its }) => {
      localStorage.setItem("userName", user.name);
      // 預填快取：讓 init() 第一時間讀到資料，不等 Supabase
      localStorage.setItem(`kaitsuke_items_${user.name}`, JSON.stringify({ user, items: its }));
    },
    { user: mockUser, its: items }
  );

  await page.goto("/list");
}

/**
 * Admin 頁共用設定（已登入狀態）
 */
export async function setupAdminLoggedIn(page: Page, items = MOCK_ITEMS) {
  await mockExchangeRate(page);
  await mockSupabaseRest(page, items);

  // 去一個同源頁面後設定 session
  await page.goto("/");
  await setSupabaseSession(page);

  // Mock Supabase Auth 相關端點（避免 token refresh 失敗）
  await page.route("**/auth/v1/**", (route) => {
    const url = route.request().url();
    if (url.includes("logout")) return route.fulfill({ status: 204 });
    return route.fulfill({
      json: {
        access_token: "test-access-token",
        token_type: "bearer",
        expires_in: 3600,
        user: { id: "admin-id", email: "admin@test.com" },
      },
    });
  });

  await page.goto("/admin");
}

// ===== 假資料 =====
export const MOCK_ITEMS = [
  {
    id: "item-1",
    user_id: "test-user-id",
    user_name: "測試小明",
    users: { name: "測試小明" },
    input_text: "資生堂防曬乳",
    input_image_url: null,
    ai_product_name: "資生堂防曬乳",
    ai_product_name_ja: "アネッサ パーフェクトUV",
    ai_brand: "資生堂",
    ai_price_jpy: 1800,
    ai_price_twd: 382,
    ai_exchange_rate: 0.212,
    ai_where_to_buy: ["藥妝店"],
    ai_product_url: null,
    ai_description: null,
    ai_confidence: "high",
    ai_summary: null,
    status: "pending",
    quantity: 1,
    weight_g: 100,
    note: null,
    created_at: "2026-03-26T00:00:00Z",
    updated_at: "2026-03-26T00:00:00Z",
  },
  {
    id: "item-2",
    user_id: "test-user-id",
    user_name: "測試小明",
    users: { name: "測試小明" },
    input_text: "樂敦眼藥水",
    input_image_url: null,
    ai_product_name: "樂敦眼藥水",
    ai_product_name_ja: "ロート目薬",
    ai_brand: "樂敦",
    ai_price_jpy: 800,
    ai_price_twd: 170,
    ai_exchange_rate: 0.212,
    ai_where_to_buy: ["藥妝店", "松本清"],
    ai_product_url: null,
    ai_description: null,
    ai_confidence: "high",
    ai_summary: null,
    status: "bought",
    quantity: 2,
    weight_g: 50,
    note: "要買藍色包裝",
    created_at: "2026-03-25T00:00:00Z",
    updated_at: "2026-03-26T00:00:00Z",
  },
];
