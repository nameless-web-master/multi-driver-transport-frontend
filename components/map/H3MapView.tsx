"use client";

import { cellToBoundary, cellToLatLng, latLngToCell, isValidCell } from "h3-js";
import L from "leaflet";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useMapDefaultLocation } from "@/hooks/useMapDefaultLocation";
import type { UserLocation } from "@/hooks/useUserGeolocation";
import { formatCurrency } from "@/lib/utils";
import type { ConvertH3Response, DriverZone } from "@/types";

const TRANSPORT_LABEL: Record<string, string> = {
  land: "Land",
  air: "Air",
  sea: "Sea",
};

const ZONE_PALETTE = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

// Stable empty collections — default props like `savedZones = []` create a
// new array reference every render, which defeats memo() downstream.
const EMPTY_CELL_SET: ReadonlySet<string> = new Set();
const EMPTY_CELLS: string[] = [];
const EMPTY_ZONES: DriverZone[] = [];
const EMPTY_BOUNDARY: { lat: number; lng: number }[] = [];
const EMPTY_ADJACENT: H3MapAdjacentPair[] = [];

/**
 * Cached H3-cell boundary lookup.
 *
 * Computing `cellToBoundary` for hundreds of cells on every render (which
 * happens whenever the parent form re-renders — e.g. on every keystroke
 * in the zone name input) was causing visible jank. The boundary of any
 * given H3 cell is fixed, so we memoize once per cell ID and return the
 * exact same array reference on subsequent calls. That lets react-leaflet
 * skip re-issuing `setLatLngs` on the underlying Leaflet polygons.
 *
 * h3-js v4 returns [lat, lng] pairs by default — matches Leaflet's order.
 */
const boundaryCache = new Map<string, [number, number][]>();
function boundaryPositions(cell: string): [number, number][] {
  const cached = boundaryCache.get(cell);
  if (cached) return cached;
  const computed = cellToBoundary(cell).map(
    ([lat, lng]) => [lat, lng] as [number, number]
  );
  boundaryCache.set(cell, computed);
  return computed;
}

/**
 * Same idea for cell centers — `cellToLatLng` is cheap but called per
 * cell per render. Caching the tuple keeps Leaflet markers stable.
 */
const centerCache = new Map<string, [number, number]>();
function cellCenter(cell: string): [number, number] {
  const cached = centerCache.get(cell);
  if (cached) return cached;
  const [lat, lng] = cellToLatLng(cell);
  const computed: [number, number] = [lat, lng];
  centerCache.set(cell, computed);
  return computed;
}

/**
 * Fits the map to the supplied positions ONCE per "session key" change.
 * Prevents the map from snapping back every time the user toggles a cell.
 */
function FitBoundsOnce({
  positions,
  sessionKey,
}: {
  positions: [number, number][];
  sessionKey: string;
}) {
  const map = useMap();
  const lastKey = useRef<string | null>(null);
  const positionsRef = useRef(positions);
  positionsRef.current = positions;

  useEffect(() => {
    const pts = positionsRef.current;
    if (pts.length === 0) return;
    if (lastKey.current === sessionKey) return;
    lastKey.current = sessionKey;

    let cancelled = false;

    const fit = () => {
      if (cancelled) return;
      const container = map.getContainer?.();
      if (!container?.isConnected) return;
      try {
        const bounds = L.latLngBounds(pts);
        // No animation — animated fitBounds can fire _onZoomTransitionEnd after
        // the map instance is torn down (e.g. session remount), causing
        // "_leaflet_pos" errors on undefined panes.
        map.fitBounds(bounds.pad(0.25), { animate: false, maxZoom: 13 });
      } catch {
        /* map already removed */
      }
    };

    if (map.whenReady) {
      map.whenReady(fit);
    } else {
      fit();
    }

    return () => {
      cancelled = true;
    };
  }, [map, sessionKey]);
  return null;
}

