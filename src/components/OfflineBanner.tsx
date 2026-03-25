"use client";

// 離線時顯示在頁面頂部的提示條
export default function OfflineBanner() {
  return (
    <div className="banner-safe fixed left-0 right-0 z-50 bg-orange-500 px-4 text-center text-sm font-medium text-white shadow-md">
      📡 目前離線 — 顯示的是快取資料，新增功能暫時停用
    </div>
  );
}
