"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  DollarSign,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Route as RouteIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  applyExternalSegmentCost,
  applyManualSegmentCost,
  getPricingConfig,
  getTransporterQuoteQueue,
} from "@/lib/api";
import { segmentPricingHint } from "@/lib/zonePricing";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { SegmentCostStatus, TransporterQuoteRequest } from "@/types";

const SEGMENT_STATUS: Record<SegmentCostStatus, string> = {
  calculated: "Calculated",
  manual: "Manual Cost",
  missing: "Missing Cost",
  requested: "Cost Requested",
};

const STATUS_BADGE: Record<SegmentCostStatus, string> = {
  calculated: "bg-green-500/10 text-green-700 dark:text-green-300",
  manual: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  missing: "bg-red-500/10 text-red-700 dark:text-red-300",
  requested: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
};

export function QuoteRequestsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<TransporterQuoteRequest[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasDataRef = useRef(false);
  const [manualInputs, setManualInputs] = useState<Record<number, string>>({});
  const [savingSegment, setSavingSegment] = useState<number | null>(null);
  const [savingExternal, setSavingExternal] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [bookingFeeRate, setBookingFeeRate] = useState(0.02);

  const showMessage = useCallback((text: string, type: "success" | "error" = "success") => {
    setBanner({ text, type });
    setTimeout(() => setBanner(null), 4000);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent && !hasDataRef.current) {
      setInitialLoading(true);
    } else if (silent && hasDataRef.current) {
      setRefreshing(true);
    }
    try {
      const data = await getTransporterQuoteQueue();
      setItems(data);
      hasDataRef.current = true;
    } catch (err) {
      if (!hasDataRef.current) {
        setBanner({
          text: err instanceof Error ? err.message : "Failed to load quote requests",
          type: "error",
        });
        setItems([]);
      }
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    getPricingConfig()
      .then((c) => setBookingFeeRate(c.booking_fee_rate))
      .catch(() => undefined);
  }, [load]);

  async function handleManualSave(item: TransporterQuoteRequest) {
    const segmentId = item.segment.segment_id;
    const raw = manualInputs[segmentId] ?? "";
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      showMessage("Enter a valid cost >= 0", "error");
      return;
    }
    setSavingSegment(segmentId);
    try {
      await applyManualSegmentCost(segmentId, value);
      await load(true);
      showMessage("Quote saved.");
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Failed to save quote", "error");
    } finally {
      setSavingSegment(null);
    }
  }

  async function handleExternalSave(item: TransporterQuoteRequest) {
    const segmentId = item.segment.segment_id;
    const raw = manualInputs[segmentId] ?? "";
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      showMessage("Enter a valid cost >= 0", "error");
      return;
    }
    setSavingExternal(segmentId);
    try {
      await applyExternalSegmentCost(segmentId, value);
      await load(true);
      showMessage("External quote saved.");
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Failed to save external quote", "error");
    } finally {
      setSavingExternal(null);
    }
  }

  const requestedCount = items.filter((i) => i.segment.cost_status === "requested").length;

  return (
    <>
      {banner && (
        <div
          className={`mx-6 mb-4 rounded-xl border px-4 py-3 text-sm ${
            banner.type === "success"
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="px-6 pb-8 space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Quote requests
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Segments where a sender requested a price or automatic costing failed. Enter your
                quote to complete the route cost.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void load(true)}
              disabled={refreshing || initialLoading}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {initialLoading ? (
              <div className="py-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading quote requests…
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-sm text-muted-foreground">No pending quote requests.</p>
                <p className="text-xs text-muted-foreground">
                  When a sender clicks &ldquo;Request quote&rdquo; on your segment, it will appear
                  here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {requestedCount > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-purple-500/30 bg-purple-500/5 px-3 py-2 text-xs text-purple-800 dark:text-purple-200">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    {requestedCount} segment{requestedCount === 1 ? "" : "s"} explicitly requested
                    by senders — enter your price below.
                  </div>
                )}
                {items.map((item) => (
                  <QuoteRequestCard
                    key={item.segment.segment_id}
                    item={item}
                    isAdmin={user?.role === "admin"}
                    bookingFeeRate={bookingFeeRate}
                    manualInput={manualInputs[item.segment.segment_id] ?? ""}
                    onManualInputChange={(val) =>
                      setManualInputs((prev) => ({
                        ...prev,
                        [item.segment.segment_id]: val,
                      }))
                    }
                    onManualSave={() => handleManualSave(item)}
                    onExternalSave={() => handleExternalSave(item)}
                    savingManual={savingSegment === item.segment.segment_id}
                    savingExternal={savingExternal === item.segment.segment_id}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function QuoteRequestCard({
  item,
  isAdmin,
  bookingFeeRate,
  manualInput,
  onManualInputChange,
  onManualSave,
  onExternalSave,
  savingManual,
  savingExternal,
}: {
  item: TransporterQuoteRequest;
  isAdmin: boolean;
  bookingFeeRate: number;
  manualInput: string;
  onManualInputChange: (val: string) => void;
  onManualSave: () => void;
  onExternalSave: () => void;
  savingManual: boolean;
  savingExternal: boolean;
}) {
  const seg = item.segment;
  const isRequested = seg.cost_status === "requested";
  const showExternal = seg.transport_method === "air" || isRequested;

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">Order #{item.order_id}</p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                STATUS_BADGE[seg.cost_status]
              )}
            >
              {SEGMENT_STATUS[seg.cost_status]}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] capitalize">
              {item.order_status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <RouteIcon className="h-3 w-3 shrink-0" />
            {item.route_label}
          </p>
          {isAdmin && (
            <p className="text-xs text-muted-foreground">
              Transporter: {seg.transporter_name}
            </p>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground whitespace-nowrap">
          Updated {formatDate(item.updated_at)}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 text-xs text-muted-foreground">
        <p className="flex items-start gap-1.5">
          <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
          <span className="line-clamp-2">{item.sender_address || "—"}</span>
        </p>
        <p className="flex items-start gap-1.5">
          <MapPin className="h-3 w-3 shrink-0 mt-0.5 text-primary" />
          <span className="line-clamp-2">{item.destination_address || "—"}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {(item.packages?.length
          ? item.packages
          : item.package_type
            ? [{ package_type: item.package_type }]
            : []
        ).map((pkg, index) => (
          <span
            key={`${pkg.package_type}-${index}`}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 capitalize"
          >
            <Package className="h-3 w-3" />
            {pkg.package_type.replace(/_/g, " ")}
          </span>
        ))}
        {item.package_weight_lbs != null && (
          <span className="rounded-md bg-muted px-2 py-1">{item.package_weight_lbs} lb</span>
        )}
        {item.package_dimensions_in && (
          <span className="rounded-md bg-muted px-2 py-1">{item.package_dimensions_in}</span>
        )}
      </div>

      <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
        <p>
          <span className="text-muted-foreground">Segment:</span>{" "}
          {seg.from_label} → {seg.to_label}
        </p>
        <p className="text-xs text-muted-foreground mt-1 capitalize">
          {seg.transport_method}
          {seg.distance_km != null ? ` · ${seg.distance_km} km` : ""}
          {seg.time_hours != null ? ` · ${seg.time_hours} hr` : ""}
        </p>
        {segmentPricingHint(seg, bookingFeeRate) && (
          <p className="text-xs text-muted-foreground mt-1">
            Rates: {segmentPricingHint(seg, bookingFeeRate)}
          </p>
        )}
        {seg.calculated_cost != null && (
          <p className="text-xs text-muted-foreground mt-1">
            Previous estimate: {formatCurrency(seg.calculated_cost, seg.currency)}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 pt-1">
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Your quote ({seg.currency})
          </label>
          <div className="flex items-center gap-2">
            <Input
              className="h-9 w-28"
              inputMode="decimal"
              placeholder="0.00"
              value={manualInput}
              onChange={(e) => onManualInputChange(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              disabled={savingManual}
              onClick={onManualSave}
            >
              {savingManual ? "Saving…" : "Save quote"}
            </Button>
          </div>
        </div>
        {showExternal && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={savingExternal}
            onClick={onExternalSave}
          >
            {savingExternal ? "Saving…" : "Save as external quote"}
          </Button>
        )}
        <Link
          href={`/routes?orderId=${item.order_id}`}
          className="text-xs text-primary hover:underline ml-auto self-center"
        >
          View full route comparison
        </Link>
      </div>
    </div>
  );
}
