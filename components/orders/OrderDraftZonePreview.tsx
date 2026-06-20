"use client";

import { useEffect, useMemo, useState } from "react";
import { cellToLatLng, isValidCell } from "h3-js";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  Loader2,
  Map as MapIcon,
  Unlink,
  X,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { H3MapView } from "@/components/map/H3MapViewDynamic";
import type { H3MapAdjacentPair, H3MapHandoffMarker } from "@/components/map/H3MapView";
import { MAP_EMPTY_CELLS, ORDER_DRAFT_MAP_HEIGHT } from "@/lib/mapConstants";
import { formatCellCoords } from "@/lib/geo";
import { summaryToDriverZone, zoneCells } from "@/lib/orderDraftZoneMap";
import {
  buildRouteHandoffs,
  connectionWaypointForLeg,
  summarizeRouteChain,
  transporterZoneLabel,
} from "@/lib/orderRouteChain";
import { isHubMode, normalizeTransportMode } from "@/lib/transportMode";
import { cn } from "@/lib/utils";
import type {
  ConvertH3Response,
  DriverZone,
  OrderConnectionStatus,
  OrderDraftChain,
  OrderDraftConnection,
  OrderDraftPreview,
  OrderDraftZoneSummary,
} from "@/types";

interface LatLng {
  lat: number;
  lng: number;
}

// Mirrors `ZONE_PALETTE` in H3MapView — legend and handoff tooltip colors stay in sync.
const ZONE_PALETTE = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

/** Center of an H3 cell, or null if the index is invalid. */
function cellCenter(cell: string): LatLng | null {
  if (!isValidCell(cell)) return null;
  const [lat, lng] = cellToLatLng(cell);
  return { lat, lng };
}

/** Average center of a zone's sampled cells — a cheap centroid for fallbacks. */
function zoneCenter(z: OrderDraftZoneSummary | undefined): LatLng | null {
  if (!z) return null;
  const cells = Array.isArray(z.cells) ? z.cells : [];
  let lat = 0;
  let lng = 0;
  let n = 0;
  for (const c of cells) {
    const center = cellCenter(c);
    if (center) {
      lat += center.lat;
      lng += center.lng;
      n++;
    }
  }
  if (n === 0) return null;
  return { lat: lat / n, lng: lng / n };
}

/**
 * The geographic handoff point for one connection on a selected route (legacy
 * helper for route polylines — prefer `connectionWaypointForLeg` from
 * orderRouteChain for direction-aware waypoints).
 */
function connectionWaypoint(
  c: OrderDraftConnection,
  fromZoneId: number,
  toZoneId: number,
  zonesById: Map<number, OrderDraftZoneSummary>
): LatLng | null {
  return connectionWaypointForLeg(c, fromZoneId, toZoneId, zonesById);
}

/** Air/sea terminal of `zone` (or null when missing / not a hub zone). */
function hubTerminal(
  zone: OrderDraftZoneSummary | undefined,
  role: "departure" | "arrival"
): LatLng | null {
  if (!zone) return null;
  const hub = role === "arrival" ? zone.arrival_hub : zone.departure_hub;
  if (hub && Number.isFinite(hub.lat) && Number.isFinite(hub.lng)) {
    return { lat: hub.lat, lng: hub.lng };
  }
  return null;
}

/** Which terminal of `zoneId` a hub connection attaches to (if any). */
function connectionTerminalForZone(
  conn: OrderDraftConnection | undefined,
  zoneId: number
): "departure" | "arrival" | null {
  if (!conn || conn.connection_type !== "hub") return null;
  if (conn.from_zone_id === zoneId) return conn.hub_role_a ?? null;
  if (conn.to_zone_id === zoneId) return conn.hub_role_b ?? null;
  return null;
}

/**
 * Land-only polyline legs for a selected chain. For every air/sea zone the
 * ground leg runs up to its *departure* terminal and resumes at its *arrival*
 * terminal — the zone's own flight path / shipping lane (rendered by
 * SavedZonesLayer) covers the middle leg between the two. Walking the chain
 * zone-by-zone (rather than connection-by-connection) means a hub zone that
 * sits at the very start or end of the chain still contributes *both*
 * terminals, so an air/sea leg next to the pickup or drop-off is fully drawn.
 */
