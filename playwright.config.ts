import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";

// 載入 .env.local 讓 test runner 也能讀到 NEXT_PUBLIC_* 變數
// (Next.js dev server 自動載入，但 Playwright Node.js 程序需要手動載入)
try {
  const envPath = resolve(__dirname, ".env.local");
  const content = readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  });
} catch { /* .env.local 不存在時忽略 */ }

// ===== 目標設備尺寸 =====
// CSS logical pixels（不是物理像素）
const DEVICES = {
  // Samsung S24+：384×832, DPR 3, Android Chrome
  "samsung-s24-plus": {
    viewport: { width: 384, height: 832 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  },
  // iPhone 16：393×852, DPR 3
  "iphone-16": {
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  },
  // iPhone 16 Plus：430×932, DPR 3
  "iphone-16-plus": {
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  },
  // iPhone 16 Pro：402×874, DPR 3
  "iphone-16-pro": {
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  },
  // iPhone 16 Pro Max：440×956, DPR 3
  "iphone-16-pro-max": {
    viewport: { width: 440, height: 956 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  },
  // iPhone 17 / 17 Pro（尺寸與 16 Pro 相同，等正式確認後更新）
  "iphone-17": {
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
  },
  // iPhone 17 Pro Max（尺寸與 16 Pro Max 相同，等正式確認後更新）
  "iphone-17-pro-max": {
    viewport: { width: 440, height: 956 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
  },
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },

  projects: [
    // ── 桌面 ──────────────────────────────────────────────
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"] },
    },

    // ── Samsung Android ────────────────────────────────────
    {
      name: "samsung-s24-plus",
      use: DEVICES["samsung-s24-plus"],
    },

    // ── iPhone 16 系列 ─────────────────────────────────────
    {
      name: "iphone-16",
      use: DEVICES["iphone-16"],
    },
    {
      name: "iphone-16-plus",
      use: DEVICES["iphone-16-plus"],
    },
    {
      name: "iphone-16-pro",
      use: DEVICES["iphone-16-pro"],
    },
    {
      name: "iphone-16-pro-max",
      use: DEVICES["iphone-16-pro-max"],
    },

    // ── iPhone 17 系列 ─────────────────────────────────────
    {
      name: "iphone-17",
      use: DEVICES["iphone-17"],
    },
    {
      name: "iphone-17-pro-max",
      use: DEVICES["iphone-17-pro-max"],
    },
  ],

  // 跑測試前自動啟動 dev server
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
