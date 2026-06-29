"use client";

import {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GraphEdge, GraphNode } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Milestone 3 — interactive node-link visualization of the driver-zone
 * graph.
 *
 * Layout strategy:
 *   1. Group nodes by connected component id.
 *   2. Lay each multi-node component out as a circle (the demo scenarios
 *      are small enough that a circle is much more readable than a
 *      force-directed blob).
 *   3. Run a short repulsion-only pass to separate any remaining overlaps.
 *      Edge attraction is intentionally omitted — in dense graphs it
 *      collapses nodes into a tight blob that zoom cannot fix.
 *   4. Render with an SVG `<g>` whose `transform` is driven by pan/zoom
 *      pointer events.
 *
 * The component intentionally avoids any heavy dependency (no React Flow /
 * Cytoscape / D3) — the geometry math is small, fits the existing
 * dashboard aesthetic, and lets us style edges precisely (solid for
 * overlap, dashed for adjacency).
 */

const NODE_RADIUS = 22;
/** Minimum center-to-center distance between any two nodes. */
const MIN_NODE_SPACING = NODE_RADIUS * 4;
const COMPONENT_GAP = 160;
const COMPONENT_MIN_SIZE = 220;
const ISOLATED_ROW_HEIGHT = 120;

const PALETTE = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#a855f7", // purple
  "#06b6d4", // cyan
  "#ef4444", // red
  "#14b8a6", // teal
  "#f97316", // orange
  "#84cc16", // lime
  "#ec4899", // pink
];

interface NodePosition {
  x: number;
  y: number;
}

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Currently selected node id (highlights the node + its neighbours). */
  selectedNodeId?: string | null;
  /** Currently selected edge id (highlights the edge + endpoints). */
  selectedEdgeId?: string | null;
  /**
   * Optional set of node ids to render in muted style — used by the
   * "Component" / "Show isolated" filters so non-matching nodes recede.
   */
  mutedNodeIds?: ReadonlySet<string>;
  onSelectNode?: (node: GraphNode) => void;
  onSelectEdge?: (edge: GraphEdge) => void;
  height?: number;
}

interface Layout {
  positions: Map<string, NodePosition>;
  width: number;
  height: number;
  /** Stable colour assignment for component_id → palette colour. */
  colorByComponent: Map<string, string>;
}

/**
 * Compute a deterministic layout for the supplied nodes/edges. Connected
 * components form circles; isolated nodes are laid out on a row at the
 * bottom. A short repulsion-only pass then separates any remaining overlaps.
 */