/**
 * Pans the map to the user's geographical coordinates the first time they
 * become available, but only when there's no other anchor geometry (saved
 * zones, conversion, selection) to drive `FitBoundsOnce`. This keeps the
 * initial view local to the user instead of the hard-coded SF fallback,
 * without fighting `FitBoundsOnce` when the user already has zones to show.
 */
function PanToUserLocationOnce({
  userLocation,
  hasFitTargets,
  zoom,
}: {
  userLocation: UserLocation | null;
  hasFitTargets: boolean;
  zoom: number;
}) {
  const map = useMap();
  const didPanRef = useRef(false);
  useEffect(() => {
    if (didPanRef.current) return;
    if (hasFitTargets) return;
    if (!userLocation) return;
    didPanRef.current = true;
    try {
      const container = map.getContainer?.();
      if (!container?.isConnected) return;
      map.setView([userLocation.lat, userLocation.lng], zoom, { animate: false });
    } catch {
      /* map already removed */
    }
  }, [map, userLocation, hasFitTargets, zoom]);
  return null;
}

function MapClickHandler({
  resolution,
  selectedCells,
  onCellsChange,
}: {
  resolution: number;
  selectedCells: string[];
  onCellsChange: (cells: string[]) => void;
}) {
  useMapEvents({
    click(e) {
      const cell = latLngToCell(e.latlng.lat, e.latlng.lng, resolution);
      const next = new Set(selectedCells);
      if (next.has(cell)) next.delete(cell);
      else next.add(cell);
      onCellsChange(Array.from(next));
    },
  });
  return null;
}

function GeofenceClickHandler({
  boundary,
  onBoundaryChange,
}: {
  boundary: { lat: number; lng: number }[];
  onBoundaryChange: (pts: { lat: number; lng: number }[]) => void;
}) {
  useMapEvents({
    click(e) {
      onBoundaryChange([
        ...boundary,
        { lat: e.latlng.lat, lng: e.latlng.lng },
      ]);
    },
  });
  return null;
}

const pickupIcon = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const dropoffIcon = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#ef4444;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export interface H3MapAdjacentPair {
  from_cell: string;
  to_cell: string;
}

export interface H3MapViewProps {
  height?: string | number;
  resolution: number;
  selectedCells: string[];
  onCellsChange?: (cells: string[]) => void;
  geofenceEnabled?: boolean;
  boundary?: { lat: number; lng: number }[];
  onBoundaryChange?: (pts: { lat: number; lng: number }[]) => void;
  savedZones?: DriverZone[];
  conversion?: ConvertH3Response | null;
  interactive?: boolean;
  drawEnabled?: boolean;
  center?: [number, number];
  zoom?: number;
  /**
   * Milestone 2: H3 cells that should be highlighted as a transfer/overlap
   * region on top of the saved-zone layer. Rendered in a distinct amber
   * tone so they read against any zone palette colour.
   */
  transferCells?: string[];
  /**
   * Milestone 2: pairs of H3 cells that touch across a zone boundary.
   * Each pair is drawn as a short line between the two cell centers so
   * the adjacency handoff point is visually obvious.
   */
  adjacentPairs?: H3MapAdjacentPair[];
  /**
   * Hover tooltips on saved-zone cells are expensive (one Leaflet Tooltip
   * per cell). Defaults to `interactive`; set false on previews / thumbnails.
   */
  showZoneTooltips?: boolean;
}

