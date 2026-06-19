"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MAP_EMPTY_CELLS } from "@/lib/mapConstants";
import { formatCellCoords, formatDistanceKm, haversineKm } from "@/lib/geo";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatZoneScheduleLabel } from "@/lib/zoneSchedule";
import type { ConvertH3Response, DriverZone } from "@/types";

import { H3MapView } from "@/components/map/H3MapViewDynamic";

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

  const isLine = zone.transport_mode === "air" || zone.transport_mode === "sea";
  const routeDistanceKm =
    isLine && zone.departure_hub && zone.arrival_hub
      ? haversineKm(
          { lat: zone.departure_hub.lat, lng: zone.departure_hub.lng },
          { lat: zone.arrival_hub.lat, lng: zone.arrival_hub.lng }
        )
      : null;

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
            <p className="text-xs text-muted-foreground">Base cost</p>
            <p className="font-medium">
              {zone.base_fee != null
                ? formatCurrency(Number(zone.base_fee), zone.currency)
                : "—"}
              <span className="ml-1 text-xs text-muted-foreground">({zone.currency})</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cost per km</p>
            <p className="font-medium">
              {zone.cost_per_km != null
                ? formatCurrency(Number(zone.cost_per_km), zone.currency)
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cost per hour</p>
            <p className="font-medium">
              {zone.cost_per_hour != null
                ? formatCurrency(Number(zone.cost_per_hour), zone.currency)
                : "—"}
            </p>
          </div>
          {isLine && (
            <div>
              <p className="text-xs text-muted-foreground">Route distance</p>
              <p className="font-medium">
                {routeDistanceKm != null ? formatDistanceKm(routeDistanceKm) : "—"}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Available</p>
            <p className="font-medium">{zone.available ? "Yes" : "No"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Schedule</p>
            <p className="font-medium">{formatZoneScheduleLabel(zone) ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Active now</p>
            <p className="font-medium">{zone.schedule_active ? "Yes" : "No"}</p>
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

        {(zone.transport_mode === "air" || zone.transport_mode === "sea") &&
        zone.departure_hub &&
        zone.arrival_hub ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
              <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">
                Departure {zone.transport_mode === "air" ? "airport" : "port"}
              </p>
              <p className="font-medium">{zone.departure_hub.name}</p>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {zone.departure_hub.lat.toFixed(4)}, {zone.departure_hub.lng.toFixed(4)}
              </p>
              {zone.departure_time && (
                <p className="text-xs text-muted-foreground mt-1">Departs {zone.departure_time}</p>
              )}
            </div>
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
              <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">
                Arrival {zone.transport_mode === "air" ? "airport" : "port"}
              </p>
              <p className="font-medium">{zone.arrival_hub.name}</p>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {zone.arrival_hub.lat.toFixed(4)}, {zone.arrival_hub.lng.toFixed(4)}
              </p>
              {zone.arrival_time && (
                <p className="text-xs text-muted-foreground mt-1">Arrives {zone.arrival_time}</p>
              )}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Sample Cell Coordinates</p>
            <div className="flex flex-wrap gap-2">
              {zone.h3_cells.slice(0, 8).map((cell) => (
                <span
                  key={cell}
                  className="rounded-full bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20 px-2.5 py-1 text-xs font-mono"
                >
                  {formatCellCoords(cell)}
                </span>
              ))}
              {zone.h3_cells.length > 8 && (
                <span className="text-xs text-muted-foreground self-center">
                  +{zone.h3_cells.length - 8} more
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
