"use client";

import { cn } from "@/lib/utils";
import {
  DELIVERY_NODE_COLORS,
  getActiveDeliveryPosition,
  getReceiverNodeState,
  getSegmentNodeState,
  getSenderNodeState,
  LEG_STATUS_LABELS,
} from "@/lib/deliveryProgress";
import type { SegmentConfirmationDetail, TrackingStatus } from "@/types";

interface DeliveryProgressTimelineProps {
  segments: SegmentConfirmationDetail[];
  trackingStatus?: TrackingStatus;
  pickupReadyAt?: string | null;
  routeConfirmed?: boolean;
  showSenderReceiver?: boolean;
  className?: string;
}

export function DeliveryProgressTimeline({
  segments,
  trackingStatus = "CONFIRMED",
  pickupReadyAt = null,
  routeConfirmed = false,
  showSenderReceiver = true,
  className,
}: DeliveryProgressTimelineProps) {
  const sorted = [...segments].sort((a, b) => a.segment_index - b.segment_index);
  const activePosition = getActiveDeliveryPosition(
    trackingStatus,
    pickupReadyAt,
    routeConfirmed,
    sorted
  );

  const nodes: {
    key: string;
    label: string;
    sub?: string;
    phase: "completed" | "current" | "upcoming";
    legLabel?: string;
  }[] = [];

  if (showSenderReceiver) {
    nodes.push({
      key: "sender",
      label: "Sender",
      phase: getSenderNodeState(trackingStatus, pickupReadyAt, routeConfirmed, sorted),
      sub: !pickupReadyAt && routeConfirmed ? "Pick ready" : undefined,
    });
  }

  for (const seg of sorted) {
    nodes.push({
      key: `seg-${seg.segment_id}`,
      label: seg.transporter_name,
      sub: `${seg.from_label} → ${seg.to_label}`,
      phase: getSegmentNodeState(seg, activePosition),
      legLabel:
        seg.leg_status !== "not_started" ? LEG_STATUS_LABELS[seg.leg_status] : undefined,
    });
  }

  if (showSenderReceiver) {
    nodes.push({
      key: "receiver",
      label: "Receiver",
      phase: getReceiverNodeState(trackingStatus, routeConfirmed, sorted),
      sub: trackingStatus === "DELIVERED" ? "Delivered" : undefined,
    });
  }

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-medium text-muted-foreground">Live delivery position</p>
      <div className="flex flex-wrap items-center gap-1">
        {nodes.map((node, i) => (
          <div key={node.key} className="flex items-center gap-1">
            <div className="flex flex-col items-center min-w-[88px] max-w-[150px]">
              <div
                className={cn(
                  "h-3.5 w-3.5 rounded-full border-2 transition-all",
                  DELIVERY_NODE_COLORS[node.phase]
                )}
              />
              <p
                className={cn(
                  "text-[10px] font-medium text-center mt-1 line-clamp-2",
                  node.phase === "current" ? "text-primary" : "text-foreground"
                )}
              >
                {node.label}
              </p>
              {node.legLabel && (
                <p className="text-[9px] font-medium text-primary text-center">{node.legLabel}</p>
              )}
              {node.sub && (
                <p className="text-[9px] text-muted-foreground text-center line-clamp-2">
                  {node.sub}
                </p>
              )}
            </div>
            {i < nodes.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-4 sm:w-8 shrink-0",
                  node.phase === "completed" ? "bg-green-500" : "bg-border"
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** @deprecated Use DeliveryProgressTimeline for delivery tracking views. */
export function SegmentTimeline({
  segments,
  showSenderReceiver = true,
  className,
}: {
  segments: SegmentConfirmationDetail[];
  showSenderReceiver?: boolean;
  className?: string;
}) {
  return (
    <DeliveryProgressTimeline
      segments={segments}
      showSenderReceiver={showSenderReceiver}
      className={className}
      routeConfirmed
    />
  );
}

interface OrderProgressBarProps {
  percent: number;
  className?: string;
  label?: string;
}

export function OrderProgressBar({ percent, className, label }: OrderProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span>{clamped}%</span>
        </div>
      )}
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
