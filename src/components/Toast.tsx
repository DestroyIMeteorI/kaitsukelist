"use client";

import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const TYPE_STYLES: Record<ToastType, { bg: string; icon: string }> = {
  success: { bg: "bg-emerald-500", icon: "✓" },
  error:   { bg: "bg-red-500",     icon: "✕" },
  info:    { bg: "bg-sakura-500",  icon: "ℹ" },
};

function ToastMessage({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [leaving, setLeaving] = useState(false);
  const style = TYPE_STYLES[toast.type];

  useEffect(() => {
    const timer = setTimeout(() => {
      setLeaving(true);
      setTimeout(() => onDismiss(toast.id), 260);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      className={`
        flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lg
        ${style.bg}
        ${leaving ? "animate-slide-out-right" : "animate-slide-in-right"}
      `}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/25 text-xs font-bold">
        {style.icon}
      </span>
      <span className="leading-snug">{toast.message}</span>
      <button
        onClick={() => { setLeaving(true); setTimeout(() => onDismiss(toast.id), 260); }}
        className="ml-1 shrink-0 opacity-70 transition-opacity hover:opacity-100"
        aria-label="關閉"
      >
        ✕
      </button>
    </div>
  );
}

export default function Toast({ toasts, onDismiss }: ToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-4 z-50 flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastMessage toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}

// Hook for easy usage
let _counter = 0;
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  function show(message: string, type: ToastType = "info") {
    const id = String(++_counter);
    setToasts((prev) => [...prev, { id, type, message }]);
  }

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return { toasts, show, dismiss };
}
