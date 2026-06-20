"use client";

import { cellToBoundary, cellToLatLng, latLngToCell, isValidCell } from "h3-js";
import L from "leaflet";
import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { cn } from "@/lib/utils";
import { formatCellCoords, zoneCentroid } from "@/lib/geo";
import {
  isHubMode,
  makeHubIcon,
  makeTerminalIcon,
  normalizeTransportMode,
  TRANSPORT_MODE_META,
  type HubRole,
} from "@/lib/transportMode";
import type { ConvertH3Response, DriverZone, HubTerminal } from "@/types";
import { HandoffMapTooltip } from "@/components/map/HandoffMapTooltip";
import { SeaRoutePolyline } from "@/components/map/SeaRoutePolyline";
import { TransferCellMapTooltip } from "@/components/map/TransferCellMapTooltip";
import { ZONE_MAP_TOOLTIP_CLASS, ZoneMapTooltip } from "@/components/map/ZoneMapTooltip";
import { computeSeaRoute } from "@/lib/seaRoute";

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

/** Keep Leaflet tile grid aligned when the map container changes size. */
function MapResizeSync() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const observeTarget = container.parentElement ?? container;

    const sync = () => {
      try {
        map.invalidateSize({ animate: false });
      } catch {
        /* map torn down */
      }
    };

    sync();
    const raf = requestAnimationFrame(sync);

    const observer = new ResizeObserver(() => sync());
    observer.observe(observeTarget);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [map]);

  return null;
}

function resolveMapHeight(height: string | number | undefined): {
  styleHeight?: string;
  fillParent: boolean;
} {
  if (height === "100%" || height === "100vh") {
    return { fillParent: true };
  }
  if (typeof height === "number") {
    return { styleHeight: `${height}px`, fillParent: false };
  }
  if (typeof height === "string" && height.trim()) {
    return { styleHeight: height, fillParent: false };
  }
  return { styleHeight: "360px", fillParent: false };
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

/**
 * A hub is only renderable once it has real, finite coordinates. While the
 * user is typing a terminal name (before picking a result or clicking the
 * map) the hub exists with NaN lat/lng, which would crash Leaflet's LatLng.
 */
function hasValidCoords(
  hub: HubTerminal | null | undefined
): hub is HubTerminal {
  return (
    !!hub &&
    Number.isFinite(hub.lat) &&
    Number.isFinite(hub.lng)
  );
}

/** Place departure or arrival terminal hubs by clicking the map. */
function HubPlacementHandler({
  activeHubPick,
  departureHub,
  arrivalHub,
  onDepartureHubChange,
  onArrivalHubChange,
}: {
  activeHubPick: HubRole;
  departureHub: HubTerminal | null;
  arrivalHub: HubTerminal | null;
  onDepartureHubChange?: (hub: HubTerminal | null) => void;
  onArrivalHubChange?: (hub: HubTerminal | null) => void;
}) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      if (activeHubPick === "departure") {
        onDepartureHubChange?.({
          name: departureHub?.name ?? "",
          lat,
          lng,
        });
      } else {
        onArrivalHubChange?.({
          name: arrivalHub?.name ?? "",
          lat,
          lng,
        });
      }
    },
  });
  return null;
}

type GeofencePoint = { lat: number; lng: number };

