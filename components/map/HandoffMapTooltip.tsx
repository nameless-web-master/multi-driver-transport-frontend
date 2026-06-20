"use client";

import { formatCellCoords } from "@/lib/geo";
import type { H3MapHandoffMarker } from "@/components/map/H3MapView";
import { ZoneMapTooltipDetails } from "@/components/map/ZoneMapTooltip";

function handoffTypeLabel(connectionType: string | null | undefined): string {
  if (connectionType === "hub") return "Hub handoff";
  if (connectionType === "adjacent") return "Adjacent handoff";
  if (connectionType === "overlap") return "Transfer point";
  return "Handoff";
}

function zoneAtLabel(transport: string, zone: string | null | undefined): string {
  return zone ? `${transport} @ ${zone}` : transport;
}

/** Detailed tooltip for a land-zone transfer / handoff pin between two transporters. */
export function HandoffMapTooltip({ marker }: { marker: H3MapHandoffMarker }) {
  const hasDetails = marker.fromZoneDetail && marker.toZoneDetail;
  const fromAt = zoneAtLabel(marker.fromTransport, marker.fromZone);
  const toAt = zoneAtLabel(marker.toTransport, marker.toZone);

  return (
    <div className="text-xs leading-snug min-w-[240px] max-w-[360px]">
      <div className="font-semibold text-sm">
        {marker.index != null
          ? `Connection point #${marker.index}`
          : handoffTypeLabel(marker.connectionType)}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
        {handoffTypeLabel(marker.connectionType)}
      </div>
      <div className="font-medium mt-1">
        {fromAt} → {toAt}
      </div>
      {marker.transferCell && (
        <div className="text-muted-foreground mt-1">
          Transfer cell:{" "}
          <span className="font-mono text-foreground">{formatCellCoords(marker.transferCell)}</span>
        </div>
      )}

      {hasDetails ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Handing off from
            </div>
            <ZoneMapTooltipDetails
              zone={marker.fromZoneDetail!}
              color={marker.fromColor ?? "#3b82f6"}
              compact
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Handing off to
            </div>
            <ZoneMapTooltipDetails
              zone={marker.toZoneDetail!}
              color={marker.toColor ?? "#22c55e"}
              compact
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
