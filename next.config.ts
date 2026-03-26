import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 移除 X-Powered-By: Next.js header（減少資訊暴露）
  poweredByHeader: false,

  // 啟用 gzip 壓縮（Vercel 預設開啟，明確宣告確保一致性）
  compress: true,

  images: {
    // 只允許 Supabase Storage 的圖片
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
      { protocol: "https", hostname: "image.uniqlo.com" },
    ],
    // 現代圖片格式優先順序
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
