import type { SegmentLegStatus, TransporterConfirmationItem } from "@/types";
import { isPffPaymentMethod } from "@/lib/paymentFlow";

export function isRouteConfirmed(
  routeSelectionStatus: string | null | undefined
): boolean {
  return routeSelectionStatus === "confirmed";
}

export function canMarkPickReady(order: {
  route_selection_status?: string | null;
  pickup_ready_at?: string | null;
  tracking_status?: string;
  payment_method?: string;
}): boolean {
  if (isPffPaymentMethod(order.payment_method)) return false;
  return (
    order.tracking_status !== "AWAITING_CONNECT" &&
    isRouteConfirmed(order.route_selection_status) &&
    !order.pickup_ready_at &&
    (order.tracking_status === "CONFIRMED" || !order.tracking_status)
  );
}

/** PFF orders: receiver marks pickup available after route confirmation. */
export function canReceiverMarkPickReadyForPff(order: {
  route_selection_status?: string | null;
  pickup_ready_at?: string | null;
  tracking_status?: string;
  payment_method?: string;
}): boolean {
  if (!isPffPaymentMethod(order.payment_method)) return false;
  return (
    order.tracking_status !== "AWAITING_CONNECT" &&
    isRouteConfirmed(order.route_selection_status) &&
    !order.pickup_ready_at &&
    (order.tracking_status === "CONFIRMED" || !order.tracking_status)
  );
}

export function canMarkDelivered(order: {
  route_selection_status?: string | null;
  tracking_status: string;
  pickup_ready_at?: string | null;
}): boolean {
  return (
    isRouteConfirmed(order.route_selection_status) &&
    Boolean(order.pickup_ready_at) &&
    order.tracking_status === "IN_TRANSIT"
  );
}

export const SEGMENT_LEG_LABELS: Record<SegmentLegStatus, string> = {
  not_started: "Not started",
  picked_up: "Picked up",
  in_transit: "In transit",
};

/** First segment only — marks pickup from sender. */
export function canSegmentMarkPickedUp(item: TransporterConfirmationItem): boolean {
  if (!isRouteConfirmed(item.route_selection_status)) return false;
  if (!item.pickup_ready_at) return false;
  if (item.status !== "accepted") return false;
  if (item.segment_index !== 0) return false;
  return item.leg_status === "not_started";
}

/** Segments after the first — marks in transit on that leg only. */
export function canSegmentMarkInTransit(item: TransporterConfirmationItem): boolean {
  if (!isRouteConfirmed(item.route_selection_status)) return false;
  if (!item.pickup_ready_at) return false;
  if (item.status !== "accepted") return false;
  if (item.segment_index === 0) return false;
  if (item.leg_status !== "not_started") return false;
  if (item.segment_index === 1) {
    return item.previous_leg_status === "picked_up";
  }
  return item.previous_leg_status === "in_transit";
}

export const TRACKING_ACTION_LABELS = {
  REJECTED: "Rejected",
  AWAITING_CONNECT: "Awaiting connect",
  CONFIRMED: "Confirmed",
  PICKUP_AVAILABLE: "Pick ready",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  DELIVERED: "Delivered",
} as const;