function buildRouteSegments(
  chain: OrderDraftChain,
  connectionsById: Map<number, OrderDraftConnection>,
  zonesById: Map<number, OrderDraftZoneSummary>,
  source: LatLng,
  destination: LatLng
): LatLng[][] {
  const segments: LatLng[][] = [];
  let current: LatLng[] = [source];

  const isHub = (zoneId: number) => {
    const z = zonesById.get(zoneId);
    return Boolean(z && isHubMode(normalizeTransportMode(z.transport_method)));
  };

  for (let i = 0; i < chain.zone_ids.length; i++) {
    const zoneId = chain.zone_ids[i];
    const connIn = i > 0 ? connectionsById.get(chain.connection_ids[i - 1]) : undefined;
    const connOut =
      i < chain.connection_ids.length ? connectionsById.get(chain.connection_ids[i]) : undefined;

    if (isHub(zoneId)) {
      const zone = zonesById.get(zoneId);
      // Enter at the terminal the incoming leg uses (default departure when
      // this zone covers the pickup) and leave at the terminal the outgoing
      // leg uses (default arrival when it covers the drop-off).
      const entry = connectionTerminalForZone(connIn, zoneId) ?? "departure";
      const exit = connectionTerminalForZone(connOut, zoneId) ?? "arrival";
      const entryPoint = hubTerminal(zone, entry);
      const exitPoint = hubTerminal(zone, exit);

      if (entryPoint) current.push(entryPoint);
      if (current.length >= 2) segments.push([...current]);
      // Break here — the air/sea lane between the two terminals is drawn by
      // the zone layer — and resume the ground leg at the exit terminal.
      current = exitPoint ? [exitPoint] : [];
    } else if (connOut) {
      const nextZoneId = chain.zone_ids[i + 1];
      const nextIsHub = i + 1 < chain.zone_ids.length && isHub(chain.zone_ids[i + 1]);
      if (!nextIsHub && nextZoneId != null) {
        const wp = connectionWaypoint(connOut, zoneId, nextZoneId, zonesById);
        if (wp) current.push(wp);
      }
    }
  }

  current.push(destination);
  if (current.length >= 2) segments.push(current);
  return segments;
}

interface Props {
  preview: OrderDraftPreview | null;
  loading: boolean;
  error: string | null;
}

/** What the map is currently tracing. */
type ChainSelection =
  | { kind: "chain"; idx: number }
  | { kind: "gap"; side: "pickup" | "destination" }
  | null;

const STATUS_CONFIG: Record<
  OrderConnectionStatus,
  { label: string; icon: typeof CheckCircle2; tone: string }
> = {
  connected: {
    label: "Connected",
    icon: CheckCircle2,
    tone: "text-emerald-600 dark:text-emerald-400",
  },
  not_connected: {
    label: "Not connected yet",
    icon: AlertTriangle,
    tone: "text-amber-600 dark:text-amber-400",
  },
  no_pickup_zone: {
    label: "No pickup zone",
    icon: XCircle,
    tone: "text-rose-600 dark:text-rose-400",
  },
  no_destination_zone: {
    label: "No destination zone",
    icon: XCircle,
    tone: "text-rose-600 dark:text-rose-400",
  },
};

/**
 * Order zones for map coloring: pickup → destination → intermediates by depth.
 * H3MapView paints zones via `ZONE_PALETTE[index]`, so the order here is what
 * the legend below the map describes.
 */
function orderZonesByRole(zones: OrderDraftZoneSummary[]): OrderDraftZoneSummary[] {
  return [...zones].sort((a, b) => {
    const roleA = a.is_pickup ? 0 : a.is_destination ? 1 : 2;
    const roleB = b.is_pickup ? 0 : b.is_destination ? 1 : 2;
    if (roleA !== roleB) return roleA - roleB;
    const dA = a.depth ?? 999;
    const dB = b.depth ?? 999;
    if (dA !== dB) return dA - dB;
    return a.zone_name.localeCompare(b.zone_name);
  });
}

