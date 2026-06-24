"use client";

import { cellToLatLng, isValidCell } from "h3-js";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listDriverZones } from "@/lib/api";
import type { DriverZone } from "@/types";

interface CellRow {
  cell: string;
  zones: string[];
  resolution: number;
  lat: number | null;
  lng: number | null;
}

export function H3CellsPage() {
  const [zones, setZones] = useState<DriverZone[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    listDriverZones()
      .then(setZones)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      );
  }, []);

  const cells = useMemo<CellRow[]>(() => {
    const map = new Map<string, CellRow>();
    for (const zone of zones) {
      for (const cell of zone.h3_cells) {
        const existing = map.get(cell);
        if (existing) {
          existing.zones.push(zone.zone_name);
        } else {
          // Each cell maps to a single geographic center point. We surface
          // that lat/lng instead of the raw H3 index because the index is
          // meaningless to end users.
          let lat: number | null = null;
          let lng: number | null = null;
          if (isValidCell(cell)) {
            [lat, lng] = cellToLatLng(cell);
          }
          map.set(cell, {
            cell,
            zones: [zone.zone_name],
            resolution: zone.resolution,
            lat,
            lng,
          });
        }
      }
    }
    return Array.from(map.values());
  }, [zones]);

  return (
    <DashboardShell
      title="Cells"
      subtitle="Inventory of coverage cells across all transport zones, shown as map coordinates."
    >
      <div className="px-6 pb-8">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle>
              {cells.length} unique cell{cells.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto overflow-y-auto">
            <table className="w-full text-sm flex-1">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Latitude</th>
                  <th className="py-2 pr-4 font-medium">Longitude</th>
                  <th className="py-2 pr-4 font-medium">Resolution</th>
                  <th className="py-2 font-medium">Zones</th>
                </tr>
              </thead>
              <tbody>
                {cells.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No cells yet. Create transport zones to populate this
                      view.
                    </td>
                  </tr>
                )}
                {cells.map((row) => (
                  <tr
                    key={row.cell}
                    className="border-b border-border/70 last:border-0"
                  >
                    <td className="py-2 pr-4 font-mono text-xs">
                      {row.lat != null ? row.lat.toFixed(6) : "—"}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {row.lng != null ? row.lng.toFixed(6) : "—"}
                    </td>
                    <td className="py-2 pr-4">{row.resolution}</td>
                    <td className="py-2 text-muted-foreground">
                      {row.zones.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
