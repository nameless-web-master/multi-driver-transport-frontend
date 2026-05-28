"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Plane, Ship, Truck } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { MAP_EMPTY_CELLS } from "@/lib/mapConstants";
import { listDriverZones } from "@/lib/api";
import type { DriverZone } from "@/types";

const H3MapView = dynamic(() => import("@/components/map/H3MapView").then((m) => m.H3MapView), {
  ssr: false,
  loading: () => <div className="h-[480px] rounded-xl bg-muted animate-pulse" />,
});

export function MapViewPage() {
  const { user } = useAuth();
  const [zones, setZones] = useState<DriverZone[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listDriverZones()
      .then(setZones)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load zones"));
  }, []);

  const resolution = zones[0]?.resolution ?? 9;
  const total = zones.length;
  const counts = { land: 0, air: 0, sea: 0 };
  zones.forEach((z) => {
    if (z.transport_mode in counts) counts[z.transport_mode as keyof typeof counts] += 1;
  });

  const availableCount = zones.filter((z) => z.available).length;
  const unavailableCount = total - availableCount;

  const subtitle =
    user?.role === "driver"
      ? "Your zones — drivers see only what they own."
      : "All driver zones — available zones are solid, unavailable are dashed.";

  return (
    <DashboardShell title="Map View" subtitle={subtitle}>
      <div className="px-6 pb-8 space-y-6">
        <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatTile
            label="Zones"
            value={String(total)}
            sub={`${availableCount} available · ${unavailableCount} not`}
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
                  Available
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-5 rounded bg-blue-500/10 border border-dashed border-blue-500/60" />
                  Unavailable
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">All zones</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {error && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                {error}
              </div>
            )}
            <H3MapView
              height={480}
              resolution={resolution}
              selectedCells={MAP_EMPTY_CELLS}
              savedZones={zones}
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
