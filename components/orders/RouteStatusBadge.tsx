"use client";

import { cn } from "@/lib/utils";
import type { RouteSelectionStatus, TrackingStatus } from "@/types";

const ROUTE_STATUS_STYLES: Record<RouteSelectionStatus, string> = {
  pending:
    "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20",
  confirmed:
    "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20",
  rejected:
    "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20",
  partially_confirmed:
    "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20",
};

const ROUTE_STATUS_LABEL: Record<RouteSelectionStatus, string> = {
  pending: "Pending confirmation",
  confirmed: "Confirmed",
  rejected: "Rejected",
  partially_confirmed: "Partially confirmed",
};

const TRACKING_STATUS_STYLES: Record<TrackingStatus, string> = {
  CONFIRMED:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20",
  PICKUP_AVAILABLE:
    "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20",
  PICKED_UP:
    "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20",
  IN_TRANSIT:
    "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20",
  DELIVERED:
    "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20",
};

const TRACKING_STATUS_LABEL: Record<TrackingStatus, string> = {
  CONFIRMED: "Confirmed",
  PICKUP_AVAILABLE: "Pickup available",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  DELIVERED: "Delivered",
};

interface RouteStatusBadgeProps {
  status: RouteSelectionStatus;
  className?: string;
}

export function RouteStatusBadge({ status, className }: RouteStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        ROUTE_STATUS_STYLES[status],
        className
      )}
    >
      {ROUTE_STATUS_LABEL[status]}
    </span>
  );
}

interface TrackingStatusBadgeProps {
  status: TrackingStatus;
  className?: string;
}

export function TrackingStatusBadge({ status, className }: TrackingStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        TRACKING_STATUS_STYLES[status],
        className
      )}
    >
      {TRACKING_STATUS_LABEL[status]}
    </span>
  );
}