function computeLayout(nodes: readonly GraphNode[]): Layout {
  const positions = new Map<string, NodePosition>();
  const colorByComponent = new Map<string, string>();
  if (nodes.length === 0) {
    return { positions, width: 600, height: 360, colorByComponent };
  }

  // Group by component.
  const byComponent = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    const list = byComponent.get(node.component_id);
    if (list) list.push(node);
    else byComponent.set(node.component_id, [node]);
  }

  // Separate multi-node components (rendered as circles in a grid) from
  // isolated singletons (rendered on a row at the bottom).
  const multiNodeGroups: { id: string; nodes: GraphNode[] }[] = [];
  const isolatedNodes: GraphNode[] = [];
  byComponent.forEach((compNodes, compId) => {
    if (compNodes.length > 1) {
      multiNodeGroups.push({ id: compId, nodes: compNodes });
    } else {
      isolatedNodes.push(compNodes[0]);
    }
  });

  // Stable sort so layout doesn't reshuffle between renders.
  multiNodeGroups.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  isolatedNodes.sort((a, b) => a.zone_id - b.zone_id);

  // Assign colours.
  let paletteIdx = 0;
  for (const group of multiNodeGroups) {
    colorByComponent.set(group.id, PALETTE[paletteIdx % PALETTE.length]);
    paletteIdx++;
  }
  // All isolated singletons share the same muted colour, but still get
  // their own component_id; preserve any explicit mapping so callers can
  // colour by component if they want.
  for (const node of isolatedNodes) {
    colorByComponent.set(node.component_id, "#94a3b8"); // slate-400
  }

  // Compute per-component sizes, then arrange components in a grid.
  const componentLayouts = multiNodeGroups.map((group) => {
    const n = group.nodes.length;
    // Size the circle so adjacent nodes on the ring never overlap, even for
    // large connected components (the old 280px cap collapsed dense graphs).
    const radiusFromCount = (MIN_NODE_SPACING * n) / (2 * Math.PI);
    const radius = Math.max(COMPONENT_MIN_SIZE / 2, radiusFromCount);
    const size = radius * 2 + MIN_NODE_SPACING;
    return { ...group, radius, size };
  });

  // Place components in a grid. Try to keep it ~2 columns when there are
  // 3-4 components, 3 columns for 5-6, etc.
  const cols =
    componentLayouts.length <= 1
      ? 1
      : componentLayouts.length <= 4
      ? 2
      : componentLayouts.length <= 9
      ? 3
      : 4;

  let cursorX = COMPONENT_GAP / 2;
  let cursorY = COMPONENT_GAP / 2;
  let rowHeight = 0;
  let col = 0;
  let maxX = 0;

  for (const compLayout of componentLayouts) {
    const cx = cursorX + compLayout.size / 2;
    const cy = cursorY + compLayout.size / 2;
    const sortedNodes = [...compLayout.nodes].sort((a, b) => a.zone_id - b.zone_id);
    sortedNodes.forEach((node, idx) => {
      // Single-node components shouldn't reach this branch (they go to
      // isolatedNodes), but be defensive.
      if (sortedNodes.length === 1) {
        positions.set(node.id, { x: cx, y: cy });
      } else {
        const angle = (2 * Math.PI * idx) / sortedNodes.length - Math.PI / 2;
        positions.set(node.id, {
          x: cx + compLayout.radius * Math.cos(angle),
          y: cy + compLayout.radius * Math.sin(angle),
        });
      }
    });

    cursorX += compLayout.size + COMPONENT_GAP;
    rowHeight = Math.max(rowHeight, compLayout.size);
    if (cursorX > maxX) maxX = cursorX;
    col++;
    if (col >= cols) {
      cursorX = COMPONENT_GAP / 2;
      cursorY += rowHeight + COMPONENT_GAP;
      rowHeight = 0;
      col = 0;
    }
  }

  // Either close the trailing row or pick an explicit fallback width if
  // there are no multi-node components at all.
  let contentBottom = col === 0 ? cursorY : cursorY + rowHeight + COMPONENT_GAP / 2;
  if (componentLayouts.length === 0) {
    maxX = 600;
    contentBottom = COMPONENT_GAP;
  }

  // Place isolated nodes in a row at the bottom.
  if (isolatedNodes.length > 0) {
    const spacing = MIN_NODE_SPACING;
    const totalWidth = Math.max(
      maxX - COMPONENT_GAP / 2,
      isolatedNodes.length * spacing + spacing
    );
    const startX = (totalWidth - (isolatedNodes.length - 1) * spacing) / 2;
    const isolatedY = contentBottom + ISOLATED_ROW_HEIGHT / 2;
    isolatedNodes.forEach((node, idx) => {
      positions.set(node.id, {
        x: startX + idx * spacing,
        y: isolatedY,
      });
    });
    contentBottom += ISOLATED_ROW_HEIGHT + COMPONENT_GAP / 2;
    maxX = Math.max(maxX, totalWidth + COMPONENT_GAP / 2);
  }

  const width = Math.max(maxX, 600);
  const height = Math.max(contentBottom, 360);

  // Repulsion-only pass: nudge apart any pairs that still overlap after the
  // circle layout. Do NOT attract along edges — in dense graphs that collapses
  // the whole component into an unreadable blob regardless of zoom level.
  const nodeIds = Array.from(positions.keys());
  const iterations = 24;
  for (let step = 0; step < iterations; step++) {
    const deltas = new Map<string, { dx: number; dy: number }>();
    for (const id of nodeIds) deltas.set(id, { dx: 0, dy: 0 });

    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const a = positions.get(nodeIds[i])!;
        const b = positions.get(nodeIds[j])!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < MIN_NODE_SPACING * MIN_NODE_SPACING && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          const force = ((MIN_NODE_SPACING - dist) / dist) * 0.12;
          deltas.get(nodeIds[i])!.dx += dx * force;
          deltas.get(nodeIds[i])!.dy += dy * force;
          deltas.get(nodeIds[j])!.dx -= dx * force;
          deltas.get(nodeIds[j])!.dy -= dy * force;
        }
      }
    }

    for (const id of nodeIds) {
      const pos = positions.get(id)!;
      const delta = deltas.get(id)!;
      pos.x += delta.dx;
      pos.y += delta.dy;
    }
  }

  // Re-tighten bounds after relaxation so we don't leave a giant whitespace
  // pad or clip nodes at the edge.
  let minX = Infinity;
  let minY = Infinity;
  let computedMaxX = -Infinity;
  let computedMaxY = -Infinity;
  positions.forEach((pos) => {
    if (pos.x < minX) minX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.x > computedMaxX) computedMaxX = pos.x;
    if (pos.y > computedMaxY) computedMaxY = pos.y;
  });
  const pad = NODE_RADIUS * 3;
  const shiftX = pad - minX;
  const shiftY = pad - minY;
  positions.forEach((pos, id) => {
    positions.set(id, { x: pos.x + shiftX, y: pos.y + shiftY });
  });
  const finalWidth = Math.max(computedMaxX - minX + pad * 2, width);
  const finalHeight = Math.max(computedMaxY - minY + pad * 2, height);

  return { positions, width: finalWidth, height: finalHeight, colorByComponent };
}

