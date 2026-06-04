"use client";

import { cellToBoundary } from "h3-js";
import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { OrderGraph, OrderGraphNode } from "@/types";
import { isOrderGraphZoneNode } from "@/types";

/**
 * Milestone 3 — geographic view of the order graph.
 *
 *   - Sender / Receiver markers at their coordinates.
 *   - Transporter-zone H3 cells (blue = reachable, slate = unreachable,
 *     dashed = isolated). Pickup-covering zones outlined green, delivery
 *     green→red.
 *   - Edges drawn between node primary coordinates.
 *   - Recommended transfer cells highlighted in amber.
 */

const REACHABLE = "#3b82f6";
const UNREACHABLE = "#94a3b8";
const PICKUP = "#22c55e";
const DELIVERY = "#ef4444";
const OVERLAP_EDGE = "#d97706";
const ADJACENT_EDGE = "#0284c7";
const RECOMMENDED = "#f59e0b";

interface Props {
  graph: OrderGraph;
  height?: number;
}

function FitBoundsOnce({ positions, sessionKey }: { positions: [number, number][]; sessionKey: string }) {
  const map = useMap();
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!positions.length) return;
    if (lastKey.current === sessionKey) return;
    lastKey.current = sessionKey;
    try {
      map.fitBounds(L.latLngBounds(positions).pad(0.2), { animate: false, maxZoom: 13 });
    } catch {
      /* map removed */
    }
  }, [map, positions, sessionKey]);
  return null;
}

function coordOf(node: OrderGraphNode): [number, number] | null {
  if (!node.primary_coordinate) return null;
  return [node.primary_coordinate.lat, node.primary_coordinate.lng];
}

export function OrderGraphMap({ graph, height = 480 }: Props) {
  const nodeById = useMemo(() => {
    const m = new Map<string, OrderGraphNode>();
    for (const n of graph.nodes) m.set(n.id, n);
    return m;
  }, [graph.nodes]);

  const zonePolygons = useMemo(() => {
    return graph.nodes
      .filter(isOrderGraphZoneNode)
      .flatMap((node) => {
        const base = node.is_isolated
          ? UNREACHABLE
          : node.is_reachable
          ? REACHABLE
          : UNREACHABLE;
        return node.cells.map((cell) => {
          let boundary: [number, number][];
          try {
            boundary = cellToBoundary(cell) as [number, number][];
          } catch {
            return null;
          }
          return { key: `${node.id}:${cell}`, boundary, color: base, node };
        });
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  }, [graph.nodes]);

  const recommendedCells = useMemo(() => {
    const set = new Set<string>();
    for (const e of graph.edges) {
      if (
        (e.edge_type === "overlap" || e.edge_type === "adjacent") &&
        e.recommended_transfer_cell
      ) {
        set.add(e.recommended_transfer_cell);
      }
    }
    return Array.from(set);
  }, [graph.edges]);

  const fitPositions = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = [];
    for (const node of graph.nodes) {
      const c = coordOf(node);
      if (c) pts.push(c);
      if (isOrderGraphZoneNode(node)) {
        for (const cell of node.cells.slice(0, 4)) {
          try {
            for (const [lat, lng] of cellToBoundary(cell)) pts.push([lat, lng]);
          } catch {
            /* skip */
          }
        }
      }
    }
    return pts;
  }, [graph.nodes]);

  const sessionKey = useMemo(
    () => `${graph.order_id}:${graph.nodes.length}:${graph.edges.length}`,
    [graph]
  );

  const center: [number, number] = fitPositions[0] ?? [43.6532, -79.3832];

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border" style={{ height }}>
      <MapContainer center={center} zoom={11} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBoundsOnce positions={fitPositions} sessionKey={sessionKey} />

        {zonePolygons.map((p) => (
          <Polygon
            key={p.key}
            positions={p.boundary}
            pathOptions={{
              color: p.color,
              weight: 1,
              opacity: 0.7,
              fillColor: p.color,
              fillOpacity: 0.22,
              dashArray: p.node.is_isolated ? "4 4" : undefined,
            }}
          >
            <Tooltip sticky direction="top">
              <div>
                <div className="graph-tooltip-title">{p.node.transport_name}</div>
                <div className="graph-tooltip-sub">{p.node.zone_name}</div>
                <div className="graph-tooltip-meta">
                  {p.node.is_reachable ? "reachable" : "unreachable"}
                  {p.node.is_pickup_covering ? " · pickup" : ""}
                  {p.node.is_delivery_covering ? " · delivery" : ""}
                </div>
              </div>
            </Tooltip>
          </Polygon>
        ))}

        {/* Recommended transfer cells, painted on top in amber. */}
        {recommendedCells.map((cell) => {
          let boundary: [number, number][];
          try {
            boundary = cellToBoundary(cell) as [number, number][];
          } catch {
            return null;
          }
          return (
            <Polygon
              key={`rec:${cell}`}
              positions={boundary}
              pathOptions={{
                color: RECOMMENDED,
                weight: 2,
                opacity: 1,
                fillColor: RECOMMENDED,
                fillOpacity: 0.55,
              }}
              interactive={false}
            />
          );
        })}

        {/* Edges between node primary coordinates. */}
        {graph.edges.map((edge) => {
          const a = nodeById.get(edge.source);
          const b = nodeById.get(edge.target);
          if (!a || !b) return null;
          const ca = coordOf(a);
          const cb = coordOf(b);
          if (!ca || !cb) return null;
          const color =
            edge.edge_type === "pickup_coverage"
              ? PICKUP
              : edge.edge_type === "delivery_coverage"
              ? DELIVERY
              : edge.edge_type === "overlap"
              ? OVERLAP_EDGE
              : ADJACENT_EDGE;
          return (
            <Polyline
              key={edge.id}
              positions={[ca, cb]}
              pathOptions={{
                color,
                weight: 3,
                opacity: 0.85,
                dashArray: edge.edge_type === "adjacent" ? "10 6" : undefined,
                lineCap: "round",
              }}
            />
          );
        })}

        {/* Sender / Receiver markers. */}
        {graph.nodes
          .filter((n) => n.node_type === "sender" || n.node_type === "receiver")
          .map((node) => {
            const c = coordOf(node);
            if (!c) return null;
            const color = node.node_type === "sender" ? PICKUP : DELIVERY;
            return (
              <CircleMarker
                key={node.id}
                center={c}
                radius={10}
                pathOptions={{ color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 }}
              >
                <Tooltip direction="top" offset={[0, -6]}>
                  <div>
                    <div className="graph-tooltip-title">
                      {node.node_type === "sender" ? "Sender" : "Receiver"}
                    </div>
                    <div className="graph-tooltip-sub">{(node as { label: string }).label}</div>
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
      </MapContainer>

      <div className="absolute bottom-3 left-3 z-[400] flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border bg-card/95 backdrop-blur px-3 py-2 text-[11px] shadow-card">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: PICKUP }} /> Sender
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: DELIVERY }} /> Receiver
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm" style={{ background: "rgba(59,130,246,0.3)", border: `1px solid ${REACHABLE}` }} /> Reachable zone
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm" style={{ background: "rgba(148,163,184,0.3)", border: `1px solid ${UNREACHABLE}` }} /> Unreachable
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm" style={{ background: "rgba(245,158,11,0.55)", border: `1px solid ${RECOMMENDED}` }} /> Recommended cell
        </span>
      </div>
    </div>
  );
}
