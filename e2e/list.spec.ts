import { test, expect } from "@playwright/test";
import { mockExchangeRate, mockIdentifyApi, setupListPage, MOCK_ITEMS } from "./helpers";

test.describe("清單頁", () => {
  // ── 頁面基本顯示 ─────────────────────────────────────────
  test("顯示使用者名稱與匯率", async ({ page }) => {
    await setupListPage(page);
    await expect(page.getByText("測試小明 的清單")).toBeVisible();
    // 匯率文字（getByText 用正規表達式避免多餘空白問題）
    await expect(page.getByText(/¥1 ≈ NT\$0\.212/)).toBeVisible();
  });

  test("顯示商品列表統計卡片", async ({ page }) => {
    await setupListPage(page);
    await expect(page.getByText("資生堂防曬乳")).toBeVisible();
    await expect(page.getByText("樂敦眼藥水")).toBeVisible();
    // 統計區塊：找「商品數」標籤所在的卡片，再讀其數字（避免匹配到 $722 等含"2"的其他元素）
    const itemCountCard = page.locator("div.flex-1").filter({ hasText: "商品數" });
    await expect(itemCountCard.locator("p.text-2xl")).toHaveText("2");
  });

  test("空清單時顯示空狀態提示", async ({ page }) => {
    await setupListPage(page, []);
    await expect(page.getByText("還沒有商品")).toBeVisible();
  });

  // ── 未登入保護 ──────────────────────────────────────────
  test("未設定 userName 時跳回首頁", async ({ page }) => {
    await mockExchangeRate(page);
    await page.goto("/list");
    await page.waitForURL("/");
    expect(page.url()).not.toContain("/list");
  });

  // ── 搜尋功能 ─────────────────────────────────────────────
  test("搜尋可過濾商品", async ({ page }) => {
    await setupListPage(page);
    await page.getByPlaceholder("搜尋商品名稱...").fill("眼藥水");
    await expect(page.getByText("樂敦眼藥水")).toBeVisible();
    await expect(page.getByText("資生堂防曬乳")).not.toBeVisible();
  });

  test("搜尋無結果時顯示提示", async ({ page }) => {
    await setupListPage(page);
    await page.getByPlaceholder("搜尋商品名稱...").fill("不存在的商品xyz");
    await expect(page.getByText(/找不到符合/)).toBeVisible();
  });

  // ── 排序功能 ─────────────────────────────────────────────
  test("可切換排序方式", async ({ page }) => {
    await setupListPage(page);
    const sortSelect = page.getByRole("combobox");
    await sortSelect.selectOption("price_high");
    await expect(sortSelect).toHaveValue("price_high");
  });

  // ── AI 辨識流程 ──────────────────────────────────────────
  test("輸入文字後點 AI 辨識，顯示辨識結果卡片", async ({ page }) => {
    await setupListPage(page, []);
    await mockIdentifyApi(page);

    await page.getByPlaceholder(/輸入想買的商品/).fill("資生堂防曬乳");
    await page.getByRole("button", { name: "AI 辨識" }).click();

    await expect(page.getByText("🔍 AI 辨識結果")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("資生堂防曬乳")).toBeVisible();
    await expect(page.getByText("¥1,800")).toBeVisible();
  });

  test("點「加入清單」後出現成功 Toast", async ({ page }) => {
    await setupListPage(page, []);
    await mockIdentifyApi(page);

    await page.getByPlaceholder(/輸入想買的商品/).fill("資生堂防曬乳");
    await page.getByRole("button", { name: "AI 辨識" }).click();
    await expect(page.getByText("🔍 AI 辨識結果")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "✓ 加入清單" }).click();
    await expect(page.getByText("已加入清單！")).toBeVisible();
  });

  test("點「不需要」後辨識結果卡片消失", async ({ page }) => {
    await setupListPage(page, []);
    await mockIdentifyApi(page);

    await page.getByPlaceholder(/輸入想買的商品/).fill("資生堂防曬乳");
    await page.getByRole("button", { name: "AI 辨識" }).click();
    await expect(page.getByText("🔍 AI 辨識結果")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "不需要" }).click();
    await expect(page.getByText("🔍 AI 辨識結果")).not.toBeVisible();
  });

  // ── 刪除商品（inline 確認）──────────────────────────────
  // 用 .card-hover 精確定位 ProductCard（SubmitForm 不帶此 class）
  test("點刪除出現確認按鈕，再點確定才執行刪除", async ({ page }) => {
    await setupListPage(page);

    const firstCard = page.locator(".card-hover").first();
    await firstCard.getByRole("button", { name: "🗑 刪除" }).click();

    await expect(firstCard.getByText("確定刪除？")).toBeVisible();
    await expect(firstCard.getByRole("button", { name: "確定" })).toBeVisible();
    await expect(firstCard.getByRole("button", { name: "取消" })).toBeVisible();
  });

  test("點取消後確認按鈕消失、刪除按鈕重新出現", async ({ page }) => {
    await setupListPage(page);

    const firstCard = page.locator(".card-hover").first();
    await firstCard.getByRole("button", { name: "🗑 刪除" }).click();
    await expect(firstCard.getByText("確定刪除？")).toBeVisible();

    await firstCard.getByRole("button", { name: "取消" }).click();
    await expect(firstCard.getByText("確定刪除？")).not.toBeVisible();
    await expect(firstCard.getByRole("button", { name: "🗑 刪除" })).toBeVisible();
  });

  // ── 離線模式 ─────────────────────────────────────────────
  test("離線時顯示 OfflineBanner 並停用 AI 辨識", async ({ page }) => {
    await setupListPage(page);

    // 模擬網路斷線事件
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await page.context().setOffline(true);

    await expect(page.getByText(/目前離線/)).toBeVisible();

    // AI 辨識按鈕應被停用（SubmitForm disabled prop）
    const aiBtn = page.getByRole("button", { name: "AI 辨識" });
    await expect(aiBtn).toBeDisabled();

    // 恢復網路
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
  });

  // ── 切換身份 ────────────────────────────────────────────
  test("點切換身份後跳回首頁", async ({ page }) => {
    await setupListPage(page);
    await page.getByRole("button", { name: "切換身份" }).click();
    await page.waitForURL("/");
    expect(page.url()).not.toContain("/list");
  });
});