export function H3MapView({
  height = 360,
  resolution,
  selectedCells,
  onCellsChange,
  savedZones = EMPTY_ZONES,
  conversion = null,
  interactive = true,
  drawEnabled = false,
  geofenceEnabled = false,
  boundary = EMPTY_BOUNDARY,
  onBoundaryChange,
  center,
  zoom = 10,
  transferCells = EMPTY_CELLS,
  adjacentPairs = EMPTY_ADJACENT,
  showZoneTooltips,
}: H3MapViewProps) {
  const userLocation = useMapDefaultLocation();
  const zoneTooltips = showZoneTooltips ?? interactive;

  const firstSelectedCell = selectedCells[0];

  const defaultCenter = useMemo<[number, number]>(() => {
    if (center) return center;
    if (conversion) return [conversion.pickup_center.lat, conversion.pickup_center.lng];
    if (firstSelectedCell) return cellCenter(firstSelectedCell);
    if (userLocation) return [userLocation.lat, userLocation.lng];
    // Final fallback when the browser denies / doesn't support geolocation
    // and there is no other anchor geometry yet.
    return [37.7749, -122.4194];
  }, [center, conversion, firstSelectedCell, userLocation]);

  // Bounds are computed from "anchor" geometry only — pickup/drop-off cells,
  // saved zones, and (M2) transfer cells + adjacency pairs — so the map
  // doesn't reflow every time the user picks a cell.
  const fitPositions = useMemo(() => {
    const pts: [number, number][] = [];
    // Use cell centers (1 point per cell) for fit-bounds so the viewport
    // covers every saved cell without paying the full 6-vertex cost.
    savedZones.forEach((z) => {
      z.h3_cells.forEach((c) => {
        if (isValidCell(c)) pts.push(cellCenter(c));
      });
    });
    if (conversion) {
      pts.push([conversion.pickup_center.lat, conversion.pickup_center.lng]);
      pts.push([conversion.dropoff_center.lat, conversion.dropoff_center.lng]);
    }
    transferCells.forEach((c) => {
      if (isValidCell(c)) pts.push(cellCenter(c));
    });
    adjacentPairs.forEach((p) => {
      if (isValidCell(p.from_cell)) pts.push(cellCenter(p.from_cell));
      if (isValidCell(p.to_cell)) pts.push(cellCenter(p.to_cell));
    });
    if (pts.length === 0 && selectedCells.length > 0) {
      const first = selectedCells.find((c) => isValidCell(c));
      if (first) pts.push(cellCenter(first));
    }
    return pts;
  }, [savedZones, conversion, selectedCells, transferCells, adjacentPairs]);

  const sessionKey = useMemo(
    () =>
      [
        conversion?.pickup_h3 ?? "_",
        conversion?.dropoff_h3 ?? "_",
        savedZones.map((z) => z.id).join(","),
        transferCells.slice(0, 8).join(","),
        adjacentPairs
          .slice(0, 8)
          .map((p) => `${p.from_cell}->${p.to_cell}`)
          .join(","),
      ].join("|"),
    [
      conversion?.pickup_h3,
      conversion?.dropoff_h3,
      savedZones,
      transferCells,
      adjacentPairs,
    ]
  );

  const selectedSet = useMemo(() => new Set(selectedCells), [selectedCells]);

  // Leaflet must only run in the browser. We mount H3MapLeaflet with a
  // per-instance stable key so each H3MapView gets ONE Leaflet map for its
  // lifetime. Prop-driven session changes (zones, transfer cells, etc.) just
  // re-render the children; FitBoundsOnce re-fits the viewport via sessionKey.
  // Remounting Leaflet on every session change races React Strict Mode's
  // double-invoke and trips "Map container is already initialized".
  const [clientReady, setClientReady] = useState(false);
  const [stableMapId] = useState(
    () => `h3map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );

  useEffect(() => {
    setClientReady(true);
  }, []);

  if (!clientReady) {
    return (
      <div
        style={{ height }}
        className="relative w-full rounded-xl overflow-hidden bg-muted animate-pulse flex items-center justify-center text-sm text-muted-foreground"
      >
        Loading map…
      </div>
    );
  }

  return (
    <div style={{ height }} className="relative w-full rounded-xl overflow-hidden">
      {drawEnabled && !geofenceEnabled && (
        <div className="absolute top-3 left-3 z-[1000] rounded-lg bg-card/95 border border-border px-3 py-2 text-xs shadow-card max-w-[220px]">
          <p className="font-semibold mb-1">How to draw</p>
          <p className="text-muted-foreground">Click hex cells to select/deselect. Pan and zoom to explore.</p>
        </div>
      )}
      {geofenceEnabled && (
        <div className="absolute top-3 left-3 z-[1000] rounded-lg bg-card/95 border border-border px-3 py-2 text-xs shadow-card max-w-[260px]">
          <p className="font-semibold mb-1">Geofence boundary</p>
          <p className="text-muted-foreground">
            Click the map to place vertices. Need at least 3.
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-foreground">
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-full border-2 border-white"
              style={{ background: "#f59e0b" }}
            />
            <span className="font-semibold">{boundary.length}</span>
            <span className="text-muted-foreground">
              point{boundary.length === 1 ? "" : "s"} placed
              {boundary.length >= 3 ? " · ready to save" : ""}
            </span>
          </p>
        </div>
      )}
      {selectedCells.length > 0 && drawEnabled && (
        <div className="absolute top-3 right-3 z-[1000] rounded-full bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold shadow-card">
          Selected Cells: {selectedCells.length}
        </div>
      )}

      <H3MapLeaflet
        key={stableMapId}
        defaultCenter={defaultCenter}
        zoom={zoom}
        interactive={interactive}
        drawEnabled={drawEnabled}
        geofenceEnabled={geofenceEnabled}
        boundary={boundary}
        onBoundaryChange={onBoundaryChange}
        resolution={resolution}
        selectedCells={selectedCells}
        selectedSet={selectedSet}
        onCellsChange={onCellsChange}
        savedZones={savedZones}
        conversion={conversion}
        transferCells={transferCells}
        adjacentPairs={adjacentPairs}
        fitPositions={fitPositions}
        sessionKey={sessionKey}
        userLocation={userLocation}
        showZoneTooltips={zoneTooltips}
      />
    </div>
  );
}

type H3MapLeafletProps = {
  defaultCenter: [number, number];
  zoom: number;
  interactive: boolean;
  drawEnabled: boolean;
  geofenceEnabled: boolean;
  boundary: { lat: number; lng: number }[];
  onBoundaryChange?: (pts: { lat: number; lng: number }[]) => void;
  resolution: number;
  selectedCells: string[];
  selectedSet: Set<string>;
  onCellsChange?: (cells: string[]) => void;
  savedZones: DriverZone[];
  conversion: ConvertH3Response | null;
  transferCells: string[];
  adjacentPairs: H3MapAdjacentPair[];
  fitPositions: [number, number][];
  sessionKey: string;
  userLocation: UserLocation | null;
  showZoneTooltips: boolean;
};

/**
 * Leaflet map instance. Parent (`H3MapView`) gives this component a stable
 * per-instance key so the underlying `L.Map` is created exactly once per
 * H3MapView lifetime. Session changes (zones, transfer cells, conversion)
 * only re-render the polygon/marker children; `FitBoundsOnce` re-fits the
 * viewport off the same sessionKey without tearing the map down.
 */
const H3MapLeaflet = memo(function H3MapLeaflet({
  defaultCenter,
  zoom,
  interactive,
  drawEnabled,
  geofenceEnabled,
  boundary,
  onBoundaryChange,
  resolution,
  selectedCells,
  selectedSet,
  onCellsChange,
  savedZones,
  conversion,
  transferCells,
  adjacentPairs,
  fitPositions,
  sessionKey,
  userLocation,
  showZoneTooltips,
}: H3MapLeafletProps) {
  return (
      <MapContainer
        center={defaultCenter}
        zoom={zoom}
        scrollWheelZoom={interactive}
        dragging={interactive}
        doubleClickZoom={interactive}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {fitPositions.length > 0 && (
          <FitBoundsOnce positions={fitPositions} sessionKey={sessionKey} />
        )}

        <PanToUserLocationOnce
          userLocation={userLocation}
          hasFitTargets={fitPositions.length > 0}
          zoom={zoom}
        />

        {geofenceEnabled && onBoundaryChange && (
          <GeofenceClickHandler boundary={boundary} onBoundaryChange={onBoundaryChange} />
        )}

        {drawEnabled && !geofenceEnabled && onCellsChange && (
          <MapClickHandler
            resolution={resolution}
            selectedCells={selectedCells}
            onCellsChange={onCellsChange}
          />
        )}

        {boundary.length >= 2 && (
          <Polyline
            positions={boundary.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: "#f59e0b", weight: 2, dashArray: "6 4" }}
          />
        )}
        {boundary.length >= 3 && (
          <Polygon
            positions={boundary.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{
              color: "#f59e0b",
              weight: 2,
              fillColor: "#f59e0b",
              fillOpacity: 0.2,
            }}
          />
        )}
        {/*
          Render a vertex dot at every clicked point so the user has immediate
          visual feedback (including the very first click, where no polyline or
          polygon exists yet). The first vertex is drawn a touch larger so it's
          obvious where the polygon will close back to.
        */}
        {boundary.map((p, idx) => (
          <CircleMarker
            key={`geofence-vertex-${idx}-${p.lat.toFixed(6)}-${p.lng.toFixed(6)}`}
            center={[p.lat, p.lng]}
            radius={idx === 0 ? 7 : 5}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: "#f59e0b",
              fillOpacity: 1,
              opacity: 1,
            }}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={1}>
              <span className="text-xs">
                Point {idx + 1}
                {idx === 0 && boundary.length > 1 ? " (start)" : ""}
              </span>
            </Tooltip>
          </CircleMarker>
        ))}

        <SavedZonesLayer
          savedZones={savedZones}
          selectedSet={drawEnabled ? selectedSet : EMPTY_CELL_SET}
          drawEnabled={drawEnabled}
          showTooltips={showZoneTooltips}
        />

        {/*
          Milestone 2 — Transfer cells (the H3 cells shared between two
          zones, i.e. the overlap region). Rendered in a strong amber so
          they pop against either zone palette colour.
        */}
        {transferCells.map((cell) => {
          if (!isValidCell(cell)) return null;
          return (
            <Polygon
              key={`transfer-${cell}`}
              positions={boundaryPositions(cell)}
              pathOptions={{
                color: "#b45309",
                weight: 2.5,
                fillColor: "#f59e0b",
                fillOpacity: 0.55,
              }}
            >
              <Tooltip direction="top" offset={[0, -4]} opacity={1}>
                <span className="text-xs">Transfer cell · {cell}</span>
              </Tooltip>
            </Polygon>
          );
        })}

        {/*
          Milestone 2 — Adjacent cell pairs. Render a short polyline
          between the two cell centers + a small dot at each end so the
          "handoff point" is unmistakable even on dense maps.
        */}
        {adjacentPairs.map((pair, idx) => {
          if (!isValidCell(pair.from_cell) || !isValidCell(pair.to_cell)) return null;
          const from = cellCenter(pair.from_cell);
          const to = cellCenter(pair.to_cell);
          return (
            <Polyline
              key={`adj-${idx}-${pair.from_cell}-${pair.to_cell}`}
              positions={[from, to]}
              pathOptions={{
                color: "#b45309",
                weight: 3,
                opacity: 0.9,
                dashArray: "4 4",
              }}
            >
              <Tooltip direction="top" offset={[0, -4]} opacity={1}>
                <span className="text-xs">
                  Adjacent · {pair.from_cell} ↔ {pair.to_cell}
                </span>
              </Tooltip>
            </Polyline>
          );
        })}

        {selectedCells.map((cell) => {
          if (!isValidCell(cell)) return null;
          return (
            <Polygon
              key={`sel-${cell}`}
              positions={boundaryPositions(cell)}
              pathOptions={{
                color: "#2563eb",
                weight: 2,
                fillColor: "#3b82f6",
                fillOpacity: 0.45,
              }}
            />
          );
        })}

        {conversion && (
          <>
            <Marker position={[conversion.pickup_center.lat, conversion.pickup_center.lng]} icon={pickupIcon} />
            <Marker position={[conversion.dropoff_center.lat, conversion.dropoff_center.lng]} icon={dropoffIcon} />
            <Polyline
              positions={[
                [conversion.pickup_center.lat, conversion.pickup_center.lng],
                [conversion.dropoff_center.lat, conversion.dropoff_center.lng],
              ]}
              pathOptions={{ color: "#2563eb", dashArray: "8 8", weight: 2, opacity: 0.7 }}
            />
            <Polygon
              positions={boundaryPositions(conversion.pickup_h3)}
              pathOptions={{ color: "#22c55e", weight: 2, fillColor: "#22c55e", fillOpacity: 0.35 }}
            />
            <Polygon
              positions={boundaryPositions(conversion.dropoff_h3)}
              pathOptions={{ color: "#ef4444", weight: 2, fillColor: "#ef4444", fillOpacity: 0.35 }}
            />
          </>
        )}
      </MapContainer>
  );
});

/**
 * Renders every H3 cell of every saved zone as a Leaflet polygon plus a
 * (heavy) hover tooltip. Memoized so unrelated parent re-renders — e.g.
 * the user typing in the zone-name input — don't rebuild hundreds of
 * polygon subtrees on every keystroke. We re-render only when the actual
 * zone list, the selection overlap, or the draw-mode flag changes.
 */
const SavedZonesLayer = memo(function SavedZonesLayer({
  savedZones,
  selectedSet,
  drawEnabled,
  showTooltips,
}: {
  savedZones: DriverZone[];
  selectedSet: ReadonlySet<string>;
  drawEnabled: boolean;
  showTooltips: boolean;
}) {
  return (
    <>
      {savedZones.map((zone, zoneIdx) => {
        const color = ZONE_PALETTE[zoneIdx % ZONE_PALETTE.length];
        const isUnavailable = zone.available === false;
        const modeLabel = TRANSPORT_LABEL[zone.transport_mode] ?? zone.transport_mode;
        const rateLabel = formatCurrency(Number(zone.rate_cost ?? 0), zone.currency);
        const trustScore = zone.driver_trustworthiness ?? 0;
        return zone.h3_cells.map((cell) => {
          if (!isValidCell(cell)) return null;
          const inSelection = selectedSet.has(cell);
          if (inSelection && drawEnabled) return null;
          return (
            <Polygon
              key={`zone-${zone.id}-${cell}`}
              positions={boundaryPositions(cell)}
              pathOptions={{
                color,
                weight: 1.5,
                fillColor: color,
                fillOpacity: isUnavailable ? 0.1 : 0.28,
                opacity: isUnavailable ? 0.5 : 1,
                dashArray: isUnavailable ? "4 4" : undefined,
              }}
            >
              {showTooltips && (
                <Tooltip direction="top" offset={[0, -4]} opacity={1}>
                  <div className="text-xs leading-snug min-w-[180px]">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{ background: color }}
                      />
                      <span className="font-semibold">{zone.zone_name}</span>
                    </div>
                    <div className="text-muted-foreground mb-1.5">
                      Driver: <span className="text-foreground">{zone.driver_name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                      <span className="text-muted-foreground">Rate</span>
                      <span className="font-medium text-right">{rateLabel}</span>
                      <span className="text-muted-foreground">Available</span>
                      <span
                        className={`font-medium text-right ${
                          zone.available ? "text-green-600" : "text-amber-600"
                        }`}
                      >
                        {zone.available ? "Yes" : "No"}
                      </span>
                      <span className="text-muted-foreground">Mode</span>
                      <span className="font-medium text-right">{modeLabel}</span>
                      <span className="text-muted-foreground">Trust forwarder</span>
                      <span className="font-medium text-right">
                        {zone.trust_payment_forwarder ? "Yes" : "No"}
                      </span>
                      <span className="text-muted-foreground">Trustworthiness</span>
                      <span className="font-medium text-right">{trustScore}</span>
                      <span className="text-muted-foreground">Cells · Res</span>
                      <span className="font-medium text-right">
                        {zone.cell_count} · r{zone.resolution}
                      </span>
                    </div>
                  </div>
                </Tooltip>
              )}
            </Polygon>
          );
        });
      })}
    </>
  );
});
