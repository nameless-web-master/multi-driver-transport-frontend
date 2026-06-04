"use client";

import { useMemo } from "react";
import type {
  OrderGraph,
  OrderGraphEdge,
  OrderGraphNode,
  OrderGraphZoneNode,
} from "@/types";
import { isOrderGraphZoneNode } from "@/types";

/**
 * Milestone 3 — abstract (node-link) view of the order graph.
 *
 * Layered layout, deliberately dependency-free:
 *   - Sender pinned on the left, Receiver pinned on the right.
 *   - Transporter-zone nodes laid out in a middle band (a simple grid).
 *
 * Node styles differ by role (sender / receiver / transporter /
 * unreachable / isolated). Edge styles differ by type (pickup coverage,
 * delivery coverage, overlap, adjacency). This is a connectivity view —
 * it does not draw routes or a "best path".
 */

const NODE_R = 20;

interface Props {
  graph: OrderGraph;
  height?: number;
}

interface Pos {
  x: number;
  y: number;
}

export function OrderGraphCanvas({ graph, height = 460 }: Props) {
  const width = 920;

  const layout = useMemo(() => {
    const positions = new Map<string, Pos>();
    const midX = width / 2;
    const leftX = 70;
    const rightX = width - 70;

    positions.set("sender", { x: leftX, y: height / 2 });
    positions.set("receiver", { x: rightX, y: height / 2 });

    const zoneNodes = graph.nodes.filter(isOrderGraphZoneNode);

    // Order zones so the "useful" ones (pickup/reachable/delivery) sit
    // toward the centre band and the isolated ones drift to the edges.
    const sorted = [...zoneNodes].sort((a, b) => {
      const score = (n: typeof a) =>
        (n.is_pickup_covering ? 0 : 0) +
        (n.is_reachable ? -2 : 0) +
        (n.is_delivery_covering ? -1 : 0) +
        (n.is_isolated ? 3 : 0);
      return score(a) - score(b) || a.zone_id - b.zone_id;
    });

    const bandLeft = leftX + 120;
    const bandRight = rightX - 120;
    const bandWidth = Math.max(bandRight - bandLeft, 200);
    const count = sorted.length;
    const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(count))));
    const rows = Math.max(1, Math.ceil(count / cols));
    const colGap = bandWidth / cols;
    const rowGap = (height - 80) / rows;

    sorted.forEach((node, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      positions.set(node.id, {
        x: bandLeft + colGap * col + colGap / 2,
        y: 40 + rowGap * row + rowGap / 2,
      });
    });

    return { positions, midX };
  }, [graph, height]);

  function posOf(id: string): Pos | undefined {
    return layout.positions.get(id);
  }

  function edgeStyle(edge: OrderGraphEdge): { color: string; dash?: string } {
    switch (edge.edge_type) {
      case "pickup_coverage":
        return { color: "#22c55e" };
      case "delivery_coverage":
        return { color: "#ef4444" };
      case "overlap":
        return { color: "#d97706" };
      case "adjacent":
        return { color: "#0284c7", dash: "8 6" };
      default:
        return { color: "#94a3b8" };
    }
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-border bg-muted/30"
      style={{ height }}
    >
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="select-none">
        {/* Edges */}
        {graph.edges.map((edge) => {
          const a = posOf(edge.source);
          const b = posOf(edge.target);
          if (!a || !b) return null;
          const { color, dash } = edgeStyle(edge);
          return (
            <line
              key={edge.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={color}
              strokeWidth={2}
              strokeDasharray={dash}
              strokeLinecap="round"
              opacity={0.8}
            />
          );
        })}

        {/* Nodes */}
        {graph.nodes.map((node) => {
          const pos = posOf(node.id);
          if (!pos) return null;
          return <GraphNodeGlyph key={node.id} node={node} pos={pos} />;
        })}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border bg-card/95 backdrop-blur px-3 py-2 text-[11px] shadow-card">
        <LegendLine color="#22c55e" label="Pickup coverage" />
        <LegendLine color="#ef4444" label="Delivery coverage" />
        <LegendLine color="#d97706" label="Overlap" />
        <LegendLine color="#0284c7" dashed label="Adjacent" />
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-slate-400 border-dashed bg-white" />
          Isolated
        </span>
      </div>
    </div>
  );
}

function GraphNodeGlyph({ node, pos }: { node: OrderGraphNode; pos: Pos }) {
  if (!isOrderGraphZoneNode(node)) {
    const color = node.node_type === "sender" ? "#16a34a" : "#dc2626";
    const label = node.node_type === "sender" ? "Sender" : "Receiver";
    return (
      <g transform={`translate(${pos.x} ${pos.y})`}>
        <rect
          x={-NODE_R}
          y={-NODE_R}
          width={NODE_R * 2}
          height={NODE_R * 2}
          rx={6}
          fill={color}
          stroke="#fff"
          strokeWidth={2}
        />
        <text y={4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
          {node.node_type === "sender" ? "S" : "R"}
        </text>
        <text y={NODE_R + 14} textAnchor="middle" fontSize={11} className="fill-foreground">
          {label}
        </text>
        <text y={NODE_R + 28} textAnchor="middle" fontSize={10} className="fill-muted-foreground">
          {truncate(node.label, 22)}
        </text>
      </g>
    );
  }

  // transporter-zone node
  const zone: OrderGraphZoneNode = node;
  const isUnreachable = !zone.is_reachable;
  const fill = zone.is_isolated ? "#ffffff" : isUnreachable ? "#94a3b8" : "#3b82f6";
  const stroke = zone.is_isolated ? "#94a3b8" : isUnreachable ? "#64748b" : "#2563eb";
  const initials =
    zone.transport_name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join("") || "?";
  return (
    <g transform={`translate(${pos.x} ${pos.y})`}>
      <circle
        r={NODE_R}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
        strokeDasharray={zone.is_isolated ? "4 4" : undefined}
      />
      {zone.is_pickup_covering && (
        <circle r={NODE_R + 5} fill="none" stroke="#22c55e" strokeWidth={2} />
      )}
      {zone.is_delivery_covering && (
        <circle r={NODE_R + 8} fill="none" stroke="#ef4444" strokeWidth={2} />
      )}
      <text
        y={4}
        textAnchor="middle"
        fontSize={10}
        fontWeight={700}
        fill={zone.is_isolated ? "#475569" : "#fff"}
      >
        {initials}
      </text>
      <text y={NODE_R + 14} textAnchor="middle" fontSize={11} className="fill-foreground">
        {truncate(zone.zone_name, 18)}
      </text>
      <text y={NODE_R + 27} textAnchor="middle" fontSize={10} className="fill-muted-foreground">
        {truncate(zone.transport_name || `Transport #${zone.transport_id}`, 20)}
      </text>
    </g>
  );
}

function LegendLine({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-0 w-6 rounded"
        style={{ borderTop: `3px ${dashed ? "dashed" : "solid"} ${color}` }}
      />
      {label}
    </span>
  );
}

function truncate(value: string, max: number): string {
  if (!value) return "";
  return value.length <= max ? value : value.slice(0, max - 1) + "…";
}
