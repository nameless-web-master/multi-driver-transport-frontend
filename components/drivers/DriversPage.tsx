"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Heart, MapPin, Plane, Ship, Star, Truck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AddressSearchInput } from "@/components/ui/AddressSearchInput";
import {
  followDriver,
  listDrivers,
  listDriverZones,
  setTransporterZonesAvailability,
  unfollowDriver,
} from "@/lib/api";
import {
  formatDistanceKm,
  groupZonesByOwner,
  nearestZoneDistanceKm,
} from "@/lib/geo";
import { cn } from "@/lib/utils";
import type { DriverSummary, DriverZone, LatLngPoint } from "@/types";

function ModeBadge({ mode }: { mode: string }) {
  const Icon = mode === "air" ? Plane : mode === "sea" ? Ship : Truck;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
      <Icon className="h-3 w-3" /> {mode}
    </span>
  );
}

type CenterSource = "profile" | "custom";

interface DriverWithDistance extends DriverSummary {
  /** Minimum great-circle km from `center` to any of the driver's zones. */
  distance_km: number | null;
}

export function DriversPage() {
  const { user } = useAuth();
  const profileCenter: LatLngPoint | null = useMemo(() => {
    if (user?.lat != null && user?.lng != null) {
      return { lat: user.lat, lng: user.lng };
    }
    return null;
  }, [user?.lat, user?.lng]);

  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [zones, setZones] = useState<DriverZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<number | null>(null);
  const [availabilityPending, setAvailabilityPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Radius filter state
  const [radiusEnabled, setRadiusEnabled] = useState<boolean>(true);
  const [radiusKm, setRadiusKm] = useState<number>(50);
  const [centerSource, setCenterSource] = useState<CenterSource>("profile");
  const [customAddress, setCustomAddress] = useState("");
  const [customCenter, setCustomCenter] = useState<LatLngPoint | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [driverList, zoneList] = await Promise.all([listDrivers(), listDriverZones()]);
      setDrivers(driverList);
      setZones(zoneList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transporters");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // If the profile center isn't available, transparently fall back to custom.
  useEffect(() => {
    if (centerSource === "profile" && !profileCenter) {
      setCenterSource("custom");
    }
  }, [centerSource, profileCenter]);

  const activeCenter: LatLngPoint | null =
    centerSource === "profile" ? profileCenter : customCenter;

  const canFilterByRadius = radiusEnabled && activeCenter != null;

  async function toggleFollow(driver: DriverSummary) {
    setPending(driver.id);
    try {
      const result = driver.followed
        ? await unfollowDriver(driver.id)
        : await followDriver(driver.id);
      setDrivers((prev) =>
        prev.map((d) =>
          d.id === driver.id
            ? { ...d, followed: result.followed, trustworthiness: result.trustworthiness }
            : d
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Follow failed");
    } finally {
      setPending(null);
    }
  }

  const isAdmin = user?.role === "admin";

  const zonesByOwner = useMemo(() => groupZonesByOwner(zones), [zones]);

  function driverAllAvailable(driverId: number): boolean {
    const driverZones = zonesByOwner.get(driverId) ?? [];
    return driverZones.length > 0 && driverZones.every((z) => z.available);
  }

  function driverHasZones(driverId: number): boolean {
    return (zonesByOwner.get(driverId)?.length ?? 0) > 0;
  }

  async function toggleTransporterAvailability(driver: DriverSummary) {
    const driverZones = zonesByOwner.get(driver.id) ?? [];
    if (driverZones.length === 0) return;
    const next = !driverAllAvailable(driver.id);
    setAvailabilityPending(driver.id);
    setError(null);
    try {
      await setTransporterZonesAvailability(driver.id, next);
      setZones((prev) =>
        prev.map((z) => (z.owner_user_id === driver.id ? { ...z, available: next } : z))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Availability update failed");
    } finally {
      setAvailabilityPending(null);
    }
  }

  // Compute per-driver distance once whenever zones / drivers / center change.
  const driversWithDistance: DriverWithDistance[] = useMemo(() => {
    const byOwner = zonesByOwner;
    return drivers.map((d) => ({
      ...d,
      distance_km: activeCenter ? nearestZoneDistanceKm(activeCenter, byOwner.get(d.id)) : null,
    }));
  }, [drivers, zonesByOwner, activeCenter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchesQuery = (d: DriverSummary) =>
      !q ||
      d.full_name.toLowerCase().includes(q) ||
      d.company_name.toLowerCase().includes(q) ||
      d.phone.toLowerCase().includes(q);

    const list = driversWithDistance.filter((d) => {
      if (!matchesQuery(d)) return false;
      if (canFilterByRadius) {
        if (d.distance_km == null) return false;
        return d.distance_km <= radiusKm;
      }
      return true;
    });

    // Sort nearest first when a center is available, otherwise by trustworthiness.
    if (activeCenter) {
      list.sort((a, b) => {
        const ad = a.distance_km ?? Infinity;
        const bd = b.distance_km ?? Infinity;
        if (ad !== bd) return ad - bd;
        return b.trustworthiness - a.trustworthiness;
      });
    }
    return list;
  }, [driversWithDistance, query, canFilterByRadius, radiusKm, activeCenter]);

  const withDistanceCount = driversWithDistance.filter((d) => d.distance_km != null).length;

  return (
    <div className="px-6 pb-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Find transporters near a location
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Search center</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={centerSource === "profile" ? "primary" : "outline"}
                  onClick={() => setCenterSource("profile")}
                  disabled={!profileCenter}
                  title={
                    profileCenter
                      ? "Use the address on your profile"
                      : "Your profile has no coordinates — pick a custom address"
                  }
                >
                  My address
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={centerSource === "custom" ? "primary" : "outline"}
                  onClick={() => setCenterSource("custom")}
                >
                  Custom location
                </Button>
              </div>
              {centerSource === "custom" ? (
                <div className="mt-2 space-y-1">
                  <AddressSearchInput
                    value={customAddress}
                    onChange={(text) => {
                      setCustomAddress(text);
                      if (customCenter) setCustomCenter(null);
                    }}
                    onPick={(place) => {
                      setCustomAddress(place.label);
                      setCustomCenter({ lat: place.lat, lng: place.lng });
                    }}
                    placeholder="Search a shop, cafe, or address…"
                  />
                  {customCenter && (
                    <p className="text-xs text-muted-foreground font-mono">
                      {customCenter.lat.toFixed(5)}, {customCenter.lng.toFixed(5)}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  {profileCenter ? (
                    <>
                      Using your registered address ·{" "}
                      <span className="font-mono">
                        {profileCenter.lat.toFixed(5)}, {profileCenter.lng.toFixed(5)}
                      </span>
                    </>
                  ) : (
                    "Your profile has no coordinates yet."
                  )}
                </p>
              )}
            </div>

            <div>
              <Label>Radius (km)</Label>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={10000}
                  step={1}
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  className="flex-1 accent-primary"
                  disabled={!radiusEnabled || !activeCenter}
                  aria-label="Radius in kilometers"
                />
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))}
                  className="w-24"
                  disabled={!radiusEnabled || !activeCenter}
                />
              </div>
              <label
                className={cn(
                  "mt-2 flex items-center gap-2 text-sm cursor-pointer",
                  !activeCenter && "opacity-60"
                )}
              >
                <Checkbox
                  checked={radiusEnabled && activeCenter != null}
                  onChange={(e) => setRadiusEnabled(e.target.checked)}
                  disabled={!activeCenter}
                />
                Only show transporters within {radiusKm} km
              </label>
              <p className="mt-2 text-xs text-muted-foreground">
                This is an optional display filter, not a system limit. Uncheck the box above
                to browse all transporters worldwide. For long-distance shipments (e.g. sender
                and receiver on different continents), search near the pickup address, the
                delivery address, or turn the filter off.
              </p>
            </div>
          </div>

          {activeCenter && (
            <p className="text-xs text-muted-foreground">
              {withDistanceCount} of {drivers.length} transporters have zones with known coordinates ·
              showing {filtered.length} {canFilterByRadius ? `within ${radiusKm} km` : "(no radius filter)"}.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4" /> Transporters ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search by name, company, or phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          )}
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {canFilterByRadius
                ? `No transporters within ${radiusKm} km. Try increasing the radius or turning the filter off.`
                : "No transporters match your search."}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((d) => (
                <Card key={d.id} className="border-border">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="h-11 w-11 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
                        {d.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{d.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {d.company_name || "—"}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 px-2 py-0.5 text-xs font-medium">
                        <Star className="h-3 w-3" /> {d.trustworthiness}
                      </span>
                    </div>

                    {activeCenter && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <MapPin className="h-3 w-3 text-primary" />
                        {d.distance_km != null ? (
                          <span>
                            <span className="font-medium text-foreground">
                              {formatDistanceKm(d.distance_km)}
                            </span>{" "}
                            <span className="text-muted-foreground">to nearest zone</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            No zone coordinates available
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                      {d.transport_modes.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No zones yet</span>
                      ) : (
                        d.transport_modes.map((m) => <ModeBadge key={m} mode={m} />)
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Phone: <span className="font-mono">{d.phone || "—"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">Zones: {d.zone_count}</div>
                    {isAdmin && (
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                        <span className="text-xs text-muted-foreground">All zones available</span>
                        <Switch
                          checked={driverAllAvailable(d.id)}
                          onCheckedChange={() => toggleTransporterAvailability(d)}
                          disabled={!driverHasZones(d.id) || availabilityPending === d.id}
                          aria-label={`Set all zones for ${d.full_name} available`}
                        />
                      </div>
                    )}
                    <Button
                      type="button"
                      variant={d.followed ? "outline" : "primary"}
                      size="sm"
                      disabled={pending === d.id}
                      onClick={() => toggleFollow(d)}
                      className={cn("w-full")}
                    >
                      <Heart
                        className={cn(
                          "h-4 w-4",
                          d.followed ? "fill-current text-rose-500" : ""
                        )}
                      />
                      {d.followed ? "Following" : "Follow"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
