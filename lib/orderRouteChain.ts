import { cellToLatLng, isValidCell } from "h3-js";
import type { H3MapHandoffMarker } from "@/components/map/H3MapView";
import { summaryToDriverZone } from "@/lib/orderDraftZoneMap";
import { isHubMode, normalizeTransportMode } from "@/lib/transportMode";
import type {
  OrderDraftChain,
  OrderDraftConnection,
  OrderDraftZoneSummary,
} from "@/types";

interface LatLng {
  lat: number;
  lng: number;
}

/** Client-facing label: `Transporter @ Zone name`. */
export function transporterZoneLabel(
  zone: OrderDraftZoneSummary | undefined,
  zoneId?: number
): string {
  if (!zone) return zoneId != null ? `Zone #${zoneId}` : "Unknown zone";
  return `${zone.transport_name} @ ${zone.zone_name}`;
}

function cellCenter(cell: string): LatLng | null {
  if (!isValidCell(cell)) return null;
  const [lat, lng] = cellToLatLng(cell);
  return { lat, lng };
}

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
 * Geographic handoff point for one connection, respecting travel direction
 * (`fromZoneId` → `toZoneId`) along the selected route.
 */
export function connectionWaypointForLeg(
  conn: OrderDraftConnection,
  fromZoneId: number,
  toZoneId: number,
  zonesById: Map<number, OrderDraftZoneSummary>
): LatLng | null {
  const fromZone = zonesById.get(fromZoneId);
  const toZone = zonesById.get(toZoneId);

  if (conn.connection_type === "hub") {
    const fromIsHub = fromZone && isHubMode(normalizeTransportMode(fromZone.transport_method));
    const toIsHub = toZone && isHubMode(normalizeTransportMode(toZone.transport_method));
    if (fromIsHub) {
      const exit = connectionTerminalForZone(conn, fromZoneId) ?? "departure";
      const pt = hubTerminal(fromZone, exit);
      if (pt) return pt;
    }
    if (toIsHub) {
      const entry = connectionTerminalForZone(conn, toZoneId) ?? "arrival";
      const pt = hubTerminal(toZone, entry);
      if (pt) return pt;
    }
    const role = conn.hub_role_a ?? conn.hub_role_b ?? null;
    const hubZoneId = conn.hub_role_a ? conn.from_zone_id : conn.to_zone_id;
    const hubZone = zonesById.get(hubZoneId);
    const hub = role === "departure" ? hubZone?.departure_hub : hubZone?.arrival_hub;
    if (hub && Number.isFinite(hub.lat) && Number.isFinite(hub.lng)) {
      return { lat: hub.lat, lng: hub.lng };
    }
  }

  if (conn.transfer_cells.length > 0) {
    const center = cellCenter(conn.transfer_cells[0]);
    if (center) return center;
  }
  if (conn.adjacent_cell_pairs.length > 0) {
    const center = cellCenter(conn.adjacent_cell_pairs[0].from_cell);
    if (center) return center;
  }

  const a = zoneCenter(fromZone);
  const b = zoneCenter(toZone);
  if (a && b) return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
  return a ?? b ?? null;
}

export interface RouteHandoffStep {
  index: number;
  fromZoneId: number;
  toZoneId: number;
  fromZone: OrderDraftZoneSummary | undefined;
  toZone: OrderDraftZoneSummary | undefined;
  connection: OrderDraftConnection;
  label: string;
  marker: H3MapHandoffMarker;
}

/**
 * Numbered connection points along a route chain, labelled in travel direction
 * (outgoing transporter/zone → incoming transporter/zone).
 */
export function buildRouteHandoffs(
  chain: OrderDraftChain,
  connectionsById: Map<number, OrderDraftConnection>,
  zonesById: Map<number, OrderDraftZoneSummary>,
  zoneColorById: Map<number, string>
): RouteHandoffStep[] {
  const steps: RouteHandoffStep[] = [];

  for (let i = 0; i < chain.connection_ids.length; i++) {
    const connId = chain.connection_ids[i];
    const conn = connectionsById.get(connId);
    if (!conn) continue;

    const fromZoneId = chain.zone_ids[i];
    const toZoneId = chain.zone_ids[i + 1];
    if (fromZoneId == null || toZoneId == null) continue;

    const fromZone = zonesById.get(fromZoneId);
    const toZone = zonesById.get(toZoneId);

    // Air/sea handoffs are shown on the hub/port icons — not as map pins.
    if (conn.connection_type === "hub") continue;
    const fromMode = fromZone ? normalizeTransportMode(fromZone.transport_method) : "land";
    const toMode = toZone ? normalizeTransportMode(toZone.transport_method) : "land";
    if (isHubMode(fromMode) || isHubMode(toMode)) continue;

    const pos = connectionWaypointForLeg(conn, fromZoneId, toZoneId, zonesById);
    if (!pos) continue;

    const transferCell =
      conn.transfer_cells[0] ??
      conn.adjacent_cell_pairs[0]?.from_cell ??
      conn.adjacent_cell_pairs[0]?.to_cell ??
      null;

    const index = steps.length + 1;
    const fromLabel = transporterZoneLabel(fromZone, fromZoneId);
    const toLabel = transporterZoneLabel(toZone, toZoneId);

    steps.push({
      index,
      fromZoneId,
      toZoneId,
      fromZone,
      toZone,
      connection: conn,
      label: `${fromLabel} → ${toLabel}`,
      marker: {
        index,
        lat: pos.lat,
        lng: pos.lng,
        fromTransport: fromZone?.transport_name ?? `Zone #${fromZoneId}`,
        toTransport: toZone?.transport_name ?? `Zone #${toZoneId}`,
        fromZone: fromZone?.zone_name ?? null,
        toZone: toZone?.zone_name ?? null,
        connectionType: conn.connection_type,
        transferCell,
        fromZoneDetail: fromZone ? summaryToDriverZone(fromZone) : null,
        toZoneDetail: toZone ? summaryToDriverZone(toZone) : null,
        fromColor: zoneColorById.get(fromZoneId) ?? null,
        toColor: zoneColorById.get(toZoneId) ?? null,
      },
    });
  }

  return steps;
}

export interface RouteChainSummary {
  pickupLabel: string;
  deliveryLabel: string;
  handoffs: { index: number; zoneLabel: string }[];
  connectionPoints: RouteHandoffStep[];
}

/** Structured pickup → handoffs → delivery summary for a selected chain. */
export function summarizeRouteChain(
  chain: OrderDraftChain,
  zonesById: Map<number, OrderDraftZoneSummary>,
  handoffs: RouteHandoffStep[]
): RouteChainSummary {
  const firstZoneId = chain.zone_ids[0];
  const lastZoneId = chain.zone_ids[chain.zone_ids.length - 1];
  const pickupZone = zonesById.get(firstZoneId);
  const deliveryZone = zonesById.get(lastZoneId);

  return {
    pickupLabel: transporterZoneLabel(pickupZone, firstZoneId),
    deliveryLabel: transporterZoneLabel(deliveryZone, lastZoneId),
    handoffs: handoffs.map((h) => ({
      index: h.index,
      zoneLabel: transporterZoneLabel(h.toZone, h.toZoneId),
    })),
    connectionPoints: handoffs,
  };
}
