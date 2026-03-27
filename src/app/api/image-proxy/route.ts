import { NextRequest, NextResponse } from "next/server";

// 允許代理的域名白名單（購物網站 + 圖片 CDN）
const ALLOWED_HOSTS = [
  // --- 大型電商 ---
  "amazon.co.jp", "www.amazon.co.jp",
  "rakuten.co.jp", "item.rakuten.co.jp", "www.rakuten.co.jp",
  "shopping.yahoo.co.jp", "store.shopping.yahoo.co.jp",

  // --- 家電量販 ---
  "kakaku.com", "www.kakaku.com",
  "yodobashi.com", "www.yodobashi.com",
  "biccamera.com", "www.biccamera.com",

  // --- 藥妝 / 美妝 ---
  "matsukiyo.co.jp", "www.matsukiyo.co.jp",
  "cosme.net", "www.cosme.net", "www.cosme.com",
  "sundrug.co.jp", "www.sundrug.co.jp",

  // --- 服飾 ---
  "uniqlo.com", "www.uniqlo.com",
  "gu-global.com", "www.gu-global.com",
  "zozo.jp", "www.zozotown.com",

  // --- 生活雜貨 ---
  "muji.com", "www.muji.com",
  "loft.co.jp", "www.loft.co.jp",
  "nitori-net.jp", "www.nitori-net.jp",

  // --- 折扣 / 食品 ---
  "donki.com", "www.donki.com",
  "royce.com", "www.royce.com",
  "ishiya-shop.jp", "www.ishiya-shop.jp",
  "calbee.co.jp", "www.calbee.co.jp",

  // --- 圖片 CDN（各平台實際存圖的域名）---
  "images-amazon.com",          // Amazon 商品圖片
  "media-amazon.com",           // Amazon media CDN
  "ssl-images-amazon.com",      // Amazon SSL 圖片
  "r.r10s.jp",                  // 樂天 CDN
  "yimg.jp",                    // Yahoo Japan 圖片 CDN
];

function isAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return ALLOWED_HOSTS.some(
      (h) => u.hostname === h || u.hostname.endsWith(`.${h}`)
    );
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  if (!isAllowed(url)) {
    return new NextResponse("URL not allowed", { status: 403 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/webp,image/avif,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return new NextResponse("Image fetch failed", { status: 404 });
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return new NextResponse("Not an image", { status: 400 });
    }

    // 限制大小 3MB，防止 OOM
    const MAX_SIZE = 3 * 1024 * 1024;
    const contentLength = Number(res.headers.get("content-length") || 0);
    if (contentLength > MAX_SIZE) {
      return new NextResponse("Image too large", { status: 400 });
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_SIZE) {
      return new NextResponse("Image too large", { status: 400 });
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Image fetch failed", { status: 404 });
  }
}
