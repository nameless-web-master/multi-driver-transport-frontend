"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plane, Ship, Truck } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { MAP_EMPTY_CELLS } from "@/lib/mapConstants";
import { listDriverZones } from "@/lib/api";
import { isHubMode, normalizeTransportMode, TRANSPORT_MODE_META } from "@/lib/transportMode";
import { filterScheduleActiveZones } from "@/lib/zoneSchedule";
import type { DriverZone } from "@/types";

import { H3MapView } from "@/components/map/H3MapViewDynamic";

export function MapViewPage() {
  const { user } = useAuth();
  const [zones, setZones] = useState<DriverZone[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scheduleTick, setScheduleTick] = useState(() => Date.now());

  useEffect(() => {
    listDriverZones()
      .then(setZones)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load zones"));
  }, []);

  // Re-evaluate which zones are within their operation window every minute.
  useEffect(() => {
    const id = window.setInterval(() => setScheduleTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const now = useMemo(() => new Date(scheduleTick), [scheduleTick]);
  const activeZones = useMemo(() => filterScheduleActiveZones(zones, now), [zones, now]);

  const resolution = activeZones[0]?.resolution ?? zones[0]?.resolution ?? 9;
  const total = zones.length;
  const activeCount = activeZones.length;
  const counts = { land: 0, air: 0, sea: 0 };
  activeZones.forEach((z) => {
    if (z.transport_mode in counts) counts[z.transport_mode as keyof typeof counts] += 1;
  });

  // Air/sea zones are routes (departure → arrival terminal), not areas.
  const routeZones = useMemo(
    () => activeZones.filter((z) => isHubMode(normalizeTransportMode(z.transport_mode))),
    [activeZones]
  );
  // Routes missing terminal coordinates (e.g. created before the hub model).
  const incompleteRoutes = useMemo(
    () => routeZones.filter((z) => !z.departure_hub || !z.arrival_hub),
    [routeZones]
  );

  const subtitle =
    user?.role === "driver"
      ? "Your zones — drivers see only what they own."
      : "All driver zones — land as coverage areas, air/sea as terminal-to-terminal routes.";

  return (
    <DashboardShell title="Map View" subtitle={subtitle}>
      <div className="px-6 pb-8 space-y-6">
        <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatTile
            label="Zones"
            value={String(activeCount)}
            sub={`${activeCount} active now · ${total} total`}
          />
          <StatTile icon={<Truck className="h-4 w-4" />} label="Land" value={String(counts.land)} />
          <StatTile icon={<Plane className="h-4 w-4" />} label="Air" value={String(counts.air)} />
          <StatTile icon={<Ship className="h-4 w-4" />} label="Sea" value={String(counts.sea)} />
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-2">Legend</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-5 rounded bg-blue-500/30 border border-blue-500" />
                  Land coverage
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full border-2 border-white" style={{ background: "#22c55e" }} />
                  Departure terminal
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full border-2 border-white" style={{ background: "#f97316" }} />
                  Arrival terminal
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {incompleteRoutes.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {incompleteRoutes.length} air/sea{" "}
              {incompleteRoutes.length === 1 ? "route is" : "routes are"} missing terminal
              locations. Edit{" "}
              {incompleteRoutes.length === 1 ? "it" : "them"} on the Driver Zones page to set
              departure and arrival {incompleteRoutes.length === 1 ? "terminals" : "terminals"}.
            </span>
          </div>
        )}

        {routeZones.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Air &amp; sea routes</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2.5 px-4 font-medium">Mode</th>
                      <th className="py-2.5 px-4 font-medium">Route</th>
                      <th className="py-2.5 px-4 font-medium">Operation dates</th>
                      <th className="py-2.5 px-4 font-medium">Departure</th>
                      <th className="py-2.5 px-4 font-medium">Arrival</th>
                      <th className="py-2.5 px-4 font-medium">Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeZones.map((z) => {
                      const mode = normalizeTransportMode(z.transport_mode);
                      const meta = TRANSPORT_MODE_META[mode];
                      return (
                        <tr key={z.id} className="border-b border-border/70 last:border-0">
                          <td className="py-2.5 px-4">
                            <span className="inline-flex items-center gap-1.5">
                              {mode === "air" ? (
                                <Plane className="h-3.5 w-3.5" style={{ color: meta.color }} />
                              ) : (
                                <Ship className="h-3.5 w-3.5" style={{ color: meta.color }} />
                              )}
                              {meta.label}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-medium">{z.zone_name}</td>
                          <td className="py-2.5 px-4 text-muted-foreground">
                            {z.operation_start_date && z.operation_end_date
                              ? z.operation_start_date === z.operation_end_date
                                ? z.operation_start_date
                                : `${z.operation_start_date} → ${z.operation_end_date}`
                              : z.operation_date ?? "—"}
                          </td>
                          <td className="py-2.5 px-4">
                            {z.departure_hub ? (
                              <span>
                                <span className="text-green-600 font-medium">{z.departure_hub.name || "—"}</span>
                                {z.departure_time ? (
                                  <span className="text-muted-foreground"> · {z.departure_time}</span>
                                ) : null}
                              </span>
                            ) : (
                              <span className="text-amber-600">Not set</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            {z.arrival_hub ? (
                              <span>
                                <span className="text-orange-500 font-medium">{z.arrival_hub.name || "—"}</span>
                                {z.arrival_time ? (
                                  <span className="text-muted-foreground"> · {z.arrival_time}</span>
                                ) : null}
                              </span>
                            ) : (
                              <span className="text-amber-600">Not set</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                z.available
                                  ? "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20"
                                  : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border border-zinc-500/20"
                              }`}
                            >
                              {z.available ? "Yes" : "No"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Active zones</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {error && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                {error}
              </div>
            )}
            {activeZones.length === 0 && !error && (
              <p className="mb-3 text-sm text-muted-foreground">
                No zones are within their operation window right now. Expired or
                unscheduled zones are hidden from this map.
              </p>
            )}
            <H3MapView
              height={480}
              resolution={resolution}
              selectedCells={MAP_EMPTY_CELLS}
              savedZones={activeZones}
              interactive
            />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tracking-tight">{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