interface ViewState {
  scale: number;
  tx: number;
  ty: number;
}

export function GraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  selectedEdgeId,
  mutedNodeIds,
  onSelectNode,
  onSelectEdge,
  height = 540,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * Memoize on a signature derived from node + edge ids so the layout
   * isn't recomputed when only the selection state changes (which fires
   * on every click).
   */
  const layoutKey = useMemo(() => {
    const nodeKey = nodes.map((n) => `${n.id}:${n.component_id}`).join("|");
    const edgeKey = edges.map((e) => e.id).join("|");
    return `${nodeKey}__${edgeKey}`;
  }, [nodes, edges]);

  const layout = useMemo(() => computeLayout(nodes), [layoutKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial zoom — fit width while honouring the requested canvas height.
  const initialView = useMemo<ViewState>(() => {
    const targetWidth = containerWidth || 800;
    const scaleX = targetWidth / layout.width;
    const scaleY = height / layout.height;
    const fit = Math.min(scaleX, scaleY, 1);
    return {
      scale: Math.max(0.25, fit),
      tx: (targetWidth - layout.width * fit) / 2,
      ty: (height - layout.height * fit) / 2,
    };
  }, [layout, containerWidth, height]);

  const [view, setView] = useState<ViewState>(initialView);
  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  // Pan via pointer drag. We use the SVG's own pointer events so the user
  // can grab anywhere outside a node.
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
  } | null>(null);

  function handlePointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    // Only start a pan when the user clicked on the background, not on a
    // node/edge that has its own click handler.
    if ((e.target as Element).closest("[data-graph-interactive]")) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTx: view.tx,
      startTy: view.ty,
    };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setView((v) => ({
      ...v,
      tx: drag.startTx + (e.clientX - drag.startX),
      ty: drag.startTy + (e.clientY - drag.startY),
    }));
  }

  function handlePointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      try {
        (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore (pointer already released by browser) */
      }
    }
  }

  // Zoom around the cursor position so pinch-to-zoom feels natural.
  function handleWheel(e: ReactWheelEvent<SVGSVGElement>) {
    // Use deltaY directly. Trackpads occasionally send a tiny non-zero
    // deltaY even for horizontal scrolls; the dead-zone keeps panning
    // separate from zooming.
    if (Math.abs(e.deltaY) < 0.5) return;
    e.preventDefault();
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setView((v) => {
      const nextScale = Math.min(3, Math.max(0.2, v.scale * factor));
      const k = nextScale / v.scale;
      return {
        scale: nextScale,
        tx: cursorX - (cursorX - v.tx) * k,
        ty: cursorY - (cursorY - v.ty) * k,
      };
    });
  }

  function adjustZoom(delta: number) {
    setView((v) => {
      const nextScale = Math.min(3, Math.max(0.2, v.scale + delta));
      const k = nextScale / v.scale;
      const cx = (containerWidth || 800) / 2;
      const cy = height / 2;
      return {
        scale: nextScale,
        tx: cx - (cx - v.tx) * k,
        ty: cy - (cy - v.ty) * k,
      };
    });
  }

  function resetView() {
    setView(initialView);
  }

  const neighborhoodNodeIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const set = new Set<string>([selectedNodeId]);
    for (const edge of edges) {
      if (edge.source === selectedNodeId) set.add(edge.target);
      if (edge.target === selectedNodeId) set.add(edge.source);
    }
    return set;
  }, [edges, selectedNodeId]);

  const neighborhoodEdgeIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const set = new Set<string>();
    for (const edge of edges) {
      if (edge.source === selectedNodeId || edge.target === selectedNodeId) {
        set.add(edge.id);
      }
    }
    return set;
  }, [edges, selectedNodeId]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl border border-border bg-muted/30"
      style={{ height }}
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${containerWidth || 800} ${height}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className={cn(
          "select-none touch-none",
          dragRef.current ? "cursor-grabbing" : "cursor-grab"
        )}
      >
        <defs>
          {/* Subtle dot grid so the user knows the canvas can be panned. */}
          <pattern id="graph-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" className="fill-border" opacity="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height={height} fill="url(#graph-grid)" />

        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
          {/* Edges first so nodes paint on top. */}
          {edges.map((edge) => {
            const a = layout.positions.get(edge.source);
            const b = layout.positions.get(edge.target);
            if (!a || !b) return null;
            const isOverlap = edge.connection_type === "overlap";
            const isSelected =
              selectedEdgeId === edge.id ||
              (selectedNodeId !== undefined && neighborhoodEdgeIds.has(edge.id));
            const isMuted =
              (selectedNodeId && !neighborhoodEdgeIds.has(edge.id) && !isSelected) ||
              (mutedNodeIds &&
                (mutedNodeIds.has(edge.source) || mutedNodeIds.has(edge.target)));

            const stroke = isOverlap ? "#d97706" : "#0284c7";
            return (
              <g
                key={edge.id}
                data-graph-interactive
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectEdge?.(edge);
                }}
                className="cursor-pointer"
              >
                {/* Wider invisible hit area for easier clicking. */}
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth={14}
                />
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={stroke}
                  strokeWidth={isSelected ? 3.5 : 2}
                  strokeDasharray={isOverlap ? undefined : "8 6"}
                  strokeLinecap="round"
                  opacity={isMuted ? 0.18 : isSelected ? 1 : 0.85}
                />
              </g>
            );
          })}

          {nodes.map((node) => {
            const pos = layout.positions.get(node.id);
            if (!pos) return null;
            const color = layout.colorByComponent.get(node.component_id) ?? "#64748b";
            const isSelected = selectedNodeId === node.id;
            const isNeighbour = selectedNodeId
              ? neighborhoodNodeIds.has(node.id) && !isSelected
              : false;
            const isMuted =
              (mutedNodeIds && mutedNodeIds.has(node.id)) ||
              (selectedNodeId &&
                !neighborhoodNodeIds.has(node.id) &&
                !isSelected);

            const label = node.zone_name || node.transport_name;
            const transportInitials = node.transport_name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part.charAt(0).toUpperCase())
              .join("") || "?";

            return (
              <g
                key={node.id}
                data-graph-interactive
                transform={`translate(${pos.x} ${pos.y})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode?.(node);
                }}
                className="cursor-pointer"
                opacity={isMuted ? 0.35 : 1}
              >
                {(isSelected || isNeighbour) && (
                  <circle
                    r={NODE_RADIUS + 8}
                    fill={color}
                    opacity={isSelected ? 0.22 : 0.12}
                  />
                )}
                <circle
                  r={NODE_RADIUS}
                  fill={node.is_isolated ? "#fff" : color}
                  stroke={color}
                  strokeWidth={isSelected ? 3 : 2}
                  strokeDasharray={node.is_isolated ? "4 4" : undefined}
                />
                <text
                  y={4}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill={node.is_isolated ? color : "#ffffff"}
                  className="pointer-events-none"
                >
                  {transportInitials}
                </text>
                <text
                  y={NODE_RADIUS + 16}
                  textAnchor="middle"
                  fontSize={11}
                  className="fill-foreground pointer-events-none"
                >
                  {truncate(label, 22)}
                </text>
                <text
                  y={NODE_RADIUS + 30}
                  textAnchor="middle"
                  fontSize={10}
                  className="fill-muted-foreground pointer-events-none"
                >
                  {node.transport_name
                    ? truncate(node.transport_name, 24)
                    : `Zone #${node.zone_id}`}
                </text>
              </g>
            );
          })}
        </g>

        {nodes.length === 0 && (
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize={13}
          >
            No transport zones in scope yet — create zones first, then rebuild the graph.
          </text>
        )}
      </svg>

      {/* Floating controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 rounded-xl border border-border bg-card/95 backdrop-blur p-1 shadow-card">
        <button
          type="button"
          onClick={() => adjustZoom(0.2)}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-foreground hover:bg-muted"
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => adjustZoom(-0.2)}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-foreground hover:bg-muted"
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetView}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-xs text-foreground hover:bg-muted"
          aria-label="Reset view"
          title="Reset view"
        >
          ⌂
        </button>
      </div>

      {/* Inline legend, anchored bottom-left. */}
      <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/95 backdrop-blur px-3 py-2 text-xs shadow-card">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0 w-6 rounded"
            style={{ borderTop: "3px solid #d97706" }}
          />
          Overlap edge
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0 w-6 rounded"
            style={{ borderTop: "3px dashed #0284c7" }}
          />
          Adjacent edge
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-slate-400 border-dashed bg-white" />
          Isolated zone
        </span>
      </div>
    </div>
  );
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + "…";
}
