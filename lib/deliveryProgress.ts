import type { SegmentConfirmationDetail, SegmentLegStatus, TrackingStatus } from "@/types";

export type DeliveryNodePhase = "completed" | "current" | "upcoming";

export interface DeliveryNodeState {
  phase: DeliveryNodePhase;
  label: string;
}

/** Which chain node is active: sender, segment index, or receiver. */
export function getActiveDeliveryPosition(
  trackingStatus: TrackingStatus,
  pickupReadyAt: string | null | undefined,
  routeConfirmed: boolean,
  segments: Pick<SegmentConfirmationDetail, "segment_index" | "leg_status">[]
): "sender" | "receiver" | number {
  if (!routeConfirmed) return "sender";
  const effective = deriveEffectiveTrackingStatus(trackingStatus, pickupReadyAt, segments);
  if (effective === "DELIVERED") return "receiver";
  if (!pickupReadyAt || effective === "CONFIRMED") return "sender";

  const sorted = [...segments].sort((a, b) => a.segment_index - b.segment_index);

  for (const seg of sorted) {
    if (seg.segment_index === 0) {
      if (seg.leg_status === "not_started") return 0;
      continue;
    }
    if (seg.leg_status === "not_started") return seg.segment_index;
  }

  if (sorted.length > 0 && sorted.every((s) => s.leg_status === "in_transit")) {
    return "receiver";
  }

  if (effective === "IN_TRANSIT") {
    const next = sorted.find((s) => s.leg_status === "not_started");
    if (next) return next.segment_index;
    return "receiver";
  }

  if (effective === "PICKED_UP") {
    const next = sorted.find((s) => s.segment_index > 0 && s.leg_status === "not_started");
    return next ? next.segment_index : 0;
  }

  return 0;
}

export function getSenderNodeState(
  trackingStatus: TrackingStatus,
  pickupReadyAt: string | null | undefined,
  routeConfirmed: boolean,
  segments: Pick<SegmentConfirmationDetail, "segment_index" | "leg_status">[] = []
): DeliveryNodePhase {
  if (!routeConfirmed) return "upcoming";
  const effective = deriveEffectiveTrackingStatus(trackingStatus, pickupReadyAt, segments);
  if (effective === "DELIVERED") return "completed";
  if (!pickupReadyAt || effective === "CONFIRMED") return "current";
  return "completed";
}

export function getReceiverNodeState(
  trackingStatus: TrackingStatus,
  routeConfirmed: boolean,
  segments: Pick<SegmentConfirmationDetail, "leg_status">[]
): DeliveryNodePhase {
  if (!routeConfirmed) return "upcoming";
  if (trackingStatus === "DELIVERED") return "completed";
  const allInTransit =
    segments.length > 0 && segments.every((s) => s.leg_status === "in_transit");
  if (trackingStatus === "IN_TRANSIT" && allInTransit) return "current";
  return "upcoming";
}

export function getSegmentNodeState(
  segment: Pick<SegmentConfirmationDetail, "segment_index" | "leg_status">,
  activePosition: ReturnType<typeof getActiveDeliveryPosition>
): DeliveryNodePhase {
  if (segment.leg_status === "picked_up" || segment.leg_status === "in_transit") {
    return "completed";
  }
  if (activePosition === segment.segment_index) return "current";
  return "upcoming";
}

export const DELIVERY_NODE_COLORS: Record<DeliveryNodePhase, string> = {
  completed: "bg-green-500 border-green-500 shadow-sm shadow-green-500/30",
  current: "bg-primary border-primary ring-4 ring-primary/25 scale-110",
  upcoming: "bg-muted border-border",
};

export const LEG_STATUS_LABELS: Record<SegmentLegStatus, string> = {
  not_started: "Waiting",
  picked_up: "Picked up",
  in_transit: "In transit",
};

const TRACKING_STATUS_RANK: Record<TrackingStatus, number> = {
  AWAITING_CONNECT: -1,
  REJECTED: -2,
  CONFIRMED: 0,
  PICKUP_AVAILABLE: 1,
  PICKED_UP: 2,
  IN_TRANSIT: 3,
  DELIVERED: 4,
};

/** Derive order-level status from segment legs when legs are ahead of the stored order row. */
export function deriveTrackingStatusFromLegs(
  segments: Pick<SegmentConfirmationDetail, "segment_index" | "leg_status">[],
  pickupReady: boolean
): TrackingStatus {
  if (!pickupReady) return "CONFIRMED";

  const legs = [...segments]
    .sort((a, b) => a.segment_index - b.segment_index)
    .map((s) => s.leg_status);

  if (legs.length === 0) return "PICKUP_AVAILABLE";

  const allInTransit = legs.every((l) => l === "in_transit");
  const anyInTransit = legs.some((l) => l === "in_transit");
  const firstPickedUp = legs[0] === "picked_up" || legs[0] === "in_transit";

  if (allInTransit || anyInTransit) return "IN_TRANSIT";
  if (firstPickedUp) return legs.length === 1 ? "IN_TRANSIT" : "PICKED_UP";
  return "PICKUP_AVAILABLE";
}

export function deriveEffectiveTrackingStatus(
  trackingStatus: TrackingStatus,
  pickupReadyAt: string | null | undefined,
  segments?: Pick<SegmentConfirmationDetail, "segment_index" | "leg_status">[]
): TrackingStatus {
  if (trackingStatus === "AWAITING_CONNECT") return "AWAITING_CONNECT";
  if (trackingStatus === "DELIVERED") return "DELIVERED";

  const fromLegs = deriveTrackingStatusFromLegs(segments ?? [], Boolean(pickupReadyAt));
  return TRACKING_STATUS_RANK[fromLegs] > TRACKING_STATUS_RANK[trackingStatus]
    ? fromLegs
    : trackingStatus;
}
