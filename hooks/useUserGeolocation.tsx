"use client";

import { useEffect, useState } from "react";

export interface UserLocation {
  lat: number;
  lng: number;
}

export type GeolocationStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "unsupported";

const CACHE_KEY = "user-geolocation:v1";

function readCache(): UserLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserLocation>;
    if (
      typeof parsed.lat === "number" &&
      typeof parsed.lng === "number" &&
      Number.isFinite(parsed.lat) &&
      Number.isFinite(parsed.lng)
    ) {
      return { lat: parsed.lat, lng: parsed.lng };
    }
    return null;
  } catch {
    return null;
  }
}

function writeCache(location: UserLocation): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(location));
  } catch {
    // sessionStorage may be unavailable (private mode, disabled, quota) — non-fatal.
  }
}

/**
 * Reads the user's approximate geographic coordinates from the browser.
 *
 * Returns immediately with a cached value when available (so subsequent map
 * mounts within the same browser tab don't re-prompt or wait on the GPS).
 * The first request uses a short timeout and low accuracy — we only need a
 * starting view for the map, not a precise fix.
 *
 * Pass `enabled: false` to suppress the browser prompt entirely (e.g. for
 * users whose location is already known from their profile, so we never
 * trigger a permission dialog we don't need).
 */
export function useUserGeolocation(
  options: { enabled?: boolean } = {}
): {
  location: UserLocation | null;
  status: GeolocationStatus;
} {
  const { enabled = true } = options;
  const [location, setLocation] = useState<UserLocation | null>(() => readCache());
  const [status, setStatus] = useState<GeolocationStatus>(() =>
    readCache() ? "granted" : "idle"
  );

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (readCache()) return;
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }

    let cancelled = false;
    setStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        const next: UserLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        writeCache(next);
        setLocation(next);
        setStatus("granted");
      },
      () => {
        if (cancelled) return;
        setStatus("denied");
      },
      {
        enableHighAccuracy: false,
        maximumAge: 5 * 60 * 1000,
        timeout: 8000,
      }
    );

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { location, status };
}