function makeGeofenceVertexIcon(large: boolean): L.DivIcon {
  const r = large ? 7 : 5;
  const pad = 4;
  const size = r * 2 + pad;
  return L.divIcon({
    className: "geofence-vertex-icon",
    html: `<div style="width:${r * 2}px;height:${r * 2}px;border-radius:50%;background:#f59e0b;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:grab"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const GEOFENCE_VERTEX_ICON = makeGeofenceVertexIcon(false);
const GEOFENCE_START_VERTEX_ICON = makeGeofenceVertexIcon(true);

/** Appends a vertex on empty-map clicks (edge / marker clicks stop propagation). */
function GeofenceMapClickHandler({
  boundary,
  onBoundaryChange,
}: {
  boundary: GeofencePoint[];
  onBoundaryChange: (pts: GeofencePoint[]) => void;
}) {
  const boundaryRef = useRef(boundary);
  const onChangeRef = useRef(onBoundaryChange);
  boundaryRef.current = boundary;
  onChangeRef.current = onBoundaryChange;

  useMapEvents({
    click(e) {
      const b = boundaryRef.current;
      onChangeRef.current([
        ...b,
        { lat: e.latlng.lat, lng: e.latlng.lng },
      ]);
    },
  });
  return null;
}

interface GeofenceEdgeSegment {
  a: GeofencePoint;
  b: GeofencePoint;
  /** Index at which to splice the new vertex into `boundary`. */
  insertAt: number;
}

function buildGeofenceEdgeSegments(boundary: GeofencePoint[]): GeofenceEdgeSegment[] {
  if (boundary.length < 2) return [];
  const segs: GeofenceEdgeSegment[] = [];
  for (let i = 0; i < boundary.length - 1; i++) {
    segs.push({ a: boundary[i], b: boundary[i + 1], insertAt: i + 1 });
  }
  // Closing edge (last vertex back to start) — insert before index 0.
  if (boundary.length >= 3) {
    segs.push({
      a: boundary[boundary.length - 1],
      b: boundary[0],
      insertAt: 0,
    });
  }
  return segs;
}

/**
 * Interactive geofence editor: draggable vertices, click an edge to insert a
 * point, optionally click empty map to append. Fill / outline are
 * non-interactive so edge hit-targets and markers receive pointer events
 * reliably.
 *
 * `appendOnMapClick` is opt-in so the edit-zone flow can disable accidental
 * vertex placement when the user just wants to pan or click "the other area"
 * of the map. New-zone flows leave it on so the click-to-draw UX works
 * exactly as before.
 */
const GeofenceEditor = memo(function GeofenceEditor({
  boundary,
  onBoundaryChange,
  appendOnMapClick,
}: {
  boundary: GeofencePoint[];
  onBoundaryChange: (pts: GeofencePoint[]) => void;
  appendOnMapClick: boolean;
}) {
  const segments = useMemo(() => buildGeofenceEdgeSegments(boundary), [boundary]);

  const moveVertex = (index: number, lat: number, lng: number) => {
    onBoundaryChange(
      boundary.map((p, i) => (i === index ? { lat, lng } : p))
    );
  };

  const insertOnEdge = (insertAt: number, lat: number, lng: number) => {
    const next = [...boundary];
    next.splice(insertAt, 0, { lat, lng });
    onBoundaryChange(next);
  };

  const stopMapClick = (e: L.LeafletEvent) => {
    const oe = (e as L.LeafletMouseEvent).originalEvent;
    if (oe) L.DomEvent.stopPropagation(oe);
  };

  return (
    <>
      {boundary.length >= 2 && (
        <Polyline
          positions={boundary.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{
            color: "#f59e0b",
            weight: 2,
            dashArray: "6 4",
            interactive: false,
          }}
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
            interactive: false,
          }}
        />
      )}

      {segments.map((seg, idx) => (
        <Polyline
          key={`geofence-edge-${idx}-${seg.insertAt}`}
          positions={[
            [seg.a.lat, seg.a.lng],
            [seg.b.lat, seg.b.lng],
          ]}
          pathOptions={{
            color: "#f59e0b",
            weight: 16,
            opacity: 0.01,
            lineCap: "round",
            lineJoin: "round",
          }}
          eventHandlers={{
            click: (e) => {
              stopMapClick(e);
              insertOnEdge(seg.insertAt, e.latlng.lat, e.latlng.lng);
            },
          }}
        />
      ))}

      {boundary.map((p, idx) => (
        <Marker
          key={`geofence-vertex-${idx}`}
          position={[p.lat, p.lng]}
          draggable
          icon={idx === 0 ? GEOFENCE_START_VERTEX_ICON : GEOFENCE_VERTEX_ICON}
          eventHandlers={{
            dragstart: stopMapClick,
            drag: stopMapClick,
            dragend: (e) => {
              stopMapClick(e);
              const ll = e.target.getLatLng();
              moveVertex(idx, ll.lat, ll.lng);
            },
            click: stopMapClick,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]} opacity={1}>
            <span className="text-xs">
              Point {idx + 1}
              {idx === 0 && boundary.length > 1 ? " (start)" : ""}
              <span className="block text-muted-foreground font-normal">Drag to move</span>
            </span>
          </Tooltip>
        </Marker>
      ))}

      {appendOnMapClick && (
        <GeofenceMapClickHandler boundary={boundary} onBoundaryChange={onBoundaryChange} />
      )}
    </>
  );
});

const pickupIcon = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const handoffIcon = L.divIcon({
  className: "handoff-marker-icon",
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#f59e0b;border:2.5px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const handoffIconFocused = L.divIcon({
  className: "handoff-marker-icon",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#f59e0b;border:3px solid #2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.35),0 2px 8px rgba(0,0,0,.5)"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
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

/** Labeled transfer/handoff point between two transporters on a selected route. */
export interface H3MapHandoffMarker {
  /** 1-based connection point number along the selected route. */
  index?: number;
  lat: number;
  lng: number;
  fromTransport: string;
  toTransport: string;
  fromZone?: string | null;
  toZone?: string | null;
  /** overlap | adjacent | hub — drives the tooltip subtitle. */
  connectionType?: string | null;
  /** Shared H3 cell where the handoff occurs (overlap or adjacent). */
  transferCell?: string | null;
  /** Full zone records for the detailed handoff tooltip. */
  fromZoneDetail?: DriverZone | null;
  toZoneDetail?: DriverZone | null;
  fromColor?: string | null;
  toColor?: string | null;
}

const EMPTY_HANDOFF: H3MapHandoffMarker[] = [];

/** Leaflet tooltip classes — see `globals.css`. */
const MAP_WIDE_TOOLTIP_CLASS = "map-wide-tooltip";
const MAP_ENDPOINT_TOOLTIP_CLASS = "map-endpoint-tooltip";

/** Sender/receiver labels for pickup and drop-off map markers. */
export interface H3MapEndpointLabels {
  senderName?: string | null;
  senderAddress?: string | null;
  receiverName?: string | null;
  receiverAddress?: string | null;
}

function MapWideTooltipContent({
  title,
  primary,
  secondary,
}: {
  title: string;
  primary?: string | null;
  secondary?: string | null;
}) {
  return (
    <div className="text-xs leading-snug">
      <div className="font-semibold">{title}</div>
      {primary ? <div className="font-medium mt-0.5">{primary}</div> : null}
      {secondary ? (
        <div className="text-muted-foreground font-normal mt-0.5">{secondary}</div>
      ) : null}
    </div>
  );
}

export interface H3MapViewProps {
  height?: string | number;
  /** Extra classes on the outer map shell (e.g. `absolute inset-0` when filling a sized parent). */
  className?: string;
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
   * Drawable legs of a selected route (pickup→handoff, land→land transfer,
   * handoff→drop-off). Air/sea legs are intentionally omitted by the caller
   * because each air/sea zone already renders its own flight path / shipping
   * lane. When non-null the straight pickup→drop-off line is suppressed and
   * these solid legs are drawn instead. Null = overview (direct dashed line).
   */
  routeSegments?: { lat: number; lng: number }[][] | null;
  /**
   * Transfer/handoff markers for a selected route — pin each border
   * crossing with the transporter names on either side.
   */
  handoffMarkers?: H3MapHandoffMarker[];
  /** Names/addresses shown on pickup (sender) and drop-off (receiver) markers. */
  endpointLabels?: H3MapEndpointLabels | null;
  /**
   * Hover tooltips on saved-zone cells are expensive (one Leaflet Tooltip
   * per cell). Defaults to `interactive`; set false on previews / thumbnails.
   */
  showZoneTooltips?: boolean;
  /**
   * Controls which geometry drives the auto-fit viewport.
   *  - "all" (default): union of saved zones + pickup/drop-off +
   *    transfer/adjacency handoff cells.
   *  - "endpoints": only the pickup/drop-off cells and the transfer /
   *    adjacency handoff cells. Use this on the order preview so a large
   *    covering zone (hundreds of cells across a wide area) doesn't zoom the
   *    map out until the pickup/drop-off hexagons become invisible dots.
   */
  fitFocus?: "all" | "endpoints";
  /**
   * When provided, the map's viewport fits to this single zone's geometry
   * (its boundary, falling back to a sampled set of its H3-cell centers)
   * instead of the union of every saved zone. Changing the focused zone's
   * id re-fits the viewport — so clicking "Edit" / "View" on a different
   * zone snaps the map to that area without otherwise interfering with the
   * interactive selection state.
   */
  focusZone?: DriverZone | null;
  /**
   * When set, the viewport snaps to this handoff point and its two endpoint
   * zones (used by "View connection point #N" on order route previews).
   */
  focusHandoff?: H3MapHandoffMarker | null;
  /**
   * Geofence-only: when true, clicking the empty map appends a new vertex.
   * Defaults to true (the original "click to draw" UX for new zones). The
   * edit-zone flow should pass `false` so accidental clicks outside the
   * polygon don't keep tacking points onto a finished geofence — there,
   * vertex changes are limited to dragging an existing point or clicking
   * an edge to insert one between two neighbours.
   */
  geofenceAppendOnMapClick?: boolean;
  /**
   * Air/sea route creation: click the map to place departure and arrival
   * terminal hubs. When enabled, H3 cell drawing and geofence are disabled.
   */
  hubPlacementEnabled?: boolean;
  /** Transport mode driving hub placement (air or sea). */
  hubTransportMode?: "air" | "sea";
  activeHubPick?: HubRole;
  departureHub?: HubTerminal | null;
  arrivalHub?: HubTerminal | null;
  onDepartureHubChange?: (hub: HubTerminal | null) => void;
  onArrivalHubChange?: (hub: HubTerminal | null) => void;
}

export function H3MapView({
  height = 360,
  className,
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
  routeSegments = null,
  handoffMarkers = EMPTY_HANDOFF,
  endpointLabels = null,
  showZoneTooltips,
  focusZone = null,
  focusHandoff = null,
  geofenceAppendOnMapClick = true,
  fitFocus = "all",
  hubPlacementEnabled = false,
  hubTransportMode = "air",
  activeHubPick = "departure",
  departureHub = null,
  arrivalHub = null,
  onDepartureHubChange,
  onArrivalHubChange,
}: H3MapViewProps) {
  const hubMeta = TRANSPORT_MODE_META[hubTransportMode];
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

  /**
   * Positions describing the explicitly-focused zone (Edit / View target).
   * Prefer the polygon boundary when present so big geofences with tens of
   * thousands of cells stay cheap; otherwise sample cell centers (capped)
   * for the same reason.
   */
  const focusPositions = useMemo<[number, number][] | null>(() => {
    if (!focusZone) return null;
    const pts: [number, number][] = [];
    // Air/sea zones are a single hub/port — fit to that point, not the
    // (hidden) H3 catchment footprint.
    if (isHubMode(normalizeTransportMode(focusZone.transport_mode))) {
      if (focusZone.departure_hub) pts.push([focusZone.departure_hub.lat, focusZone.departure_hub.lng]);
      if (focusZone.arrival_hub) pts.push([focusZone.arrival_hub.lat, focusZone.arrival_hub.lng]);
      if (pts.length === 0) {
        const hub = zoneCentroid(focusZone);
        if (hub) pts.push([hub.lat, hub.lng]);
      }
      return pts;
    }
    if (focusZone.boundary && focusZone.boundary.length >= 3) {
      focusZone.boundary.forEach((p) => pts.push([p.lat, p.lng]));
      return pts;
    }
    const cells = focusZone.h3_cells ?? [];
    if (cells.length === 0) return pts;
    const MAX_SAMPLE = 128;
    const step = cells.length > MAX_SAMPLE ? cells.length / MAX_SAMPLE : 1;
    for (let i = 0; i < cells.length; i += step >= 1 ? Math.floor(step) : 1) {
      const c = cells[Math.floor(i)];
      if (isValidCell(c)) pts.push(cellCenter(c));
      if (pts.length >= MAX_SAMPLE) break;
    }
    return pts;
  }, [focusZone]);

  const focusHandoffPositions = useMemo<[number, number][] | null>(() => {
    if (!focusHandoff) return null;
    const pts: [number, number][] = [];
    if (Number.isFinite(focusHandoff.lat) && Number.isFinite(focusHandoff.lng)) {
      pts.push([focusHandoff.lat, focusHandoff.lng]);
    }
    const sampleZone = (zone: DriverZone | null | undefined) => {
      if (!zone) return;
      if (isHubMode(normalizeTransportMode(zone.transport_mode))) {
        if (zone.departure_hub) pts.push([zone.departure_hub.lat, zone.departure_hub.lng]);
        if (zone.arrival_hub) pts.push([zone.arrival_hub.lat, zone.arrival_hub.lng]);
        return;
      }
      const cells = zone.h3_cells ?? [];
      const step = cells.length > 24 ? Math.ceil(cells.length / 24) : 1;
      for (let i = 0; i < cells.length; i += step) {
        const c = cells[i];
        if (isValidCell(c)) pts.push(cellCenter(c));
      }
    };
    sampleZone(focusHandoff.fromZoneDetail);
    sampleZone(focusHandoff.toZoneDetail);
    return pts.length > 0 ? pts : null;
  }, [focusHandoff]);

  // Sea routes follow shipping lanes that can bulge far offshore, so fitting
  // the viewport to just the terminals would leave the route off-screen.
  // Collect every sea pair (the live placement preview + saved sea zones),
  // resolve their maritime paths, and feed the points into fit-bounds below.
  const seaPairsKey = useMemo(() => {
    const parts: string[] = [];
    if (
      hubPlacementEnabled &&
      hubTransportMode === "sea" &&
      hasValidCoords(departureHub) &&
      hasValidCoords(arrivalHub)
    ) {
      parts.push(
        `p:${departureHub.lat.toFixed(3)},${departureHub.lng.toFixed(3)},${arrivalHub.lat.toFixed(
          3
        )},${arrivalHub.lng.toFixed(3)}`
      );
    }
    savedZones.forEach((z) => {
      if (
        normalizeTransportMode(z.transport_mode) === "sea" &&
        hasValidCoords(z.departure_hub) &&
        hasValidCoords(z.arrival_hub)
      ) {
        parts.push(
          `z${z.id}:${z.departure_hub.lat.toFixed(3)},${z.departure_hub.lng.toFixed(
            3
          )},${z.arrival_hub.lat.toFixed(3)},${z.arrival_hub.lng.toFixed(3)}`
        );
      }
    });
    return parts.join("|");
  }, [hubPlacementEnabled, hubTransportMode, departureHub, arrivalHub, savedZones]);

  const [seaFitPoints, setSeaFitPoints] = useState<[number, number][]>([]);
  useEffect(() => {
    let cancelled = false;
    const pairs: { dep: { lat: number; lng: number }; arr: { lat: number; lng: number } }[] = [];
    if (
      hubPlacementEnabled &&
      hubTransportMode === "sea" &&
      hasValidCoords(departureHub) &&
      hasValidCoords(arrivalHub)
    ) {
      pairs.push({
        dep: { lat: departureHub.lat, lng: departureHub.lng },
        arr: { lat: arrivalHub.lat, lng: arrivalHub.lng },
      });
    }
    savedZones.forEach((z) => {
      if (
        normalizeTransportMode(z.transport_mode) === "sea" &&
        hasValidCoords(z.departure_hub) &&
        hasValidCoords(z.arrival_hub)
      ) {
        pairs.push({
          dep: { lat: z.departure_hub.lat, lng: z.departure_hub.lng },
          arr: { lat: z.arrival_hub.lat, lng: z.arrival_hub.lng },
        });
      }
    });
    if (pairs.length === 0) {
      setSeaFitPoints([]);
      return;
    }
    Promise.all(pairs.map((p) => computeSeaRoute(p.dep, p.arr))).then((routes) => {
      if (cancelled) return;
      const pts: [number, number][] = [];
      routes.forEach((r) => r?.forEach((c) => pts.push(c)));
      setSeaFitPoints(pts);
    });
    return () => {
      cancelled = true;
    };
    // seaPairsKey captures the meaningful inputs; the raw objects are unstable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seaPairsKey]);

  // Bounds are computed from "anchor" geometry only — pickup/drop-off cells,
  // saved zones, and (M2) transfer cells + adjacency pairs — so the map
  // doesn't reflow every time the user picks a cell. When `focusZone` is
  // provided we short-circuit to its geometry so the viewport snaps to the
  // zone the user just clicked Edit / View on.
  const fitPositions = useMemo(() => {
    if (focusHandoffPositions && focusHandoffPositions.length > 0) return focusHandoffPositions;
    if (focusPositions && focusPositions.length > 0) return focusPositions;
    const pts: [number, number][] = [];
    // Use cell centers (1 point per cell) for fit-bounds so the viewport
    // covers every saved cell without paying the full 6-vertex cost. When
    // `fitFocus === "endpoints"` we deliberately skip the (potentially huge)
    // saved-zone footprint so the viewport snaps to the pickup → drop-off
    // corridor instead of zooming out to the whole covering zone.
    if (fitFocus !== "endpoints") {
      savedZones.forEach((z) => {
        if (isHubMode(normalizeTransportMode(z.transport_mode))) {
          if (z.departure_hub) pts.push([z.departure_hub.lat, z.departure_hub.lng]);
          if (z.arrival_hub) pts.push([z.arrival_hub.lat, z.arrival_hub.lng]);
          if (!z.departure_hub && !z.arrival_hub) {
            const hub = zoneCentroid(z);
            if (hub) pts.push([hub.lat, hub.lng]);
          }
          return;
        }
        z.h3_cells.forEach((c) => {
          if (isValidCell(c)) pts.push(cellCenter(c));
        });
      });
    }
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
    handoffMarkers.forEach((m) => {
      if (Number.isFinite(m.lat) && Number.isFinite(m.lng)) pts.push([m.lat, m.lng]);
    });
    if (geofenceEnabled && boundary.length > 0) {
      boundary.forEach((p) => pts.push([p.lat, p.lng]));
    }
    if (hubPlacementEnabled) {
      if (hasValidCoords(departureHub)) pts.push([departureHub.lat, departureHub.lng]);
      if (hasValidCoords(arrivalHub)) pts.push([arrivalHub.lat, arrivalHub.lng]);
    }
    // Include resolved sea-route geometry so the offshore shipping lane stays
    // inside the viewport, not just the two terminals.
    seaFitPoints.forEach((p) => pts.push(p));
    if (pts.length === 0 && selectedCells.length > 0) {
      const first = selectedCells.find((c) => isValidCell(c));
      if (first) pts.push(cellCenter(first));
    }
    return pts;
  }, [focusHandoffPositions, focusPositions, savedZones, conversion, selectedCells, transferCells, adjacentPairs, handoffMarkers, geofenceEnabled, boundary, fitFocus, hubPlacementEnabled, departureHub, arrivalHub, seaFitPoints]);

  const sessionKey = useMemo(
    () =>
      [
        focusZone?.id != null ? `focus:${focusZone.id}` : "_",
        focusHandoff?.index != null ? `handoff:${focusHandoff.index}` : "_",
        conversion?.pickup_h3 ?? "_",
        conversion?.dropoff_h3 ?? "_",
        savedZones.map((z) => z.id).join(","),
        transferCells.slice(0, 8).join(","),
        adjacentPairs
          .slice(0, 8)
          .map((p) => `${p.from_cell}->${p.to_cell}`)
          .join(","),
        routeSegments
          ? routeSegments
              .map((seg) => seg.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join(">"))
              .join(";")
          : "_",
        handoffMarkers
          .map((m) => `${m.lat.toFixed(3)},${m.lng.toFixed(3)}:${m.fromTransport}->${m.toTransport}`)
          .join(","),
      ].join("|"),
    [
      focusZone?.id,
      focusHandoff?.index,
      conversion?.pickup_h3,
      conversion?.dropoff_h3,
      savedZones,
      transferCells,
      adjacentPairs,
      routeSegments,
      handoffMarkers,
    ]
  );

  const selectedSet = useMemo(() => new Set(selectedCells), [selectedCells]);

  // Leaflet must only run in the browser. Parent pages load H3MapView via
  // `dynamic(..., { ssr: false })`, which already shows a loading shell.
  // Do NOT gate map mount behind a clientReady flag — React Strict Mode
  // remount resets that flag and races Leaflet teardown with a second init.
  const [stableMapId] = useState(
    () => `h3map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );

  const { styleHeight, fillParent } = resolveMapHeight(height);

  return (
    <div
      style={styleHeight ? { height: styleHeight } : undefined}
      className={cn(
        "relative w-full rounded-xl overflow-hidden",
        fillParent && "h-full min-h-0",
        className
      )}
    >
      {drawEnabled && !geofenceEnabled && (
        <div className="absolute top-3 left-3 z-[1000] rounded-lg bg-card/95 border border-border px-3 py-2 text-xs shadow-card max-w-[220px]">
          <p className="font-semibold mb-1">How to draw</p>
          <p className="text-muted-foreground">Click hex cells to select/deselect. Pan and zoom to explore.</p>
        </div>
      )}
      {hubPlacementEnabled && (
        <div className="absolute top-3 left-3 z-[1000] rounded-lg bg-card/95 border border-border px-3 py-2 text-xs shadow-card max-w-[280px]">
          <p className="font-semibold mb-1">
            {hubMeta.label} route terminals
          </p>
          <p className="text-muted-foreground">
            Click the map to place the{" "}
            <span className="font-medium text-foreground">
              {activeHubPick === "departure" ? "departure" : "arrival"}
            </span>{" "}
            {hubMeta.hubNoun}.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2 text-[10px]">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500" /> Departure
              {departureHub ? " ✓" : ""}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-orange-500" /> Arrival
              {arrivalHub ? " ✓" : ""}
            </span>
          </div>
        </div>
      )}
      {geofenceEnabled && (
        <div className="absolute top-3 left-3 z-[1000] rounded-lg bg-card/95 border border-border px-3 py-2 text-xs shadow-card max-w-[260px]">
          <p className="font-semibold mb-1">Geofence boundary</p>
          <p className="text-muted-foreground">
            {geofenceAppendOnMapClick
              ? "Drag points to move. Click the map to add a vertex, or click a line to insert one. Need at least 3."
              : "Drag points to move. Click a line to insert a new vertex."}
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
        geofenceAppendOnMapClick={geofenceAppendOnMapClick}
        resolution={resolution}
        selectedCells={selectedCells}
        selectedSet={selectedSet}
        onCellsChange={onCellsChange}
        savedZones={savedZones}
        conversion={conversion}
        transferCells={transferCells}
        adjacentPairs={adjacentPairs}
        routeSegments={routeSegments}
        handoffMarkers={handoffMarkers}
        focusHandoff={focusHandoff}
        endpointLabels={endpointLabels}
        fitPositions={fitPositions}
        sessionKey={sessionKey}
        userLocation={userLocation}
        showZoneTooltips={zoneTooltips}
        hubPlacementEnabled={hubPlacementEnabled}
        hubTransportMode={hubTransportMode}
        activeHubPick={activeHubPick}
        departureHub={departureHub}
        arrivalHub={arrivalHub}
        onDepartureHubChange={onDepartureHubChange}
        onArrivalHubChange={onArrivalHubChange}
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
  geofenceAppendOnMapClick: boolean;
  resolution: number;
  selectedCells: string[];
  selectedSet: Set<string>;
  onCellsChange?: (cells: string[]) => void;
  savedZones: DriverZone[];
  conversion: ConvertH3Response | null;
  transferCells: string[];
  adjacentPairs: H3MapAdjacentPair[];
  routeSegments: { lat: number; lng: number }[][] | null;
  handoffMarkers: H3MapHandoffMarker[];
  focusHandoff: H3MapHandoffMarker | null;
  endpointLabels: H3MapEndpointLabels | null;
  fitPositions: [number, number][];
  sessionKey: string;
  userLocation: UserLocation | null;
  showZoneTooltips: boolean;
  hubPlacementEnabled: boolean;
  hubTransportMode: "air" | "sea";
  activeHubPick: HubRole;
  departureHub: HubTerminal | null;
  arrivalHub: HubTerminal | null;
  onDepartureHubChange?: (hub: HubTerminal | null) => void;
  onArrivalHubChange?: (hub: HubTerminal | null) => void;
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
  geofenceAppendOnMapClick,
  resolution,
  selectedCells,
  selectedSet,
  onCellsChange,
  savedZones,
  conversion,
  transferCells,
  adjacentPairs,
  routeSegments,
  handoffMarkers,
  focusHandoff,
  endpointLabels,
  fitPositions,
  sessionKey,
  userLocation,
  showZoneTooltips,
  hubPlacementEnabled,
  hubTransportMode,
  activeHubPick,
  departureHub,
  arrivalHub,
  onDepartureHubChange,
  onArrivalHubChange,
}: H3MapLeafletProps) {
  const zoneColorById = useMemo(() => {
    const m = new Map<number, string>();
    savedZones.forEach((z, i) => {
      m.set(z.id, ZONE_PALETTE[i % ZONE_PALETTE.length]);
    });
    return m;
  }, [savedZones]);

  return (
      <MapContainer
        center={defaultCenter}
        zoom={zoom}
        scrollWheelZoom={interactive}
        dragging={interactive}
        doubleClickZoom={interactive}
        className="h-full w-full"
      >
        <MapResizeSync />
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

        {drawEnabled && !geofenceEnabled && !hubPlacementEnabled && onCellsChange && (
          <MapClickHandler
            resolution={resolution}
            selectedCells={selectedCells}
            onCellsChange={onCellsChange}
          />
        )}

        {hubPlacementEnabled && (onDepartureHubChange || onArrivalHubChange) && (
          <HubPlacementHandler
            activeHubPick={activeHubPick}
            departureHub={departureHub}
            arrivalHub={arrivalHub}
            onDepartureHubChange={onDepartureHubChange}
            onArrivalHubChange={onArrivalHubChange}
          />
        )}

        {hubPlacementEnabled && hasValidCoords(departureHub) && (
          <Marker
            position={[departureHub.lat, departureHub.lng]}
            icon={makeTerminalIcon(hubTransportMode, "departure")}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={1}>
              <span className="text-xs font-semibold">Departure: {departureHub.name || "Unnamed"}</span>
            </Tooltip>
          </Marker>
        )}
        {hubPlacementEnabled && hasValidCoords(arrivalHub) && (
          <Marker
            position={[arrivalHub.lat, arrivalHub.lng]}
            icon={makeTerminalIcon(hubTransportMode, "arrival")}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={1}>
              <span className="text-xs font-semibold">Arrival: {arrivalHub.name || "Unnamed"}</span>
            </Tooltip>
          </Marker>
        )}
        {hubPlacementEnabled &&
          hasValidCoords(departureHub) &&
          hasValidCoords(arrivalHub) &&
          (hubTransportMode === "sea" ? (
            <SeaRoutePolyline
              departure={{ lat: departureHub.lat, lng: departureHub.lng }}
              arrival={{ lat: arrivalHub.lat, lng: arrivalHub.lng }}
              pathOptions={{
                color: TRANSPORT_MODE_META[hubTransportMode].color,
                weight: 3,
                opacity: 0.85,
                dashArray: TRANSPORT_MODE_META[hubTransportMode].dashArray,
                lineCap: "round",
              }}
            />
          ) : (
            <Polyline
              positions={[
                [departureHub.lat, departureHub.lng],
                [arrivalHub.lat, arrivalHub.lng],
              ]}
              pathOptions={{
                color: TRANSPORT_MODE_META[hubTransportMode].color,
                weight: 3,
                opacity: 0.85,
                dashArray: TRANSPORT_MODE_META[hubTransportMode].dashArray,
                lineCap: "round",
              }}
            />
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
              <Tooltip
                direction="top"
                offset={[0, -8]}
                opacity={1}
                sticky
                className={MAP_WIDE_TOOLTIP_CLASS}
              >
                <TransferCellMapTooltip
                  cell={cell}
                  zones={savedZones}
                  zoneColorById={zoneColorById}
                />
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
                  Adjacent · {formatCellCoords(pair.from_cell)} ↔ {formatCellCoords(pair.to_cell)}
                </span>
              </Tooltip>
            </Polyline>
          );
        })}

        {handoffMarkers.map((marker, idx) => {
          if (!Number.isFinite(marker.lat) || !Number.isFinite(marker.lng)) return null;
          const isFocused =
            focusHandoff != null &&
            (focusHandoff.index != null && marker.index != null
              ? focusHandoff.index === marker.index
              : focusHandoff.lat === marker.lat && focusHandoff.lng === marker.lng);
          return (
            <Marker
              key={`handoff-${marker.index ?? idx}-${marker.lat.toFixed(5)}-${marker.lng.toFixed(5)}`}
              position={[marker.lat, marker.lng]}
              icon={isFocused ? handoffIconFocused : handoffIcon}
              zIndexOffset={isFocused ? 500 : 400}
            >
              <Tooltip
                direction="top"
                offset={[0, -10]}
                opacity={1}
                sticky={!isFocused}
                permanent={isFocused}
                interactive
                className={MAP_WIDE_TOOLTIP_CLASS}
              >
                <HandoffMapTooltip marker={marker} />
              </Tooltip>
            </Marker>
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

        {geofenceEnabled && onBoundaryChange && (
          <GeofenceEditor
            boundary={boundary}
            onBoundaryChange={onBoundaryChange}
            appendOnMapClick={geofenceAppendOnMapClick}
          />
        )}

        {conversion && (
          <>
            <Marker
              position={[conversion.pickup_center.lat, conversion.pickup_center.lng]}
              icon={pickupIcon}
              zIndexOffset={600}
            >
              <Tooltip
                direction="top"
                offset={[0, -10]}
                opacity={1}
                permanent
                interactive
                className={`${MAP_WIDE_TOOLTIP_CLASS} ${MAP_ENDPOINT_TOOLTIP_CLASS}`}
              >
                <MapWideTooltipContent
                  title="Pickup"
                  primary={endpointLabels?.senderName ?? "Sender"}
                  secondary={endpointLabels?.senderAddress}
                />
              </Tooltip>
            </Marker>
            <Marker
              position={[conversion.dropoff_center.lat, conversion.dropoff_center.lng]}
              icon={dropoffIcon}
              zIndexOffset={600}
            >
              <Tooltip
                direction="top"
                offset={[0, -10]}
                opacity={1}
                permanent
                interactive
                className={`${MAP_WIDE_TOOLTIP_CLASS} ${MAP_ENDPOINT_TOOLTIP_CLASS}`}
              >
                <MapWideTooltipContent
                  title="Delivery"
                  primary={endpointLabels?.receiverName ?? "Receiver"}
                  secondary={endpointLabels?.receiverAddress}
                />
              </Tooltip>
            </Marker>
            {routeSegments && routeSegments.length > 0 ? (
              <>
                {/* Selected route: land legs only — air/sea zones draw their own
                    flight path / shipping lane between departure and arrival hubs. */}
                {routeSegments.map((seg, i) =>
                  seg.length >= 2 ? (
                    <Polyline
                      key={`route-seg-${i}`}
                      positions={seg.map((p) => [p.lat, p.lng] as [number, number])}
                      pathOptions={{
                        color: "#2563eb",
                        weight: 3,
                        opacity: 0.9,
                        lineCap: "round",
                        lineJoin: "round",
                      }}
                    />
                  ) : null
                )}
              </>
            ) : (
              <Polyline
                positions={[
                  [conversion.pickup_center.lat, conversion.pickup_center.lng],
                  [conversion.dropoff_center.lat, conversion.dropoff_center.lng],
                ]}
                pathOptions={{ color: "#2563eb", dashArray: "8 8", weight: 2, opacity: 0.7 }}
              />
            )}
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
function zoneMapTooltip(
  zone: DriverZone,
  color: string,
  opts: { sticky?: boolean } = {}
) {
  return (
    <Tooltip
      direction="top"
      offset={[0, -10]}
      opacity={1}
      sticky={opts.sticky ?? false}
      className={ZONE_MAP_TOOLTIP_CLASS}
    >
      <ZoneMapTooltip zone={zone} color={color} />
    </Tooltip>
  );
}

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
        const mode = normalizeTransportMode(zone.transport_mode);

        // Air / sea routes: mode icon at each terminal (not DEP/ARR point badges)
        // plus the flight path / shipping lane between them.
        if (isHubMode(mode)) {
          const dep = zone.departure_hub;
          const arr = zone.arrival_hub;
          const routeMeta = TRANSPORT_MODE_META[mode];
          if (hasValidCoords(dep) && hasValidCoords(arr)) {
            const hubTooltip = zoneMapTooltip(zone, color, { sticky: true });
            return (
              <Fragment key={`zone-route-group-${zone.id}`}>
                <Marker
                  position={[dep.lat, dep.lng]}
                  icon={makeHubIcon(mode, { muted: isUnavailable })}
                >
                  {hubTooltip}
                </Marker>
                <Marker
                  position={[arr.lat, arr.lng]}
                  icon={makeHubIcon(mode, { muted: isUnavailable })}
                >
                  {hubTooltip}
                </Marker>
                {mode === "sea" ? (
                  <SeaRoutePolyline
                    departure={{ lat: dep.lat, lng: dep.lng }}
                    arrival={{ lat: arr.lat, lng: arr.lng }}
                    pathOptions={{
                      color: routeMeta.color,
                      weight: 2.5,
                      opacity: isUnavailable ? 0.4 : 0.85,
                      dashArray: routeMeta.dashArray,
                      lineCap: "round",
                    }}
                  />
                ) : (
                  <Polyline
                    positions={[
                      [dep.lat, dep.lng],
                      [arr.lat, arr.lng],
                    ]}
                    pathOptions={{
                      color: routeMeta.color,
                      weight: 2.5,
                      opacity: isUnavailable ? 0.4 : 0.85,
                      dashArray: routeMeta.dashArray,
                      lineCap: "round",
                    }}
                  />
                )}
              </Fragment>
            );
          }
          const center = zoneCentroid(zone);
          if (!center) return null;
          return (
            <Marker
              key={`zone-hub-${zone.id}`}
              position={[center.lat, center.lng]}
              icon={makeHubIcon(mode, { muted: isUnavailable })}
            >
              {zoneMapTooltip(zone, color, { sticky: true })}
            </Marker>
          );
        }

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
              {showTooltips && zoneMapTooltip(zone, color)}
            </Polygon>
          );
        });
      })}
    </>
  );
});
