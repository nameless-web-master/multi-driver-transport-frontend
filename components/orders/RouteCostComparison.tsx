"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  applyExternalSegmentCost,
  applyManualSegmentCost,
  fetchExternalSegmentQuote,
  getOrderRouteCostComparison,
  getPricingConfig,
  getRouteConfirmationStatus,
  getSelectedRoute,
  recalculateOrderCosts,
  requestSegmentQuote,
  selectRoute,
} from "@/lib/api";
import { OrderPackageSummary } from "@/components/orders/OrderPackageSummary";
import { cn, formatCurrency } from "@/lib/utils";
import { formatBookingFeePercent } from "@/lib/pricing";
import { segmentPricingHint } from "@/lib/zonePricing";
import type {
  OrderRouteCostComparison,
  PricingConfig,
  RouteConfirmationStatus,
  RouteCostStatus,
  RouteCostSummary,
  RouteSegmentCost,
  RouteSelection,
  SegmentCostStatus,
} from "@/types";
import { RouteStatusBadge } from "@/components/orders/RouteStatusBadge";
import { RouteConfirmationStatusPanel } from "@/components/orders/ConfirmationPanel";
import Link from "next/link";

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
  requested: "Cost Requested",
};

interface Props {
  orderId: number;
  /** Bump to trigger a silent in-place refresh (e.g. after package edit). */
  refreshSignal?: number;
  onMessage?: (text: string, type?: "success" | "error") => void;
}

