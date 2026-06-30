"use client";

import { useMemo, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { H3MapView } from "@/components/map/H3MapViewDynamic";
import type { H3MapHandoffMarker } from "@/components/map/H3MapView";
import { MAP_EMPTY_CELLS } from "@/lib/mapConstants";
import { partitionDriverZones } from "@/lib/orderDraftZoneMap";
import { cn } from "@/lib/utils";
import type { DriverZone } from "@/types";

export interface RoutePathStop {
  index: number;
  label: string;
  detail?: string | null;
}

interface Props {
  title?: string;
  stops: RoutePathStop[];
  routeSegments?: { lat: number; lng: number }[][] | null;
  handoffMarkers?: H3MapHandoffMarker[];
  savedZones?: DriverZone[];
  endpointCoords?: {
    pickup: { lat: number; lng: number };
    dropoff: { lat: number; lng: number };
  } | null;
  endpointLabels?: {
    senderAddress?: string;
    receiverAddress?: string;
  } | null;
  resolution?: number;
  height?: number | string;
  /** Default false — producer-friendly path-only view. */
  defaultShowZones?: boolean;
  showZoneToggle?: boolean;
  className?: string;
}

export function RoutePathOverview({
  title = "Route path",
  stops,
  routeSegments = null,
  handoffMarkers = [],
  savedZones = [],
  endpointCoords = null,
  endpointLabels = null,
  resolution = 15,
  height = 360,
  defaultShowZones = false,
  showZoneToggle = true,
  className,
}: Props) {
  const [showZones, setShowZones] = useState(defaultShowZones);

  const { landZones, pathHubZones } = useMemo(
    () => partitionDriverZones(savedZones),
    [savedZones]
  );

  const zonesForMap = useMemo(
    () => (showZones ? landZones : []),
    [showZones, landZones]
  );

  const hasMap =
    (routeSegments?.length ?? 0) > 0 ||
    handoffMarkers.length > 0 ||
    pathHubZones.length > 0 ||
    zonesForMap.length > 0 ||
    Boolean(endpointCoords) ||
    Boolean(endpointLabels);

  return (
    <div className={cn("space-y-3", className)}>
      {stops.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Transfer points
          </p>
          <ol className="space-y-1.5 text-sm">
            {stops.map((stop) => (
              <li key={`${stop.index}-${stop.label}`} className="flex gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {stop.index}
                </span>
                <div>
                  <p className="font-medium leading-snug">{stop.label}</p>
                  {stop.detail ? (
                    <p className="text-xs text-muted-foreground">{stop.detail}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {hasMap && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium flex items-center gap-1">
              <MapIcon className="h-3.5 w-3.5 text-muted-foreground" />
              {title}
              <span className="text-muted-foreground font-normal">
                {showZones ? "(zones visible)" : "(path and transfer points only)"}
              </span>
            </div>
            {showZoneToggle && landZones.length > 0 && (
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={showZones}
                  onChange={(e) => setShowZones(e.target.checked)}
                  className="rounded border-border"
                />
                Show transporter zones
              </label>
            )}
          </div>
          <div
            className="relative w-full overflow-hidden rounded-xl border border-border"
            style={{ height }}
          >
            <H3MapView
              height="100%"
              resolution={resolution}
              selectedCells={MAP_EMPTY_CELLS}
              interactive
              savedZones={zonesForMap}
              pathHubZones={pathHubZones}
              routeSegments={routeSegments}
              handoffMarkers={handoffMarkers}
              endpointCoords={endpointCoords}
              endpointLabels={endpointLabels}
              fitFocus="endpoints"
              showZoneTooltips={showZones}
            />
          </div>
        </div>
      )}
    </div>
  );
}