export function OrderDraftZonePreview({ preview, loading, error }: Props) {
  // Hooks must be unconditional — compute view-models even when there's no
  // preview to render so the conditional returns below don't violate the
  // rules-of-hooks.

  // What is currently being traced on the map. `null` = overview (all routes'
  // zones + the direct pickup→drop-off line). A `chain` selection traces a
  // complete possible route; a `gap` selection traces one side of an
  // incomplete route when no full path exists.
  const [selection, setSelection] = useState<ChainSelection>(null);
  const [focusHandoffIndex, setFocusHandoffIndex] = useState<number | null>(null);

  // Reset the selection whenever the underlying preview changes (new pickup /
  // destination / recompute) so a stale index can't point at a different route.
  const previewKey = preview
    ? `${preview.source.h3}|${preview.destination.h3}|${preview.possible_connection_chains.length}|${preview.gap ? "gap" : "none"}`
    : "none";
  useEffect(() => {
    setSelection(null);
    setFocusHandoffIndex(null);
  }, [previewKey]);

  const selectedChain = useMemo<OrderDraftChain | null>(() => {
    if (!preview || !selection) return null;
    if (selection.kind === "chain") {
      return preview.possible_connection_chains[selection.idx] ?? null;
    }
    const g = preview.gap;
    if (!g) return null;
    return selection.side === "pickup" ? g.pickup_chain : g.destination_chain;
  }, [preview, selection]);

  /**
   * The set of zones we actually want to surface on the map: pickup-side,
   * destination-side, and any zone that appears on a connection chain
   * between them. When a path is selected we narrow this to *only* that
   * path's zones.
   */
  const relevantZoneIds = useMemo(() => {
    const ids = new Set<number>();
    if (!preview) return ids;
    if (selectedChain) {
      for (const id of selectedChain.zone_ids) ids.add(id);
      return ids;
    }
    for (const z of preview.connected_zones ?? []) {
      if (z.is_pickup || z.is_destination) ids.add(z.zone_id);
    }
    for (const chain of preview.possible_connection_chains ?? []) {
      for (const id of chain.zone_ids) ids.add(id);
    }
    return ids;
  }, [preview, selectedChain]);

  // Connection ids used by the selected path (null when no path selected →
  // overview shows every used connection's handoff overlays).
  const selectedConnectionIds = useMemo<Set<number> | null>(() => {
    if (!selectedChain) return null;
    return new Set(selectedChain.connection_ids);
  }, [selectedChain]);

  const orderedZones = useMemo(() => {
    if (!preview) return [];
    return orderZonesByRole(preview.connected_zones ?? []).filter((z) =>
      relevantZoneIds.has(z.zone_id)
    );
  }, [preview, relevantZoneIds]);
  const savedZonesForMap = useMemo<DriverZone[]>(
    () =>
      orderedZones
        .filter((z) => {
          const mode = normalizeTransportMode(z.transport_method);
          if (isHubMode(mode)) {
            const dep = z.departure_hub;
            const arr = z.arrival_hub;
            return (
              dep != null &&
              arr != null &&
              Number.isFinite(dep.lat) &&
              Number.isFinite(dep.lng) &&
              Number.isFinite(arr.lat) &&
              Number.isFinite(arr.lng)
            );
          }
          return zoneCells(z).length > 0;
        })
        .map(summaryToDriverZone),
    [orderedZones]
  );
  const conversionForMap = useMemo<ConvertH3Response | null>(() => {
    if (!preview) return null;
    return {
      pickup_h3: preview.source.h3,
      dropoff_h3: preview.destination.h3,
      resolution: preview.preview_resolution,
      cell_type: "Hexagon",
      pickup_center: { lat: preview.source.lat, lng: preview.source.lng },
      dropoff_center: { lat: preview.destination.lat, lng: preview.destination.lng },
    };
  }, [preview]);

  const endpointLabelsForMap = useMemo(
    () =>
      preview
        ? {
            senderName: preview.source.name || "Sender",
            senderAddress: preview.source.address || null,
            receiverName: preview.destination.name || "Receiver",
            receiverAddress: preview.destination.address || null,
          }
        : null,
    [preview]
  );

  const zonesById = useMemo(() => {
    const m = new Map<number, OrderDraftZoneSummary>();
    for (const z of preview?.connected_zones ?? []) m.set(z.zone_id, z);
    return m;
  }, [preview]);

  const connectionsById = useMemo(() => {
    const m = new Map<number, OrderDraftConnection>();
    for (const c of preview?.connections ?? []) m.set(c.id, c);
    return m;
  }, [preview]);

  // Land-only legs for the *selected* route. Null in overview mode (direct
  // dashed pickup→drop-off line). Air/sea legs are omitted — each air/sea
  // zone draws its own flight path / shipping lane.
  const routeSegmentsForMap = useMemo<LatLng[][] | null>(() => {
    if (!preview || !selectedChain) return null;
    let src: LatLng = { lat: preview.source.lat, lng: preview.source.lng };
    let dst: LatLng = { lat: preview.destination.lat, lng: preview.destination.lng };
    // For an incomplete route we anchor only the *reachable* end at a real
    // endpoint and stop the trace at the frontier zone, so we don't draw a
    // misleading line all the way to the side that can't actually be reached.
    if (selection?.kind === "gap") {
      const ids = selectedChain.zone_ids;
      if (selection.side === "pickup") {
        const frontier = zoneCenter(zonesById.get(ids[ids.length - 1]));
        if (frontier) dst = frontier;
      } else {
        const frontier = zoneCenter(zonesById.get(ids[0]));
        if (frontier) src = frontier;
      }
    }
    return buildRouteSegments(selectedChain, connectionsById, zonesById, src, dst);
  }, [preview, selectedChain, selection, connectionsById, zonesById]);

  const zoneColorById = useMemo(() => {
    const m = new Map<number, string>();
    orderedZones.forEach((z, idx) => {
      m.set(z.zone_id, ZONE_PALETTE[idx % ZONE_PALETTE.length]);
    });
    return m;
  }, [orderedZones]);

  const routeHandoffs = useMemo(() => {
    if (!selectedChain) return [];
    return buildRouteHandoffs(selectedChain, connectionsById, zonesById, zoneColorById);
  }, [selectedChain, connectionsById, zonesById, zoneColorById]);

  const handoffMarkersForMap = useMemo<H3MapHandoffMarker[]>(
    () => routeHandoffs.map((h) => h.marker),
    [routeHandoffs]
  );

  const focusedHandoff = useMemo(
    () =>
      focusHandoffIndex != null
        ? handoffMarkersForMap.find((m) => m.index === focusHandoffIndex) ?? null
        : null,
    [focusHandoffIndex, handoffMarkersForMap]
  );

  const routeSummary = useMemo(() => {
    if (!selectedChain) return null;
    return summarizeRouteChain(selectedChain, zonesById, routeHandoffs);
  }, [selectedChain, zonesById, routeHandoffs]);

  /**
   * Only show transfer/adjacency markers when both endpoints of the
   * connection are in `relevantZoneIds`. This prevents an "unused" overlap
   * cell from a side branch zone (BFS reached but not on a chain) from
   * leaking onto the map after we hide that zone.
   */
  /**
   * Zones whose transport is air/sea: their handoffs happen at the hub/port
   * endpoint, never at a shared map cell, so any connection touching one
   * must not contribute a cell-level transfer/adjacency overlay.
   */
  const hubZoneIds = useMemo(() => {
    const ids = new Set<number>();
    if (!preview) return ids;
    for (const z of preview.connected_zones ?? []) {
      if (isHubMode(normalizeTransportMode(z.transport_method))) ids.add(z.zone_id);
    }
    return ids;
  }, [preview]);

  const transferCellsForMap = useMemo<string[]>(() => {
    if (!preview) return [];
    const out: string[] = [];
    for (const c of preview.connections ?? []) {
      // In overview mode show every used connection; when a path is selected
      // show only that path's connections.
      if (selectedConnectionIds ? !selectedConnectionIds.has(c.id) : !c.used_in_preview) continue;
      if (c.connection_type !== "overlap") continue;
      if (!relevantZoneIds.has(c.from_zone_id)) continue;
      if (!relevantZoneIds.has(c.to_zone_id)) continue;
      if (hubZoneIds.has(c.from_zone_id) || hubZoneIds.has(c.to_zone_id)) continue;
      for (const cell of c.transfer_cells) out.push(cell);
    }
    return out;
  }, [preview, relevantZoneIds, hubZoneIds, selectedConnectionIds]);

  const adjacentPairsForMap = useMemo<H3MapAdjacentPair[]>(() => {
    if (!preview) return [];
    const out: H3MapAdjacentPair[] = [];
    for (const c of preview.connections ?? []) {
      if (selectedConnectionIds ? !selectedConnectionIds.has(c.id) : !c.used_in_preview) continue;
      if (c.connection_type !== "adjacent") continue;
      if (!relevantZoneIds.has(c.from_zone_id)) continue;
      if (!relevantZoneIds.has(c.to_zone_id)) continue;
      if (hubZoneIds.has(c.from_zone_id) || hubZoneIds.has(c.to_zone_id)) continue;
      for (const p of c.adjacent_cell_pairs) {
        out.push(p);
        if (out.length >= 200) return out; // hard cap on map detail
      }
    }
    return out;
  }, [preview, relevantZoneIds, hubZoneIds, selectedConnectionIds]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking transport zone connections…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-rose-300/60">
        <CardContent className="flex items-start gap-2 text-sm text-rose-600 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </CardContent>
      </Card>
    );
  }

  if (!preview) return null;

  const status = STATUS_CONFIG[preview.status];
  const StatusIcon = status.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <StatusIcon className={cn("h-4 w-4", status.tone)} />
              <span className={status.tone}>{status.label}</span>
              <span className="text-muted-foreground font-normal">
                · zone connection preview
              </span>
            </CardTitle>
            <CardDescription className="text-xs mt-1">{preview.message}</CardDescription>
          </div>
          <span className="text-[10px] uppercase tracking-wide rounded-full border border-border px-2 py-0.5 text-muted-foreground">
            Preview · not a final route
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Metric
            label={`Pickup (res ${preview.preview_resolution})`}
            value={formatCellCoords(preview.source.h3)}
            mono
          />
          <Metric
            label={`Drop-off (res ${preview.preview_resolution})`}
            value={formatCellCoords(preview.destination.h3)}
            mono
          />
          <Metric label="Pickup zones" value={preview.pickup_zones.length} />
          <Metric label="Destination zones" value={preview.destination_zones.length} />
          <Metric
            label="Connected zones in preview"
            value={preview.connected_zones.length}
          />
          <Metric label="Transfer cells" value={preview.transfer_cells.length} />
        </div>

        {(preview.pickup_zones.length > 0 || preview.destination_zones.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ZoneSnippet
              title="Pickup zones"
              zones={preview.pickup_zones}
              empty="No transport zone covers this pickup yet."
            />
            <ZoneSnippet
              title="Destination zones"
              zones={preview.destination_zones}
              empty="No transport zone covers this destination yet."
            />
          </div>
        )}

        {/*
          Map preview — sender, receiver, pickup/destination H3 cells, the
          covering + intermediate zones, and overlap/adjacency handoff
          points. Zones are colored by index (palette below); H3MapView
          handles cell-level rendering. The map mounts only when we
          actually have something useful to show.
        */}
        {(savedZonesForMap.length > 0 || conversionForMap) && (
          <div className="space-y-2">
            <div className="text-xs font-medium flex items-center gap-1">
              <MapIcon className="h-3.5 w-3.5 text-muted-foreground" />
              Map preview
              <span className="text-muted-foreground font-normal">
                {selection
                  ? selection.kind === "chain"
                    ? `(tracing path #${selection.idx + 1} · hover transfer points for details)`
                    : `(tracing ${
                        selection.side === "pickup" ? "pickup-side" : "destination-side"
                      } reach)`
                  : "(sender, receiver, relevant zones, transfer cells)"}
              </span>
            </div>
            <div
              className="relative w-full rounded-xl border border-border"
              style={{ height: ORDER_DRAFT_MAP_HEIGHT }}
            >
              <H3MapView
                height="100%"
                resolution={preview.preview_resolution}
                selectedCells={MAP_EMPTY_CELLS}
                savedZones={savedZonesForMap}
                conversion={conversionForMap}
                endpointLabels={endpointLabelsForMap}
                transferCells={transferCellsForMap}
                adjacentPairs={adjacentPairsForMap}
                routeSegments={routeSegmentsForMap}
                handoffMarkers={handoffMarkersForMap}
                focusHandoff={focusedHandoff}
                onFocusHandoffDismiss={() => setFocusHandoffIndex(null)}
                showZoneTooltips={Boolean(selectedChain)}
                interactive
              />
            </div>
            {routeSummary && routeSummary.connectionPoints.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <div className="text-xs font-medium">Route handoff chain</div>
                <ol className="space-y-1 text-xs">
                  <li className="text-foreground">
                    <span className="text-muted-foreground">Pickup transporter:</span>{" "}
                    {routeSummary.pickupLabel}
                  </li>
                  {routeSummary.handoffs.map((h) => (
                    <li key={h.index} className="text-foreground">
                      <span className="text-muted-foreground">Handoff #{h.index}:</span> {h.zoneLabel}
                    </li>
                  ))}
                  <li className="text-foreground">
                    <span className="text-muted-foreground">Delivery transporter:</span>{" "}
                    {routeSummary.deliveryLabel}
                  </li>
                </ol>
                <div className="pt-2 border-t border-border/60 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Connection points
                  </div>
                  <ul className="space-y-1">
                    {routeSummary.connectionPoints.map((cp) => (
                      <li key={cp.index}>
                        <button
                          type="button"
                          onClick={() =>
                            setFocusHandoffIndex((prev) =>
                              prev === cp.index ? null : cp.index
                            )
                          }
                          className={cn(
                            "w-full text-left rounded-md px-2 py-1.5 transition-colors",
                            focusHandoffIndex === cp.index
                              ? "bg-primary/10 ring-1 ring-primary/40"
                              : "hover:bg-muted/70"
                          )}
                        >
                          <span className="text-[10px] font-mono text-muted-foreground mr-1">
                            #{cp.index}
                          </span>
                          <span className="text-foreground">{cp.label}</span>
                          <span className="block text-[10px] text-primary mt-0.5">
                            {focusHandoffIndex === cp.index
                              ? "Popup open on map · click to close"
                              : "View on map"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <MapLegend
              zones={orderedZones}
              hasTransferCells={transferCellsForMap.length > 0}
              hasHandoffMarkers={handoffMarkersForMap.length > 0}
            />
          </div>
        )}

        {preview.possible_connection_chains.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-xs font-medium mb-2 flex items-center gap-1 flex-wrap">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
              Possible connection paths
              <span className="text-muted-foreground font-normal">
                ({preview.possible_connection_chains.length} found · click one to trace it)
              </span>
              {selection != null && (
                <button
                  type="button"
                  onClick={() => {
                    setSelection(null);
                    setFocusHandoffIndex(null);
                  }}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                  Show all paths
                </button>
              )}
            </div>
            <ol className="space-y-1.5 text-xs max-h-72 overflow-y-auto pr-1">
              {preview.possible_connection_chains.map((chain, idx) => {
                const isSelected = selection?.kind === "chain" && selection.idx === idx;
                return (
                  <li key={idx}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelection(null);
                          setFocusHandoffIndex(null);
                        } else {
                          setSelection({ kind: "chain", idx });
                          setFocusHandoffIndex(null);
                        }
                      }}
                      className={cn(
                        "w-full text-left rounded-md px-2 py-1.5 transition-colors space-y-1",
                        isSelected
                          ? "bg-primary/10 ring-1 ring-primary/40"
                          : "bg-background/60 hover:bg-muted/70"
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
                        <span className="text-[10px] font-mono mr-1">Route #{idx + 1}</span>
                        <span className="ml-auto text-[10px] uppercase tracking-wide">
                          {chain.hops} hop{chain.hops === 1 ? "" : "s"}
                        </span>
                      </div>
                      <RouteChainBrief
                        chain={chain}
                        zones={preview.connected_zones}
                        zonesById={zonesById}
                      />
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {preview.gap && (
          <div className="rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 space-y-3 dark:border-amber-900/50 dark:bg-amber-950/20">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              Incomplete route — no full path yet
            </div>
            <p className="text-xs text-muted-foreground">{preview.gap.message}</p>

            {preview.gap.pickup_chain && preview.gap.pickup_chain.zone_ids.length > 0 && (
              <GapChainRow
                label="How far it reaches from the pickup"
                chain={preview.gap.pickup_chain}
                zones={preview.connected_zones}
                startLabel="Pickup"
                endLabel={null}
                selected={selection?.kind === "gap" && selection.side === "pickup"}
                onClick={() =>
                  setSelection(
                    selection?.kind === "gap" && selection.side === "pickup"
                      ? null
                      : { kind: "gap", side: "pickup" }
                  )
                }
              />
            )}

            <div className="flex items-center gap-1.5 pl-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              <Unlink className="h-3.5 w-3.5" />
              <span>
                Gap ≈ {preview.gap.distance_km ?? "?"} km
                {preview.gap.suggested_zone_name
                  ? ` · nearest zone to bridge: ${
                      preview.gap.suggested_transport_name
                        ? `${preview.gap.suggested_transport_name} · `
                        : ""
                    }${preview.gap.suggested_zone_name}`
                  : ""}
              </span>
            </div>

            {preview.gap.destination_chain &&
              preview.gap.destination_chain.zone_ids.length > 0 && (
                <GapChainRow
                  label="What can already reach the drop-off"
                  chain={preview.gap.destination_chain}
                  zones={preview.connected_zones}
                  startLabel={null}
                  endLabel="Drop-off"
                  selected={selection?.kind === "gap" && selection.side === "destination"}
                  onClick={() =>
                    setSelection(
                      selection?.kind === "gap" && selection.side === "destination"
                        ? null
                        : { kind: "gap", side: "destination" }
                    )
                  }
                />
              )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RouteChainBrief({
  chain,
  zones,
  zonesById,
}: {
  chain: OrderDraftChain;
  zones: OrderDraftZoneSummary[];
  zonesById: Map<number, OrderDraftZoneSummary>;
}) {
  const zoneMap = zonesById.size > 0 ? zonesById : new Map(zones.map((z) => [z.zone_id, z]));
  const pickupId = chain.zone_ids[0];
  const deliveryId = chain.zone_ids[chain.zone_ids.length - 1];
  const pickupZone = zoneMap.get(pickupId);
  const deliveryZone = zoneMap.get(deliveryId);

  return (
    <div className="text-xs space-y-0.5">
      <div className="text-foreground">
        <span className="text-muted-foreground">Pickup:</span>{" "}
        {transporterZoneLabel(pickupZone, pickupId)}
      </div>
      {chain.connection_ids.map((_, i) => {
        const zid = chain.zone_ids[i + 1];
        const z = zoneMap.get(zid);
        return (
          <div key={`handoff-${i}`} className="text-foreground">
            <span className="text-muted-foreground">Handoff #{i + 1}:</span>{" "}
            {transporterZoneLabel(z, zid)}
          </div>
        );
      })}
      <div className="text-foreground">
        <span className="text-muted-foreground">Delivery:</span>{" "}
        {transporterZoneLabel(deliveryZone, deliveryId)}
      </div>
    </div>
  );
}

function GapChainRow({
  label,
  chain,
  zones,
  startLabel,
  endLabel,
  selected,
  onClick,
}: {
  label: string;
  chain: OrderDraftChain;
  zones: OrderDraftZoneSummary[];
  startLabel: string | null;
  endLabel: string | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full flex flex-wrap items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors",
          selected
            ? "bg-primary/10 ring-1 ring-primary/40"
            : "bg-background/60 hover:bg-muted/70"
        )}
      >
        {startLabel && <span className="font-medium text-foreground">{startLabel}</span>}
        {chain.zone_ids.map((zid, i) => {
          const z = zones.find((zz) => zz.zone_id === zid);
          return (
            <span key={`${zid}-${i}`} className="flex items-center gap-1">
              <ArrowRight className="h-3 w-3" />
              <span className="text-foreground">
                {z ? `${z.transport_name} · ${z.zone_name}` : `Zone #${zid}`}
              </span>
            </span>
          );
        })}
        {endLabel && (
          <>
            <ArrowRight className="h-3 w-3" />
            <span className="font-medium text-foreground">{endLabel}</span>
          </>
        )}
        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
          {chain.hops} hop{chain.hops === 1 ? "" : "s"}
        </span>
      </button>
    </div>
  );
}

function Metric({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-medium truncate", mono && "font-mono text-xs")}>{value}</div>
    </div>
  );
}

// Mirrors `ZONE_PALETTE` in H3MapView. Kept local so the legend below the
// map matches the colors Leaflet actually paints.
function MapLegend({
  zones,
  hasTransferCells,
  hasHandoffMarkers,
}: {
  zones: OrderDraftZoneSummary[];
  hasTransferCells: boolean;
  hasHandoffMarkers: boolean;
}) {
  const renderable = zones.filter((z) => zoneCells(z).length > 0);
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-[11px]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <LegendDot color="#22c55e" label="Sender / pickup H3" filled />
        <LegendDot color="#ef4444" label="Receiver / drop-off H3" filled />
        {hasTransferCells && (
          <LegendDot color="#f59e0b" label="Overlap transfer cell" filled />
        )}
        <LegendDot color="#b45309" label="Adjacent handoff (dashed line)" />
        {hasHandoffMarkers && (
          <LegendDot color="#f59e0b" label="Connection point (hover or select route)" filled />
        )}
      </div>
      {renderable.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-border/60 flex flex-wrap gap-x-3 gap-y-1">
          {renderable.map((z, idx) => {
            const color = ZONE_PALETTE[idx % ZONE_PALETTE.length];
            const role = z.is_pickup
              ? "Pickup zone"
              : z.is_destination
              ? "Destination zone"
              : "Intermediate";
            return (
              <span key={z.zone_id} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-3.5 rounded-sm"
                  style={{ background: color, opacity: 0.55, border: `1px solid ${color}` }}
                />
                <span className="text-foreground font-medium truncate max-w-[160px]">
                  {z.transport_name} · {z.zone_name}
                </span>
                <span className="text-muted-foreground">· {role}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LegendDot({
  color,
  label,
  filled,
}: {
  color: string;
  label: string;
  filled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-2.5 w-3.5 rounded-sm"
        style={{
          background: filled ? color : "transparent",
          border: `2px ${filled ? "solid" : "dashed"} ${color}`,
        }}
      />
      <span className="text-foreground">{label}</span>
    </span>
  );
}

function ZoneSnippet({
  title,
  zones,
  empty,
}: {
  title: string;
  zones: OrderDraftZoneSummary[];
  empty: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs font-medium mb-2">{title}</div>
      {zones.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {zones.slice(0, 4).map((z) => (
            <li key={z.zone_id} className="flex items-center justify-between gap-2">
              <span className="truncate">
                <span className="font-medium">{z.transport_name}</span>
                <span className="text-muted-foreground"> · {z.zone_name}</span>
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                {z.cell_count} cells
                {z.transport_method ? ` · ${z.transport_method}` : ""}
              </span>
            </li>
          ))}
          {zones.length > 4 && (
            <li className="text-[10px] text-muted-foreground">+{zones.length - 4} more</li>
          )}
        </ul>
      )}
    </div>
  );
}
