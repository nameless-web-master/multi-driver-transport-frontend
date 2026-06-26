"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  dismissToast,
  getToastsSnapshot,
  subscribeToasts,
  type ToastVariant,
} from "@/lib/toast";

function variantStyles(variant: ToastVariant): string {
  switch (variant) {
    case "success":
      return "border-green-400 bg-green-50 text-green-950 dark:border-green-700 dark:bg-green-950 dark:text-green-50";
    case "error":
      return "border-red-400 bg-red-50 text-red-950 dark:border-red-700 dark:bg-red-950 dark:text-red-50";
    default:
      return "border-border bg-card text-foreground";
  }
}

export function Toaster() {
  const [mounted, setMounted] = useState(false);
  const toasts = useSyncExternalStore(
    subscribeToasts,
    getToastsSnapshot,
    () => [],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || toasts.length === 0) return null;

  return createPortal(
    <div
      className="fixed top-20 right-4 z-[9999] flex w-[min(calc(100vw-2rem),24rem)] flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto rounded-xl border-2 px-4 py-3 text-sm shadow-2xl flex items-start gap-3",
            variantStyles(toast.variant),
          )}
          role="alert"
        >
          <p className="flex-1 leading-snug font-medium">{toast.message}</p>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            className="shrink-0 rounded-md p-0.5 opacity-70 hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
