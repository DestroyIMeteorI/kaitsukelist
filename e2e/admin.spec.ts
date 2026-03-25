import { test, expect } from "@playwright/test";
import { mockExchangeRate, setupAdminLoggedIn, MOCK_ITEMS } from "./helpers";

// ── 未登入狀態 ──────────────────────────────────────────────
test.describe("管理後台 — 未登入", () => {
  test.beforeEach(async ({ page }) => {
    await mockExchangeRate(page);
    // Mock Supabase Auth session 回傳 null（未登入）
    await page.route("**/auth/v1/**", (route) =>
      route.fulfill({ json: { data: { session: null }, error: null } })
    );
  });

  test("未登入時顯示登入表單", async ({ page }) => {
    await page.goto("/admin");
    // 用 heading role 避免 strict mode（頁面同時有 h1 和 button 含「管理後台」文字）
    await expect(page.getByRole("heading", { name: "管理後台" })).toBeVisible();
    await expect(page.getByPlaceholder("管理員 Email")).toBeVisible();
    await expect(page.getByPlaceholder("密碼")).toBeVisible();
  });

  test("Email/密碼為空時登入按鈕停用", async ({ page }) => {
    await page.goto("/admin");
    const loginBtn = page.getByRole("button", { name: "進入管理後台" });
    await expect(loginBtn).toBeDisabled();

    await page.getByPlaceholder("管理員 Email").fill("admin@test.com");
    await expect(loginBtn).toBeDisabled(); // 只填 email，密碼仍空

    await page.getByPlaceholder("密碼").fill("password");
    await expect(loginBtn).not.toBeDisabled();
  });

  test("登入失敗顯示錯誤訊息", async ({ page }) => {
    await page.route("**/auth/v1/token**", (route) =>
      route.fulfill({ status: 400, json: { error: "invalid_credentials" } })
    );

    await page.goto("/admin");
    await page.getByPlaceholder("管理員 Email").fill("wrong@test.com");
    await page.getByPlaceholder("密碼").fill("wrongpass");
    await page.getByRole("button", { name: "進入管理後台" }).click();

    await expect(page.getByText("帳號或密碼錯誤，請確認後再試")).toBeVisible();
  });

  test("點「回首頁」跳到首頁", async ({ page }) => {
    await page.goto("/admin");
    await page.getByRole("button", { name: "← 回首頁" }).click();
    await page.waitForURL("/");
    expect(page.url()).not.toContain("/admin");
  });
});

// ── 已登入狀態 ───────────────────────────────────────────────
test.describe("管理後台 — 已登入", () => {
  test("顯示所有商品與使用者名稱", async ({ page }) => {
    await setupAdminLoggedIn(page);
    await expect(page.getByText("資生堂防曬乳")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("樂敦眼藥水")).toBeVisible();
    // showUser：商品卡上顯示使用者名稱
    await expect(page.locator("p.text-sakura-500").first()).toBeVisible();
  });

  test("顯示統計卡片", async ({ page }) => {
    await setupAdminLoggedIn(page);
    await expect(page.locator("div.bg-gray-50").getByText("總商品")).toBeVisible({ timeout: 10000 });
    // 用 parent 定位確保是統計卡片，非 ProductCard status badge / filter button
    await expect(page.locator("div.bg-amber-50").getByText("待處理")).toBeVisible();
    await expect(page.locator("div.bg-emerald-50").getByText("已買到")).toBeVisible();
  });

  test("有重量資料時顯示行李重量進度條", async ({ page }) => {
    await setupAdminLoggedIn(page);
    await expect(page.getByText(/行李重量/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/kg \/ 20 kg/)).toBeVisible();
  });

  test("搜尋可過濾商品", async ({ page }) => {
    await setupAdminLoggedIn(page);
    await expect(page.getByText("資生堂防曬乳")).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder("搜尋商品或使用者...").fill("眼藥水");
    await expect(page.getByText("樂敦眼藥水")).toBeVisible();
    await expect(page.getByText("資生堂防曬乳")).not.toBeVisible();
  });

  test("可切換排序方式（含重量）", async ({ page }) => {
    await setupAdminLoggedIn(page);
    await expect(page.getByText("資生堂防曬乳")).toBeVisible({ timeout: 10000 });

    const sortSelect = page.getByRole("combobox");
    await sortSelect.selectOption("weight_heavy");
    await expect(sortSelect).toHaveValue("weight_heavy");
  });

  test("點使用者名稱篩選按鈕可過濾", async ({ page }) => {
    const mixedItems = [
      { ...MOCK_ITEMS[0], id: "i-1", user_name: "小花", users: { name: "小花" } },
      { ...MOCK_ITEMS[1], id: "i-2", user_name: "阿明", users: { name: "阿明" } },
    ];
    await setupAdminLoggedIn(page, mixedItems);
    await expect(page.getByText("資生堂防曬乳")).toBeVisible({ timeout: 10000 });

    // 點「小花」篩選按鈕
    await page.getByRole("button", { name: /小花/ }).click();
    await expect(page.getByText("資生堂防曬乳")).toBeVisible();
    await expect(page.getByText("樂敦眼藥水")).not.toBeVisible();
  });

  test("點「✓ 已買」按鈕更新狀態，顯示 Toast", async ({ page }) => {
    await setupAdminLoggedIn(page);
    await expect(page.getByText("資生堂防曬乳")).toBeVisible({ timeout: 10000 });

    // pending 狀態的卡片（item-1）有「已買」按鈕
    const pendingCard = page.locator(".card-hover").filter({ hasText: "資生堂防曬乳" });
    await pendingCard.getByRole("button", { name: "✓ 已買" }).click();

    await expect(page.getByText("狀態已更新")).toBeVisible({ timeout: 5000 });
  });

  test("刪除需要 inline 兩步確認", async ({ page }) => {
    await setupAdminLoggedIn(page);
    await expect(page.getByText("資生堂防曬乳")).toBeVisible({ timeout: 10000 });

    const firstCard = page.locator(".card-hover").first();
    await firstCard.getByRole("button", { name: "🗑 刪除" }).click();

    await expect(firstCard.getByText("確定刪除？")).toBeVisible();
    await firstCard.getByRole("button", { name: "確定" }).click();

    await expect(page.getByText("已刪除商品")).toBeVisible({ timeout: 5000 });
  });

  test("點重新整理後重新載入商品", async ({ page }) => {
    await setupAdminLoggedIn(page);
    await expect(page.getByText("資生堂防曬乳")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "🔄 重新整理" }).click();
    // 商品重新載入後仍然存在
    await expect(page.getByText("資生堂防曬乳")).toBeVisible({ timeout: 5000 });
  });

  test("點登出後顯示登入表單", async ({ page }) => {
    await page.route("**/auth/v1/logout**", (route) => route.fulfill({ status: 204 }));
    await setupAdminLoggedIn(page);
    await expect(page.getByText("資生堂防曬乳")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "登出" }).click();
    await expect(page.getByPlaceholder("管理員 Email")).toBeVisible({ timeout: 5000 });
  });
});
