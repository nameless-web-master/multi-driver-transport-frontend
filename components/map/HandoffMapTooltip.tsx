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

interface Props {
  marker: H3MapHandoffMarker;
  /** `compact` = hover pin label; `full` = wide popup (default). */
  variant?: "compact" | "full";
}

/** Connection-point details — wide two-column layout for map popups. */
export function HandoffMapTooltip({ marker, variant = "full" }: Props) {
  const fromAt = zoneAtLabel(marker.fromTransport, marker.fromZone);
  const toAt = zoneAtLabel(marker.toTransport, marker.toZone);
  const type = handoffTypeLabel(marker.connectionType);

  if (variant === "compact") {
    return (
      <div className="text-xs leading-snug max-w-[280px]">
        <div className="font-semibold">
          {marker.index != null ? `Connection point #${marker.index}` : type}
        </div>
        <div className="font-medium mt-0.5">
          {fromAt} → {toAt}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{type}</div>
      </div>
    );
  }

  const hasDetails = marker.fromZoneDetail && marker.toZoneDetail;

  return (
    <div className="text-xs leading-snug w-[min(94vw,680px)]">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <div className="font-semibold text-sm">
          {marker.index != null ? `Connection point #${marker.index}` : type}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{type}</div>
      </div>
      <div className="font-medium mt-0.5">
        {fromAt} → {toAt}
      </div>
      {marker.transferCell && (
        <div className="text-muted-foreground mt-0.5 text-[11px]">
          Transfer cell:{" "}
          <span className="font-mono text-foreground">{formatCellCoords(marker.transferCell)}</span>
        </div>
      )}

      {hasDetails ? (
        <div className="mt-2 pt-2 border-t border-border grid grid-cols-2 gap-2.5">
          <div className="min-w-0 rounded-md bg-muted/40 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Handing off from
            </div>
            <ZoneMapTooltipDetails
              zone={marker.fromZoneDetail!}
              color={marker.fromColor ?? "#3b82f6"}
              compact
              dense
            />
          </div>
          <div className="min-w-0 rounded-md bg-muted/40 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Handing off to
            </div>
            <ZoneMapTooltipDetails
              zone={marker.toZoneDetail!}
              color={marker.toColor ?? "#22c55e"}
              compact
              dense
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
