import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 移除 X-Powered-By: Next.js header（減少資訊暴露）
  poweredByHeader: false,

  // 啟用 gzip 壓縮（Vercel 預設開啟，明確宣告確保一致性）
  compress: true,

  images: {
    // 允許所有 HTTPS 來源（Supabase Storage 等外部圖片）
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
    // 現代圖片格式優先順序
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
