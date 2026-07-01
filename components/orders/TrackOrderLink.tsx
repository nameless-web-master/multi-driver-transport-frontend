"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { orderTrackingPath } from "@/lib/orderTrackingPaths";
import { useAuth } from "@/hooks/useAuth";
import type { TrackingStatus } from "@/types";

export const trackOrderLinkClassName =
  "inline-flex items-center justify-center gap-2 h-8 px-3 text-xs rounded-lg font-medium transition-colors bg-transparent border border-border text-foreground hover:bg-muted";

export function canTrackOrder(trackingStatus: TrackingStatus | string): boolean {
  return trackingStatus !== "AWAITING_CONNECT" && trackingStatus !== "REJECTED";
}

interface Props {
  orderId: number;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

export function TrackOrderLink({ orderId, className, onClick }: Props) {
  const { user } = useAuth();

  return (
    <Link
      href={orderTrackingPath(orderId, user?.role)}
      className={cn(trackOrderLinkClassName, className)}
      onClick={onClick}
    >
      Track
    </Link>
  );
}
