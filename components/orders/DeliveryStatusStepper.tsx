"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { deriveEffectiveTrackingStatus } from "@/lib/deliveryProgress";
import type { SegmentConfirmationDetail, TrackingStatus } from "@/types";

export const TRACKING_STATUS_LABELS: Record<TrackingStatus, string> = {
  CONFIRMED: "Confirmed",
  PICKUP_AVAILABLE: "Pickup ready",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  DELIVERED: "Delivered",
};

const TRACKING_STATUS_HINTS: Record<TrackingStatus, string> = {
  CONFIRMED: "Route confirmed by all transporters. Sender can mark the package as pick ready.",
  PICKUP_AVAILABLE: "Package is ready at the sender — waiting for the first transporter to pick up.",
  PICKED_UP: "Package has been collected from the sender and is moving through the route.",
  IN_TRANSIT: "Package is in transit through the multi-transporter chain toward the receiver.",
  DELIVERED: "Package has been delivered to the receiver.",
};

const ROUTE_NOT_CONFIRMED_HINT =
  "Delivery tracking starts after all transporters confirm the selected route.";

const DELIVERY_STEPS: { id: string; label: string }[] = [
  { id: "CONFIRMED", label: "Confirmed" },
  { id: "pick_ready", label: "Pick ready" },
  { id: "PICKED_UP", label: TRACKING_STATUS_LABELS.PICKED_UP },
  { id: "IN_TRANSIT", label: TRACKING_STATUS_LABELS.IN_TRANSIT },
  { id: "DELIVERED", label: TRACKING_STATUS_LABELS.DELIVERED },
];

function currentStepIndex(
  routeConfirmed: boolean,
  pickupReadyAt: string | null | undefined,
  trackingStatus: TrackingStatus
): number {
  if (!routeConfirmed) return -1;
  if (!pickupReadyAt) return 0;
  if (trackingStatus === "CONFIRMED" || trackingStatus === "PICKUP_AVAILABLE") return 1;
  if (trackingStatus === "PICKED_UP") return 2;
  if (trackingStatus === "IN_TRANSIT") return 3;
  if (trackingStatus === "DELIVERED") return 4;
  return 1;
}

function currentStatusLabel(
  routeConfirmed: boolean,
  pickupReadyAt: string | null | undefined,
  trackingStatus: TrackingStatus
): string {
  if (!routeConfirmed) return "Route not confirmed";
  if (!pickupReadyAt) return TRACKING_STATUS_LABELS.CONFIRMED;
  return TRACKING_STATUS_LABELS[trackingStatus];
}

export function getDeliveryStatusLabel(
  routeConfirmed: boolean,
  pickupReadyAt: string | null | undefined,
  trackingStatus: TrackingStatus
): string {
  return currentStatusLabel(routeConfirmed, pickupReadyAt, trackingStatus);
}

function currentStatusHint(
  routeConfirmed: boolean,
  pickupReadyAt: string | null | undefined,
  trackingStatus: TrackingStatus
): string {
  if (!routeConfirmed) return ROUTE_NOT_CONFIRMED_HINT;
  if (!pickupReadyAt) return TRACKING_STATUS_HINTS.CONFIRMED;
  return TRACKING_STATUS_HINTS[trackingStatus];
}

interface DeliveryStatusStepperProps {
  trackingStatus: TrackingStatus;
  pickupReadyAt?: string | null;
  routeConfirmed?: boolean;
  segments?: Pick<SegmentConfirmationDetail, "segment_index" | "leg_status">[];
  className?: string;
}

export function DeliveryStatusStepper({
  trackingStatus,
  pickupReadyAt = null,
  routeConfirmed = false,
  segments,
  className,
}: DeliveryStatusStepperProps) {
  const effectiveStatus = deriveEffectiveTrackingStatus(
    trackingStatus,
    pickupReadyAt,
    segments
  );
  const activeIndex = currentStepIndex(routeConfirmed, pickupReadyAt, effectiveStatus);
  const statusLabel = currentStatusLabel(routeConfirmed, pickupReadyAt, effectiveStatus);
  const statusHint = currentStatusHint(routeConfirmed, pickupReadyAt, effectiveStatus);

  return (
    <div className={cn("rounded-xl border border-border bg-muted/20 p-4 space-y-4", className)}>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Delivery status — where is it now?
        </p>
        <p className="text-lg font-semibold mt-1">{statusLabel}</p>
        <p className="text-sm text-muted-foreground mt-1">{statusHint}</p>
      </div>

      <div className="flex flex-wrap items-start gap-1 sm:gap-0">
        {DELIVERY_STEPS.map((step, index) => {
          const isComplete = routeConfirmed && activeIndex > index;
          const isCurrent = routeConfirmed && activeIndex === index;
          const isUpcoming = !routeConfirmed || activeIndex < index;

          return (
            <div key={step.id} className="flex items-center min-w-[72px] sm:min-w-0 sm:flex-1">
              <div className="flex flex-col items-center flex-1 px-1">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                    isComplete && "border-green-500 bg-green-500 text-white",
                    isCurrent && "border-primary bg-primary text-primary-foreground ring-4 ring-primary/20",
                    isUpcoming && "border-border bg-background text-muted-foreground"
                  )}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <p
                  className={cn(
                    "mt-2 text-center text-[10px] sm:text-xs leading-tight max-w-[88px]",
                    isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </p>
              </div>
              {index < DELIVERY_STEPS.length - 1 && (
                <div
                  className={cn(
                    "hidden sm:block h-0.5 flex-1 mx-1 mt-[-1.25rem]",
                    isComplete ? "bg-green-500" : "bg-border"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
