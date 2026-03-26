import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC, Noto_Sans_JP } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

// next/font 自托管字型：build time 下載並由 Vercel CDN 提供
// 消除 render-blocking 的外部 googleapis.com 請求
const notoSansTC = Noto_Sans_TC({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-sans-tc",
  preload: false, // CJK 字元集太大，不預載
});

const notoSansJP = Noto_Sans_JP({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-sans-jp",
  preload: false,
});

export const metadata: Metadata = {
  title: "買い付けリスト | 日本代購清單",
  description: "朋友同事輕鬆提交代購需求，AI 自動辨識商品",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/icon.svg",
  },
  appleWebApp: {
    capable: true,
    // black-translucent：PWA 全螢幕時讓內容延伸到狀態列下方
    // 搭配 safe-area-inset 確保內容不被遮擋
    statusBarStyle: "black-translucent",
    title: "代購清單",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#fdf2f8",
  // viewport-fit=cover：讓頁面延伸到 Dynamic Island / 打孔相機下方
  viewportFit: "cover",
  // resizes-visual：Android Chrome 鍵盤彈出時只縮小視覺視窗，不改變佈局
  // 解決 sticky header 在 Android 鍵盤彈出後位置錯誤的問題
  interactiveWidget: "resizes-visual",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW" className={`${notoSansTC.variable} ${notoSansJP.variable}`}>
      <body className="font-sans text-gray-800 antialiased">
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
