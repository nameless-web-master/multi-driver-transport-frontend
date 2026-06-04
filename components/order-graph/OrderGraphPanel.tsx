"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleDashed,
  Hexagon,
  Loader2,
  Map as MapIcon,
  Network,
  RefreshCw,
  Share2,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildOrderGraph, getOrderGraph, invalidateCache } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Order, OrderGraph } from "@/types";
import { isOrderGraphZoneNode } from "@/types";
import { OrderGraphCanvas } from "./OrderGraphCanvas";

const OrderGraphMap = dynamic(() => import("./OrderGraphMap").then((m) => m.OrderGraphMap), {
  ssr: false,
  loading: () => (
    <div className="h-[480px] rounded-xl bg-muted animate-pulse flex items-center justify-center text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

type ViewMode = "map" | "abstract";

interface Props {
  order: Order;
}

export function OrderGraphPanel({ order }: Props) {
  const { user } = useAuth();
  const canRecalc = user?.role === "admin" || user?.role === "driver";

  const [graph, setGraph] = useState<OrderGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("map");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOrderGraph(order.id);
      setGraph(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load order graph");
    } finally {
      setLoading(false);
    }
  }, [order.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleBuild(recalc: boolean) {
    setBuilding(true);
    setError(null);
    try {
      const data = await buildOrderGraph(order.id, { recalculate_connections: recalc });
      invalidateCache(`/api/order-graph/${order.id}`);
      setGraph(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build order graph");
    } finally {
      setBuilding(false);
    }
  }

  const zoneNodes = graph?.nodes.filter(isOrderGraphZoneNode) ?? [];
  const unreachable = zoneNodes.filter((z) => !z.is_reachable);
  const isolated = zoneNodes.filter((z) => z.is_isolated);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-start gap-3">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Network className="h-5 w-5" />
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">Transporter Graph for this order</p>
            <p className="text-muted-foreground">
              Sender and receiver are the graph endpoints; transporter zones are nodes and
              overlap/adjacency links are edges. This view shows whether a connected chain
              exists from sender to receiver and which transporters are unreachable or
              isolated for this order. It does not generate routes, cost, or ETA.
            </p>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Connection status */}
      {graph && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm flex items-center gap-2",
            graph.has_complete_connection
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200"
              : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
          )}
        >
          {graph.has_complete_connection ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          {graph.has_complete_connection
            ? "A connected chain exists from sender to receiver through transporter zones."
            : "No complete sender → receiver chain yet on the current zone graph."}
        </div>
      )}

      {/* Pickup / delivery H3 */}
      {graph && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs text-muted-foreground mb-1">Pickup H3</p>
            <p className="font-mono text-xs break-all">
              <Hexagon className="inline-block h-3 w-3 mr-1 align-text-bottom" />
              {graph.pickup_h3 ?? "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs text-muted-foreground mb-1">Delivery H3</p>
            <p className="font-mono text-xs break-all">
              <Hexagon className="inline-block h-3 w-3 mr-1 align-text-bottom" />
              {graph.delivery_h3 ?? "—"}
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Total Nodes" value={graph?.summary.total_nodes ?? 0} />
        <Stat label="Total Edges" value={graph?.summary.total_edges ?? 0} />
        <Stat label="Pickup Transporters" value={graph?.summary.pickup_covering_transporters ?? 0} />
        <Stat label="Delivery Transporters" value={graph?.summary.delivery_covering_transporters ?? 0} />
        <Stat label="Reachable Transporters" value={graph?.summary.reachable_transporters ?? 0} />
        <Stat label="Unreachable Transporters" value={graph?.summary.unreachable_transporters ?? 0} />
      </section>

      {/* Action bar */}
      <Card>
        <CardContent className="p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => handleBuild(false)} disabled={building || loading}>
              {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />}
              {building ? "Building…" : "Build Graph"}
            </Button>
            {canRecalc && (
              <Button
                variant="outline"
                onClick={() => handleBuild(true)}
                disabled={building || loading}
                title="Recalculate Milestone 2 zone connections, then rebuild this order's graph"
              >
                <RefreshCw className="h-4 w-4" />
                Recalculate Connections & Rebuild
              </Button>
            )}
          </div>
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("map")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "map"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MapIcon className="h-3.5 w-3.5" /> Map view
            </button>
            <button
              type="button"
              onClick={() => setViewMode("abstract")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "abstract"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Share2 className="h-3.5 w-3.5" /> Abstract view
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Graph canvas */}
      <Card>
        <CardContent className="p-4">
          {loading && !graph ? (
            <div className="h-[480px] rounded-xl bg-muted animate-pulse flex items-center justify-center text-sm text-muted-foreground">
              Loading graph…
            </div>
          ) : !graph ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No graph yet — click Build Graph.
            </div>
          ) : viewMode === "map" ? (
            <OrderGraphMap graph={graph} height={480} />
          ) : (
            <OrderGraphCanvas graph={graph} height={480} />
          )}
        </CardContent>
      </Card>

      {/* Unreachable / isolated transporters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleDashed className="h-4 w-4" /> Unreachable & isolated transporters ({unreachable.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {unreachable.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Every transporter zone is reachable from the sender for this order.
            </div>
          ) : (
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Transporter</th>
                  <th className="py-2 pr-4 font-medium">Zone</th>
                  <th className="py-2 pr-4 font-medium">Method</th>
                  <th className="py-2 pr-4 font-medium text-right">Cells</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {unreachable.map((z) => (
                  <tr key={z.id} className="border-b border-border/70 last:border-0">
                    <td className="py-2 pr-4 font-medium">{z.transport_name || `#${z.transport_id}`}</td>
                    <td className="py-2 pr-4">{z.zone_name}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{z.transport_method ?? "—"}</td>
                    <td className="py-2 pr-4 text-right font-mono">{z.h3_cell_count}</td>
                    <td className="py-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border",
                          z.is_isolated
                            ? "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"
                        )}
                      >
                        {z.is_isolated ? "Isolated" : "Unreachable"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {isolated.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {isolated.length} of these {isolated.length === 1 ? "zone has" : "zones have"} no
              overlap or adjacency to any other zone (fully isolated).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}
