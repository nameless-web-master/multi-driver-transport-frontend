"use client";

import { formatCellCoords } from "@/lib/geo";
import { ZoneMapTooltipDetails } from "@/components/map/ZoneMapTooltip";
import type { DriverZone } from "@/types";

interface Props {
  cell: string;
  zones: DriverZone[];
  zoneColorById: Map<number, string>;
}

/** Tooltip for an overlap transfer cell — lists every zone that shares the cell. */
export function TransferCellMapTooltip({ cell, zones, zoneColorById }: Props) {
  const covering = zones.filter((z) => z.h3_cells.includes(cell));

  return (
    <div className="text-xs leading-snug min-w-[220px] max-w-[360px]">
      <div className="font-semibold text-sm">Overlap transfer cell</div>
      <div className="font-mono text-muted-foreground mt-0.5">{formatCellCoords(cell)}</div>
      {covering.length > 0 ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {covering.map((zone) => (
            <div key={zone.id}>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Shared zone
              </div>
              <ZoneMapTooltipDetails
                zone={zone}
                color={zoneColorById.get(zone.id) ?? "#f59e0b"}
                compact
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground mt-2">
          Cell shared by connected transport zones on this route.
        </div>
      )}
    </div>
  );
}
