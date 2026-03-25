import { test, expect } from "@playwright/test";
import { mockAuthApi, mockExchangeRate } from "./helpers";

test.describe("登入流程", () => {
  test.beforeEach(async ({ page }) => {
    await mockExchangeRate(page);
  });

  // ── 步驟指示器 ──────────────────────────────────────────
  test("首頁顯示步驟指示器與 Logo", async ({ page }) => {
    await page.goto("/");
    // 用 heading role 避免匹配到 <title> 標籤
    await expect(page.getByRole("heading", { name: "買い付けリスト" })).toBeVisible();
    // 步驟 1 圓點（用精確文字 + 父層 class 避免 strict mode 衝突）
    const step1 = page.locator("div.rounded-full", { hasText: "1" }).first();
    await expect(step1).toBeVisible();
    const step2 = page.locator("div.rounded-full", { hasText: "2" }).first();
    await expect(step2).toBeVisible();
  });

  // ── 名字欄位驗證 ─────────────────────────────────────────
  test("名字為空時按鈕停用（無法送出）", async ({ page }) => {
    await page.goto("/");
    const btn = page.getByRole("button", { name: "繼續 →" });
    // 初始狀態：名字空白，按鈕停用
    await expect(btn).toBeDisabled();

    // 輸入名字後啟用
    await page.getByLabel("你的名字").fill("小明");
    await expect(btn).not.toBeDisabled();

    // 清空後再次停用
    await page.getByLabel("你的名字").clear();
    await expect(btn).toBeDisabled();
  });

  // ── 新使用者流程 ─────────────────────────────────────────
  test("新使用者：輸入名字 → 設定 PIN → 進入清單", async ({ page }) => {
    await page.goto("/");
    await mockAuthApi(page, { checkExists: false, registerSuccess: true });

    // 步驟 1：輸入名字
    await page.getByLabel("你的名字").fill("新使用者小花");
    await page.getByRole("button", { name: "繼續 →" }).click();

    // 步驟 2：出現「設定你的 PIN 碼」
    await expect(page.getByText("設定你的 PIN 碼")).toBeVisible();
    // 步驟 1 圓點應顯示 ✓
    await expect(page.getByText("✓")).toBeVisible();

    // 輸入 4 位 PIN → 自動送出（handlePinChange 會 auto-submit）
    await page.getByPlaceholder("• • • •").fill("1234");
    await page.waitForURL("/list", { timeout: 10000 });
    expect(page.url()).toContain("/list");
  });

  // ── 既有使用者流程 ───────────────────────────────────────
  test("既有使用者：輸入名字 → 輸入 PIN → 進入清單", async ({ page }) => {
    await page.goto("/");
    await mockAuthApi(page, { checkExists: true, checkHasPin: true, loginSuccess: true });

    await page.getByLabel("你的名字").fill("老使用者阿明");
    await page.getByRole("button", { name: "繼續 →" }).click();

    await expect(page.getByText("歡迎回來，老使用者阿明！")).toBeVisible();

    await page.getByPlaceholder("• • • •").fill("5678");
    await page.waitForURL("/list", { timeout: 10000 });
  });

  // ── PIN 錯誤 ─────────────────────────────────────────────
  test("PIN 錯誤時顯示錯誤訊息且不跳轉", async ({ page }) => {
    await page.goto("/");
    await mockAuthApi(page, { checkExists: true, checkHasPin: true, loginError: "PIN 碼錯誤" });

    await page.getByLabel("你的名字").fill("阿明");
    await page.getByRole("button", { name: "繼續 →" }).click();
    await page.getByPlaceholder("• • • •").fill("0000");

    await expect(page.getByText("PIN 碼錯誤")).toBeVisible();
    expect(page.url()).not.toContain("/list");
  });

  // ── PIN 顯示/隱藏 ────────────────────────────────────────
  test("眼睛圖示可切換 PIN 顯示/隱藏", async ({ page }) => {
    await page.goto("/");
    await mockAuthApi(page, { checkExists: false });

    await page.getByLabel("你的名字").fill("小測試");
    await page.getByRole("button", { name: "繼續 →" }).click();

    const pinInput = page.getByPlaceholder("• • • •");
    await expect(pinInput).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "顯示 PIN" }).click();
    await expect(pinInput).toHaveAttribute("type", "text");

    await page.getByRole("button", { name: "隱藏 PIN" }).click();
    await expect(pinInput).toHaveAttribute("type", "password");
  });

  // ── 返回步驟 ─────────────────────────────────────────────
  test("PIN 頁點「重新輸入名字」回到步驟 1", async ({ page }) => {
    await page.goto("/");
    await mockAuthApi(page, { checkExists: false });

    await page.getByLabel("你的名字").fill("小測試");
    await page.getByRole("button", { name: "繼續 →" }).click();
    await expect(page.getByText("設定你的 PIN 碼")).toBeVisible();

    await page.getByRole("button", { name: "← 重新輸入名字" }).click();
    await expect(page.getByLabel("你的名字")).toBeVisible();
  });

  // ── 管理員入口 ──────────────────────────────────────────
  test("點擊管理員入口跳轉到 /admin", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "管理員入口" }).click();
    await page.waitForURL("/admin");
    // 使用 heading role 避免 strict mode 衝突
    await expect(page.getByRole("heading", { name: "管理後台" })).toBeVisible();
  });

  // ── 桌面兩欄版面 ─────────────────────────────────────────
  test("桌面版顯示左欄功能說明", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    // 桌面版才顯示的功能列表
    await expect(page.getByText("輸入文字或拍照，AI 自動辨識商品")).toBeVisible();
    await expect(page.getByText("即時日幣 → 台幣換算")).toBeVisible();
  });
});
