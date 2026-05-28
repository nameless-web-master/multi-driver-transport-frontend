"use client";

import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserGeolocation, type UserLocation } from "@/hooks/useUserGeolocation";

/**
 * Resolves the default geographic point the map should center on when no
 * other anchor geometry (selected cells, saved zones, conversion preview,
 * etc.) is available.
 *
 * Sender / Receiver — their address is stationary, so we use the lat/lng
 * captured on their profile. No browser permission prompt is needed.
 *
 * Driver / Admin / unauthenticated — the driver moves between zones, so
 * we use the current browser geolocation. Admins (and signed-out viewers)
 * fall back to the same browser geolocation since they have no fixed
 * address of their own.
 *
 * Profile-coords-missing senders/receivers also fall back to the browser
 * so they don't get stuck on the global default forever.
 *
 * The returned object is memoized by (lat, lng) so consumers using it as
 * a `useMemo` / `useEffect` dependency don't see a fresh reference on
 * every render and don't trigger needless re-work in the map.
 */
export function useMapDefaultLocation(): UserLocation | null {
  const { user } = useAuth();

  const hasProfileLocation =
    !!user &&
    (user.role === "sender" || user.role === "receiver") &&
    user.lat != null &&
    user.lng != null &&
    Number.isFinite(user.lat) &&
    Number.isFinite(user.lng);

  const { location: browserLocation } = useUserGeolocation({
    enabled: !hasProfileLocation,
  });

  const profileLat = hasProfileLocation ? (user!.lat as number) : null;
  const profileLng = hasProfileLocation ? (user!.lng as number) : null;
  const browserLat = browserLocation?.lat ?? null;
  const browserLng = browserLocation?.lng ?? null;

  return useMemo<UserLocation | null>(() => {
    if (profileLat != null && profileLng != null) {
      return { lat: profileLat, lng: profileLng };
    }
    if (browserLat != null && browserLng != null) {
      return { lat: browserLat, lng: browserLng };
    }
    return null;
  }, [profileLat, profileLng, browserLat, browserLng]);
}
