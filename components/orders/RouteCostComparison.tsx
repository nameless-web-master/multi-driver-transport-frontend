"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  applyManualSegmentCost,
  getOrderRouteCostComparison,
  recalculateOrderCosts,
} from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import type {
  OrderRouteCostComparison,
  RouteCostStatus,
  RouteCostSummary,
  RouteSegmentCost,
  SegmentCostStatus,
} from "@/types";

const STATUS_BADGE: Record<RouteCostStatus, string> = {
  complete:
    "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20",
  partial:
    "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20",
  missing:
    "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20",
};

const SEGMENT_STATUS: Record<SegmentCostStatus, string> = {
  calculated: "Calculated",
  manual: "Manual Cost",
  missing: "Missing Cost",
};

interface Props {
  orderId: number;
  onMessage?: (text: string, type?: "success" | "error") => void;
}

export function RouteCostComparison({ orderId, onMessage }: Props) {
  const { user } = useAuth();
  const canEnterManual = user?.role === "admin" || user?.role === "driver";
  const [data, setData] = useState<OrderRouteCostComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [expandedRouteId, setExpandedRouteId] = useState<number | null>(null);
  const [manualInputs, setManualInputs] = useState<Record<number, string>>({});
  const [savingSegment, setSavingSegment] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const comparison = await getOrderRouteCostComparison(orderId);
      setData(comparison);
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Failed to load route costs", "error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, onMessage]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRecalculate() {
    setRecalculating(true);
    try {
      const comparison = await recalculateOrderCosts(orderId);
      setData(comparison);
      onMessage?.("Route costs recalculated.");
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Recalculation failed", "error");
    } finally {
      setRecalculating(false);
    }
  }

  async function handleManualSave(segment: RouteSegmentCost) {
    const raw = manualInputs[segment.segment_id] ?? "";
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      onMessage?.("Enter a valid cost >= 0", "error");
      return;
    }
    setSavingSegment(segment.segment_id);
    try {
      await applyManualSegmentCost(segment.segment_id, value);
      await load();
      onMessage?.("Manual cost saved.");
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Failed to save manual cost", "error");
    } finally {
      setSavingSegment(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading route cost comparison…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Route Cost Comparison
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Compare possible routes by estimated segment and total cost. No payment is processed.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleRecalculate}
          disabled={recalculating}
        >
          {recalculating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Recalculate Costs
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data || data.routes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No complete routes found for this order. Ensure pickup and destination are covered by
            connected transport zones, then recalculate.
          </p>
        ) : (
          data.routes.map((route) => (
            <RouteCard
              key={route.route_id}
              route={route}
              expanded={expandedRouteId === route.route_id}
              onToggle={() =>
                setExpandedRouteId((prev) => (prev === route.route_id ? null : route.route_id))
              }
              canEnterManual={canEnterManual}
              manualInputs={manualInputs}
              onManualInputChange={(id, val) =>
                setManualInputs((prev) => ({ ...prev, [id]: val }))
              }
              onManualSave={handleManualSave}
              savingSegment={savingSegment}
              userId={user?.id}
              userRole={user?.role}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function RouteCard({
  route,
  expanded,
  onToggle,
  canEnterManual,
  manualInputs,
  onManualInputChange,
  onManualSave,
  savingSegment,
  userId,
  userRole,
}: {
  route: RouteCostSummary;
  expanded: boolean;
  onToggle: () => void;
  canEnterManual: boolean;
  manualInputs: Record<number, string>;
  onManualInputChange: (id: number, val: string) => void;
  onManualSave: (seg: RouteSegmentCost) => void;
  savingSegment: number | null;
  userId?: number;
  userRole?: string;
}) {
  const hasMissing = route.missing_segment_count > 0;
  const costLabel =
    route.total_final_cost != null
      ? formatCurrency(route.total_final_cost, route.currency)
      : "Cost unavailable";

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{route.route_label}</p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                STATUS_BADGE[route.status]
              )}
            >
              {route.status === "complete"
                ? "Complete"
                : route.status === "partial"
                  ? `Partial · ${route.missing_segment_count} missing`
                  : "Missing Cost"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {route.transporters.join(" → ")} · {route.segment_count} segment
            {route.segment_count === 1 ? "" : "s"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {route.segments.map((s) => (
              <span
                key={s.segment_id}
                className="rounded-md bg-muted px-2 py-0.5 text-xs capitalize"
              >
                {s.transport_method}
              </span>
            ))}
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">{costLabel}</p>
          <Button type="button" size="sm" variant="ghost" onClick={onToggle} className="mt-1">
            {expanded ? (
              <>
                Hide breakdown <ChevronUp className="h-3.5 w-3.5 ml-1" />
              </>
            ) : (
              <>
                View Cost Breakdown <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>

      {hasMissing && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          Some segment costs are missing. Manual cost entry is required before this route can be
          fully compared.
        </div>
      )}

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">From</th>
                <th className="py-2 pr-2">To</th>
                <th className="py-2 pr-2">Transporter</th>
                <th className="py-2 pr-2">Method</th>
                <th className="py-2 pr-2">Distance</th>
                <th className="py-2 pr-2">Base</th>
                <th className="py-2 pr-2">Dist. cost</th>
                <th className="py-2 pr-2">Weight</th>
                <th className="py-2 pr-2">Volume</th>
                <th className="py-2 pr-2">Manual</th>
                <th className="py-2 pr-2">Final</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {route.segments.map((seg) => {
                const canEditThis =
                  canEnterManual &&
                  seg.cost_status === "missing" &&
                  (userRole === "admin" || seg.transporter_id === userId);
                return (
                  <tr key={seg.segment_id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-2">{seg.segment_index + 1}</td>
                    <td className="py-2 pr-2">{seg.from_label}</td>
                    <td className="py-2 pr-2">{seg.to_label}</td>
                    <td className="py-2 pr-2">{seg.transporter_name}</td>
                    <td className="py-2 pr-2 capitalize">{seg.transport_method}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {seg.transport_method === "air" || seg.transport_method === "sea"
                        ? seg.distance_km != null
                          ? `${seg.distance_km} km`
                          : "—"
                        : seg.distance_h3_cells != null
                          ? `${seg.distance_h3_cells} ${seg.distance_h3_cells === 1 ? "cell" : "cells"}`
                          : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      {seg.base_fee != null ? formatCurrency(seg.base_fee, seg.currency) : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      {seg.distance_cost != null
                        ? formatCurrency(seg.distance_cost, seg.currency)
                        : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      {seg.weight_cost != null
                        ? formatCurrency(seg.weight_cost, seg.currency)
                        : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      {seg.volume_cost != null
                        ? formatCurrency(seg.volume_cost, seg.currency)
                        : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      {canEditThis ? (
                        <div className="flex items-center gap-1">
                          <Input
                            className="h-7 w-20 text-xs"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={manualInputs[seg.segment_id] ?? ""}
                            onChange={(e) => onManualInputChange(seg.segment_id, e.target.value)}
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={savingSegment === seg.segment_id}
                            onClick={() => onManualSave(seg)}
                          >
                            Save
                          </Button>
                        </div>
                      ) : seg.manual_cost != null ? (
                        formatCurrency(seg.manual_cost, seg.currency)
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-2 font-medium">
                      {seg.final_cost != null
                        ? formatCurrency(seg.final_cost, seg.currency)
                        : "Missing Cost"}
                    </td>
                    <td className="py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          seg.cost_status === "calculated" && "bg-green-500/10 text-green-700",
                          seg.cost_status === "manual" && "bg-blue-500/10 text-blue-700",
                          seg.cost_status === "missing" && "bg-red-500/10 text-red-700"
                        )}
                      >
                        {SEGMENT_STATUS[seg.cost_status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
