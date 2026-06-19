"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

/**
 * Single dynamic entry for H3MapView so every page shares one webpack chunk.
 * Retries once via full reload when the browser holds a stale chunk hash
 * (common after `npm run build` while `npm run dev` is open).
 */
function loadH3MapView(): Promise<ComponentType<import("./H3MapView").H3MapViewProps>> {
  return import("./H3MapView")
    .then((m) => m.H3MapView)
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      const isChunk =
        (err instanceof Error && err.name === "ChunkLoadError") ||
        message.includes("Loading chunk");
      if (isChunk && typeof window !== "undefined") {
        const key = "h3-map-chunk-retry";
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          window.location.reload();
          return new Promise(() => {});
        }
        sessionStorage.removeItem(key);
      }
      throw err;
    });
}

export const H3MapView = dynamic(loadH3MapView, {
  ssr: false,
  loading: () => (
    <div className="h-full min-h-[12rem] w-full rounded-xl bg-muted animate-pulse flex items-center justify-center text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});
