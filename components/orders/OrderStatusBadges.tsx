"use client";

import { getDeliveryStatusLabel } from "@/components/orders/DeliveryStatusStepper";
import { RouteStatusBadge, TrackingStatusBadge } from "@/components/orders/RouteStatusBadge";
import { cn } from "@/lib/utils";
import type { Order } from "@/types";

interface OrderStatusBadgesProps {
  order: Pick<
    Order,
    | "selected_route_id"
    | "route_selection_status"
    | "tracking_status"
    | "pickup_ready_at"
  >;
  compact?: boolean;
  className?: string;
}

export function OrderStatusBadges({ order, compact = false, className }: OrderStatusBadgesProps) {
  const hasRoute = Boolean(order.selected_route_id);

  if (!hasRoute || !order.route_selection_status) {
    return (
      <span
        className={cn(
          "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border bg-muted/40",
          compact ? "text-[10px]" : "text-xs",
          className
        )}
      >
        No route selected
      </span>
    );
  }

  if (order.route_selection_status !== "confirmed") {
    return (
      <RouteStatusBadge
        status={order.route_selection_status}
        className={cn(compact ? "text-[10px] px-2 py-0.5" : undefined, className)}
      />
    );
  }

  const deliveryLabel = getDeliveryStatusLabel(
    true,
    order.pickup_ready_at,
    order.tracking_status
  );

  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary border border-primary/20",
          className
        )}
      >
        {deliveryLabel}
      </span>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1 items-start", className)}>
      <RouteStatusBadge status="confirmed" />
      <TrackingStatusBadge status={order.tracking_status} />
    </div>
  );
}
