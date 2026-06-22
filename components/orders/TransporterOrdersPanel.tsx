"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTransporterOrders } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { TransporterOrderViewItem } from "@/types";
import { TrackingStatusBadge } from "@/components/orders/RouteStatusBadge";

const SEGMENT_STATUS_STYLES: Record<string, string> = {
  pending: "text-amber-700 dark:text-amber-300",
  accepted: "text-green-700 dark:text-green-300",
  rejected: "text-red-700 dark:text-red-300",
};

export function TransporterOrdersPanel() {
  const [items, setItems] = useState<TransporterOrderViewItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const hasDataRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent && !hasDataRef.current) {
      setInitialLoading(true);
    }
    try {
      const data = await getTransporterOrders();
      setItems(data);
      hasDataRef.current = true;
    } catch {
      if (!hasDataRef.current) {
        setItems([]);
      }
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your routes…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No active routes assigned to you yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <Card key={`${item.order_id}-${item.route_id}`}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Order #{item.order_id} · {item.route_label}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {item.sender_address || "—"} → {item.destination_address || "—"}
                </p>
              </div>
              <TrackingStatusBadge status={item.tracking_status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {item.my_segments.map((seg) => (
              <div
                key={seg.segment_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2 text-xs"
              >
                <div>
                  <p className="font-medium">
                    Segment {seg.segment_index + 1}: {seg.from_label} → {seg.to_label}
                  </p>
                  <p className="text-muted-foreground capitalize">
                    Cost: {seg.cost_status}
                    {seg.final_cost != null && ` · $${seg.final_cost.toFixed(2)}`}
                  </p>
                </div>
                <span
                  className={cn(
                    "capitalize font-medium",
                    SEGMENT_STATUS_STYLES[seg.confirmation_status] ?? "text-muted-foreground"
                  )}
                >
                  {seg.confirmation_status}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