export function RouteCostComparison({
  orderId,
  refreshSignal = 0,
  onMessage,
}: Props) {
  const { user } = useAuth();
  const canEnterManual = user?.role === "admin" || user?.role === "driver";
  const isDriver = user?.role === "driver";
  const canRequestQuote =
    user?.role === "admin" ||
    user?.role === "sender" ||
    user?.role === "receiver";
  const canRecalculate =
    user?.role === "admin" ||
    user?.role === "sender" ||
    user?.role === "receiver";
  const canSelectRoute =
    user?.role === "admin" ||
    user?.role === "sender" ||
    user?.role === "receiver";
  const [data, setData] = useState<OrderRouteCostComparison | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<RouteSelection | null>(
    null,
  );
  const [confirmation, setConfirmation] =
    useState<RouteConfirmationStatus | null>(null);
  const [selectingRouteId, setSelectingRouteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasDataRef = useRef(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const [recalculating, setRecalculating] = useState(false);
  const [expandedRouteId, setExpandedRouteId] = useState<number | null>(null);
  const [manualInputs, setManualInputs] = useState<Record<number, string>>({});
  const [savingSegment, setSavingSegment] = useState<number | null>(null);
  // const [savingExternal, setSavingExternal] = useState<number | null>(null);
  const [requestingQuote, setRequestingQuote] = useState<number | null>(null);
  const [fetchingExternal, setFetchingExternal] = useState<number | null>(null);
  const [pricingConfig, setPricingConfig] = useState<PricingConfig | null>(
    null,
  );

  const load = useCallback(
    async (silent = false) => {
      const isFirst = !hasDataRef.current;
      if (!silent && isFirst) {
        setLoading(true);
      } else if (silent && hasDataRef.current) {
        setRefreshing(true);
      }

      try {
        const comparison = await getOrderRouteCostComparison(orderId);
        setData(comparison);
        hasDataRef.current = true;
        try {
          const selection = await getSelectedRoute(orderId);
          setSelectedRoute(selection);
          const status = await getRouteConfirmationStatus(
            selection.selected_route_id,
          );
          setConfirmation(status);
        } catch {
          setSelectedRoute(null);
          setConfirmation(null);
        }
      } catch (err) {
        if (!hasDataRef.current) {
          onMessageRef.current?.(
            err instanceof Error ? err.message : "Failed to load route costs",
            "error",
          );
          setData(null);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orderId],
  );

  async function handleSelectRoute(routeId: number) {
    setSelectingRouteId(routeId);
    try {
      const selection = await selectRoute(orderId, routeId);
      setSelectedRoute(selection);
      const status = await getRouteConfirmationStatus(routeId);
      setConfirmation(status);
      onMessage?.(
        "Route selected. Confirmation requests sent to transporters.",
      );
    } catch (err) {
      onMessage?.(
        err instanceof Error ? err.message : "Failed to select route",
        "error",
      );
    } finally {
      setSelectingRouteId(null);
    }
  }

  useEffect(() => {
    hasDataRef.current = false;
    void load(false);
  }, [orderId, load]);

  useEffect(() => {
    if (refreshSignal === 0 || !hasDataRef.current) return;
    void load(true);
  }, [refreshSignal, orderId, load]);

  useEffect(() => {
    getPricingConfig()
      .then(setPricingConfig)
      .catch(() => setPricingConfig(null));
  }, []);

  async function handleRecalculate() {
    setRecalculating(true);
    try {
      const comparison = await recalculateOrderCosts(orderId);
      setData(comparison);
      onMessage?.("Route costs recalculated.");
    } catch (err) {
      onMessage?.(
        err instanceof Error ? err.message : "Recalculation failed",
        "error",
      );
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
      await load(true);
      onMessage?.("Manual cost saved.");
    } catch (err) {
      onMessage?.(
        err instanceof Error ? err.message : "Failed to save manual cost",
        "error",
      );
    } finally {
      setSavingSegment(null);
    }
  }

  async function handleExternalSave(segment: RouteSegmentCost) {
    const raw = manualInputs[segment.segment_id] ?? "";
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      onMessage?.("Enter a valid cost >= 0", "error");
      return;
    }
    // setSavingExternal(segment.segment_id);
    try {
      await applyExternalSegmentCost(segment.segment_id, value);
      await load(true);
      onMessage?.("External quote saved.");
    } catch (err) {
      onMessage?.(
        err instanceof Error ? err.message : "Failed to save external quote",
        "error",
      );
    } finally {
      // setSavingExternal(null);
    }
  }

  async function handleRequestQuote(segment: RouteSegmentCost) {
    setRequestingQuote(segment.segment_id);
    try {
      await requestSegmentQuote(segment.segment_id);
      await load(true);
      onMessage?.("Quote requested for this segment.");
    } catch (err) {
      onMessage?.(
        err instanceof Error ? err.message : "Failed to request quote",
        "error",
      );
    } finally {
      setRequestingQuote(null);
    }
  }

  async function handleFetchExternal(segment: RouteSegmentCost) {
    setFetchingExternal(segment.segment_id);
    try {
      await fetchExternalSegmentQuote(segment.segment_id);
      await load(true);
      onMessage?.("External quote fetched and applied.");
    } catch (err) {
      onMessage?.(
        err instanceof Error ? err.message : "Failed to fetch external quote",
        "error",
      );
    } finally {
      setFetchingExternal(null);
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
            {isDriver ? "Your Zone Costs" : "Route Cost Comparison"}
            {refreshing && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {isDriver
              ? "Costs for your zone segments only. Other transporters on the same route are not shown."
              : `Pricing engine: (base × package factor) + traveling + waiting + booking fee${
                  data
                    ? ` (${formatBookingFeePercent(data.booking_fee_rate)})`
                    : ""
                }. Each route segment uses its zone's pricing mode (system or own price). Land distance uses ${
                  pricingConfig?.land_distance_provider === "google"
                    ? "Google road routing"
                    : "H3 estimate"
                }. Air segments always require a requested/manual cost.`}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleRecalculate}
          disabled={recalculating || !canRecalculate || data?.route_locked}
          className={
            canRecalculate && !data?.route_locked ? undefined : "hidden"
          }
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
        {data && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Booking fee: {formatBookingFeePercent(data.booking_fee_rate)} on
              each segment sub-total
            </p>
            <OrderPackageSummary
              order={{
                package_type: data.package_type,
                packages: data.packages ?? [],
                package_factor: data.package_factor,
                weight_lbs: data.package_weight_lbs,
                package_length: null,
                package_width: null,
                package_height: null,
                dimensions: data.package_dimensions_in ?? "",
                package_description: "",
              }}
            />
          </div>
        )}
        {data?.route_locked && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            Showing the confirmed route snapshot for this order. Routes are not
            recomputed while delivery is in progress or complete, even if zones
            or schedules have changed.
          </div>
        )}
        {!data || data.routes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {data?.route_locked
              ? "No saved route data found for this order."
              : "No complete routes found for this order. Ensure pickup and destination are covered by connected transport zones, then recalculate."}
          </p>
        ) : (
          data.routes.map((route) => (
            <RouteCard
              key={route.route_id}
              route={route}
              isSelected={selectedRoute?.selected_route_id === route.route_id}
              selectionStatus={
                selectedRoute?.selected_route_id === route.route_id
                  ? selectedRoute.status
                  : null
              }
              canSelectRoute={canSelectRoute && !data.route_locked}
              selecting={selectingRouteId === route.route_id}
              onSelectRoute={() => handleSelectRoute(route.route_id)}
              expanded={expandedRouteId === route.route_id}
              onToggle={() =>
                setExpandedRouteId((prev) =>
                  prev === route.route_id ? null : route.route_id,
                )
              }
              canEnterManual={canEnterManual}
              canRequestQuote={canRequestQuote}
              manualInputs={manualInputs}
              onManualInputChange={(id, val) =>
                setManualInputs((prev) => ({ ...prev, [id]: val }))
              }
              onManualSave={handleManualSave}
              // onExternalSave={handleExternalSave}
              onRequestQuote={handleRequestQuote}
              onFetchExternal={handleFetchExternal}
              externalQuoteConfigured={
                pricingConfig?.external_quote_configured ?? false
              }
              bookingFeeRate={
                pricingConfig?.booking_fee_rate ??
                data?.booking_fee_rate ??
                0.02
              }
              savingSegment={savingSegment}
              // savingExternal={savingExternal}
              requestingQuote={requestingQuote}
              fetchingExternal={fetchingExternal}
              userId={user?.id}
              userRole={user?.role}
            />
          ))
        )}
        {confirmation && selectedRoute && !isDriver && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Route confirmation status</p>
              <Link
                href={`/orders/${orderId}/tracking`}
                className="text-xs text-primary hover:underline"
              >
                View tracking map →
              </Link>
            </div>
            <RouteConfirmationStatusPanel confirmation={confirmation} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RouteCard({
  route,
  isSelected,
  selectionStatus,
  canSelectRoute,
  selecting,
  onSelectRoute,
  expanded,
  onToggle,
  canEnterManual,
  canRequestQuote,
  manualInputs,
  onManualInputChange,
  onManualSave,
  // onExternalSave,
  onRequestQuote,
  onFetchExternal,
  externalQuoteConfigured,
  bookingFeeRate,
  savingSegment,
  // savingExternal,
  requestingQuote,
  fetchingExternal,
  userId,
  userRole,
}: {
  route: RouteCostSummary;
  isSelected: boolean;
  selectionStatus: import("@/types").RouteSelectionStatus | null;
  canSelectRoute: boolean;
  selecting: boolean;
  onSelectRoute: () => void;
  expanded: boolean;
  onToggle: () => void;
  canEnterManual: boolean;
  canRequestQuote: boolean;
  externalQuoteConfigured: boolean;
  bookingFeeRate: number;
  manualInputs: Record<number, string>;
  onManualInputChange: (id: number, val: string) => void;
  onManualSave: (seg: RouteSegmentCost) => void;
  // onExternalSave: (seg: RouteSegmentCost) => void;
  onRequestQuote: (seg: RouteSegmentCost) => void;
  onFetchExternal: (seg: RouteSegmentCost) => void;
  savingSegment: number | null;
  // savingExternal: number | null;
  requestingQuote: number | null;
  fetchingExternal: number | null;
  userId?: number;
  userRole?: string;
}) {
  const isDriver = userRole === "driver";
  const visibleSegments = isDriver
    ? route.segments.filter((s) => s.transporter_id === userId)
    : route.segments;
  const pendingCount =
    route.missing_segment_count + (route.requested_segment_count ?? 0);
  const hasPending = pendingCount > 0;
  const costLabel =
    route.total_final_cost != null
      ? `${isDriver ? "Your cost: " : ""}${formatCurrency(route.total_final_cost, route.currency)}`
      : isDriver
        ? "Your cost unavailable"
        : "Cost unavailable";
  const segmentSummary = isDriver
    ? visibleSegments.map((s) => `${s.from_label} → ${s.to_label}`).join(" · ")
    : `${route.transporters.join(" → ")} · ${route.segment_count} segment${
        route.segment_count === 1 ? "" : "s"
      }`;

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{route.route_label}</p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                STATUS_BADGE[route.status],
              )}
            >
              {route.status === "complete"
                ? "Complete"
                : route.status === "partial"
                  ? `Partial · ${pendingCount} pending`
                  : "Missing Cost"}
            </span>
            {isSelected && selectionStatus && (
              <RouteStatusBadge status={selectionStatus} />
            )}
            {isSelected && (
              <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                Selected
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{segmentSummary}</p>
          <div className="flex flex-wrap gap-1.5">
            {visibleSegments.map((s) => (
              <span
                key={s.segment_id}
                className="rounded-md bg-muted px-2 py-0.5 text-xs capitalize"
              >
                {s.transport_method}
              </span>
            ))}
          </div>
        </div>
        <div className="text-right space-y-2">
          <p className="text-lg font-semibold">{costLabel}</p>
          {canSelectRoute && !isSelected && (
            <Button
              type="button"
              size="sm"
              onClick={onSelectRoute}
              disabled={selecting}
            >
              {selecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Select route"
              )}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onToggle}
            className="mt-1 block ml-auto"
          >
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

      {hasPending && userRole !== "driver" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          Some segments need a cost (air always requires a quote; sea/land may
          be missing rates).
        </div>
      )}

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">From</th>
                <th className="py-2 pr-2">To</th>
                <th className="py-2 pr-2">Transporter</th>
                <th className="py-2 pr-2">Method</th>
                <th className="py-2 pr-2">Pricing</th>
                <th className="py-2 pr-2">Distance</th>
                <th className="py-2 pr-2">Time</th>
                <th className="py-2 pr-2">Pkg factor</th>
                <th className="py-2 pr-2">Base</th>
                <th className="py-2 pr-2">Travel</th>
                <th className="py-2 pr-2">Waiting</th>
                <th className="py-2 pr-2">Booking</th>
                <th className="py-2 pr-2">Manual</th>
                <th className="py-2 pr-2">Final</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleSegments.map((seg) => {
                const needsEntry =
                  seg.cost_status === "missing" ||
                  seg.cost_status === "requested";
                const ownsSegment =
                  userRole === "admin" || seg.transporter_id === userId;
                const canOverride =
                  canEnterManual &&
                  ownsSegment &&
                  (needsEntry || seg.cost_status === "calculated");
                // const showExternal =
                //   canOverride &&
                //   (seg.transport_method === "air" || seg.cost_status === "requested");
                const showFetchExternal =
                  externalQuoteConfigured &&
                  canRequestQuote &&
                  needsEntry &&
                  seg.cost_status !== "manual";
                const showRequestQuote =
                  canRequestQuote &&
                  (seg.cost_status === "calculated" ||
                    seg.cost_status === "missing") &&
                  seg.transport_method !== "air";
                return (
                  <tr
                    key={seg.segment_id}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="py-2 pr-2">{seg.segment_index + 1}</td>
                    <td className="py-2 pr-2">{seg.from_label}</td>
                    <td className="py-2 pr-2">{seg.to_label}</td>
                    <td className="py-2 pr-2">{seg.transporter_name}</td>
                    <td className="py-2 pr-2 capitalize">
                      {seg.transport_method}
                    </td>
                    <td className="py-2 pr-2 text-[10px] text-muted-foreground max-w-[140px]">
                      {segmentPricingHint(seg, bookingFeeRate) ?? "—"}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {seg.distance_km != null ? `${seg.distance_km} km` : "—"}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {seg.time_hours != null ? `${seg.time_hours} hr` : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      {seg.package_factor != null ? seg.package_factor : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      {seg.breakdown?.adjusted_base_cost != null
                        ? formatCurrency(
                            seg.breakdown.adjusted_base_cost,
                            seg.currency,
                          )
                        : seg.base_fee != null
                          ? formatCurrency(seg.base_fee, seg.currency)
                          : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      {seg.distance_cost != null
                        ? formatCurrency(seg.distance_cost, seg.currency)
                        : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      {seg.waiting_cost != null
                        ? formatCurrency(seg.waiting_cost, seg.currency)
                        : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      {seg.booking_fee != null
                        ? formatCurrency(seg.booking_fee, seg.currency)
                        : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      {canOverride ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <Input
                              className="h-7 w-20 text-xs"
                              inputMode="decimal"
                              placeholder="0.00"
                              value={manualInputs[seg.segment_id] ?? ""}
                              onChange={(e) =>
                                onManualInputChange(
                                  seg.segment_id,
                                  e.target.value,
                                )
                              }
                            />
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={savingSegment === seg.segment_id}
                              onClick={() => onManualSave(seg)}
                            >
                              {seg.cost_status === "calculated"
                                ? "Override"
                                : "Save"}
                            </Button>
                          </div>
                          {/* {showExternal && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[10px]"
                              disabled={savingExternal === seg.segment_id}
                              onClick={() => onExternalSave(seg)}
                            >
                              Save external quote
                            </Button>
                          )} */}
                          {showFetchExternal && (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-7 px-2 text-[10px]"
                              disabled={fetchingExternal === seg.segment_id}
                              onClick={() => onFetchExternal(seg)}
                            >
                              {fetchingExternal === seg.segment_id
                                ? "Fetching…"
                                : "Fetch from quote API"}
                            </Button>
                          )}
                        </div>
                      ) : seg.manual_cost != null ? (
                        <span>
                          {formatCurrency(seg.manual_cost, seg.currency)}
                          {seg.cost_source === "external" ? (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              (ext)
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-2 font-medium">
                      {seg.final_cost != null
                        ? formatCurrency(seg.final_cost, seg.currency)
                        : seg.cost_status === "requested"
                          ? "Cost requested"
                          : "Missing Cost"}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-col gap-1">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium w-fit",
                            seg.cost_status === "calculated" &&
                              "bg-green-500/10 text-green-700",
                            seg.cost_status === "manual" &&
                              "bg-blue-500/10 text-blue-700",
                            seg.cost_status === "missing" &&
                              "bg-red-500/10 text-red-700",
                            seg.cost_status === "requested" &&
                              "bg-purple-500/10 text-purple-700",
                          )}
                        >
                          {SEGMENT_STATUS[seg.cost_status]}
                        </span>
                        {showRequestQuote && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[10px]"
                            disabled={requestingQuote === seg.segment_id}
                            onClick={() => onRequestQuote(seg)}
                          >
                            {requestingQuote === seg.segment_id
                              ? "Requesting…"
                              : "Request quote"}
                          </Button>
                        )}
                      </div>
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
