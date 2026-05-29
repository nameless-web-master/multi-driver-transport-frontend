"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MAP_EMPTY_CELLS } from "@/lib/mapConstants";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ConvertH3Response, DriverZone } from "@/types";

const H3MapView = dynamic(() => import("@/components/map/H3MapView").then((m) => m.H3MapView), {
  ssr: false,
  loading: () => (
    <div className="h-48 rounded-xl bg-muted animate-pulse flex items-center justify-center text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

export function ZoneDetailCard({
  zone,
  conversion,
}: {
  zone: DriverZone | null;
  conversion: ConvertH3Response | null;
}) {
  const savedZonesForMap = useMemo(() => (zone ? [zone] : []), [zone]);

  if (!zone) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Zone Detail</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Select a zone from the table to preview its H3 cells on the map.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {zone.driver_name} — {zone.zone_name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Resolution</p>
            <p className="font-medium">{zone.resolution}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Cells</p>
            <p className="font-medium">{zone.cell_count}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Transport mode</p>
            <p className="font-medium capitalize">{zone.transport_mode}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rate / cost</p>
            <p className="font-medium">
              {formatCurrency(Number(zone.rate_cost), zone.currency)}
              <span className="ml-1 text-xs text-muted-foreground">({zone.currency})</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Available</p>
            <p className="font-medium">{zone.available ? "Yes" : "No"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Trust payment forwarder</p>
            <p className="font-medium">{zone.trust_payment_forwarder ? "Yes" : "No"}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Created at</p>
            <p className="font-medium">{formatDate(zone.created_at)}</p>
          </div>
        </div>

        <div className="h-52 rounded-xl overflow-hidden border border-border">
          <H3MapView
            height="100%"
            resolution={zone.resolution}
            selectedCells={MAP_EMPTY_CELLS}
            savedZones={savedZonesForMap}
            focusZone={zone}
            conversion={conversion}
            interactive={false}
            showZoneTooltips={false}
          />
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">Sample H3 Cells</p>
          <div className="flex flex-wrap gap-2">
            {zone.h3_cells.slice(0, 8).map((cell) => (
              <span
                key={cell}
                className="rounded-full bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20 px-2.5 py-1 text-xs font-mono"
              >
                {cell}
              </span>
            ))}
            {zone.h3_cells.length > 8 && (
              <span className="text-xs text-muted-foreground self-center">
                +{zone.h3_cells.length - 8} more
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
