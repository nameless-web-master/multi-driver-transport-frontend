"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Loader2, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { confirmSegment, rejectSegment, updateSegmentLegStatus } from "@/lib/api";
import {
  canSegmentMarkInTransit,
  canSegmentMarkPickedUp,
  SEGMENT_LEG_LABELS,
} from "@/lib/trackingActions";
import { cn, formatCurrency } from "@/lib/utils";
import type { RouteConfirmationStatus, TransporterConfirmationItem } from "@/types";
import { RouteStatusBadge, TrackingStatusBadge } from "@/components/orders/RouteStatusBadge";
import { OrderProgressBar } from "@/components/orders/SegmentTimeline";

const SEGMENT_STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20",
  accepted: "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20",
  rejected: "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20",
};

interface RouteGroup {
  route_id: number;
  order_id: number;
  route_label: string;
  sender_address: string;
  destination_address: string;
  items: TransporterConfirmationItem[];
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
}

interface ConfirmationPanelProps {
  items: TransporterConfirmationItem[];
  onUpdated?: () => void;
  onMessage?: (text: string, type?: "success" | "error") => void;
}

export function ConfirmationPanel({ items, onUpdated, onMessage }: ConfirmationPanelProps) {
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actingId, setActingId] = useState<number | null>(null);
  const [legUpdatingId, setLegUpdatingId] = useState<number | null>(null);

  const routeGroups = useMemo(() => {
    const map = new Map<number, RouteGroup>();
    for (const item of items) {
      let group = map.get(item.route_id);
      if (!group) {
        group = {
          route_id: item.route_id,
          order_id: item.order_id,
          route_label: item.route_label,
          sender_address: item.sender_address,
          destination_address: item.destination_address,
          items: [],
          pendingCount: 0,
          acceptedCount: 0,
          rejectedCount: 0,
        };
        map.set(item.route_id, group);
      }
      group.items.push(item);
      if (item.status === "pending") group.pendingCount += 1;
      else if (item.status === "accepted") group.acceptedCount += 1;
      else if (item.status === "rejected") group.rejectedCount += 1;
    }
    return Array.from(map.values()).sort(
      (a, b) => b.pendingCount - a.pendingCount || b.route_id - a.route_id
    );
  }, [items]);

  const selectedGroup = useMemo(
    () => routeGroups.find((g) => g.route_id === selectedRouteId) ?? null,
    [routeGroups, selectedRouteId]
  );

  const totalPending = items.filter((i) => i.status === "pending").length;

  async function handleAccept(segmentId: number) {
    setActingId(segmentId);
    try {
      await confirmSegment(segmentId);
      onMessage?.("Segment accepted.");
      onUpdated?.();
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Failed to accept", "error");
    } finally {
      setActingId(null);
    }
  }

  async function handleReject(segmentId: number) {
    setActingId(segmentId);
    try {
      await rejectSegment(segmentId, rejectReason);
      onMessage?.("Segment rejected.");
      setRejectingId(null);
      setRejectReason("");
      onUpdated?.();
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Failed to reject", "error");
    } finally {
      setActingId(null);
    }
  }

  async function handleSegmentLegAction(
    segmentId: number,
    legStatus: "picked_up" | "in_transit"
  ) {
    setLegUpdatingId(segmentId);
    try {
      await updateSegmentLegStatus(segmentId, legStatus);
      onMessage?.(
        legStatus === "picked_up"
          ? "Segment marked as picked up."
          : "Segment marked as in transit."
      );
      onUpdated?.();
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Failed to update segment status", "error");
    } finally {
      setLegUpdatingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No segment confirmation requests assigned to you.
        </CardContent>
      </Card>
    );
  }

  if (selectedGroup) {
    const trackingItem = selectedGroup.items[0];

    return (
      <div className="space-y-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => {
            setSelectedRouteId(null);
            setRejectingId(null);
            setRejectReason("");
          }}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to routes
        </Button>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Order #{selectedGroup.order_id} · {selectedGroup.route_label}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedGroup.sender_address || "—"} → {selectedGroup.destination_address || "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {selectedGroup.pendingCount} pending · {selectedGroup.acceptedCount} accepted ·{" "}
              {selectedGroup.rejectedCount} rejected
            </p>
            {trackingItem.route_selection_status === "confirmed" && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {trackingItem.pickup_ready_at ? (
                  <TrackingStatusBadge status={trackingItem.order_tracking_status} />
                ) : (
                  <span className="text-xs text-muted-foreground">Awaiting sender pick ready</span>
                )}
              </div>
            )}
          </CardHeader>
        </Card>

        {selectedGroup.items
          .sort((a, b) => a.segment_index - b.segment_index)
          .map((item) => (
            <SegmentCard
              key={item.confirmation_id}
              item={item}
              actingId={actingId}
              legUpdatingId={legUpdatingId}
              rejectingId={rejectingId}
              rejectReason={rejectReason}
              onAccept={handleAccept}
              onReject={handleReject}
              onSegmentLegAction={handleSegmentLegAction}
              onToggleReject={(segmentId) =>
                setRejectingId(rejectingId === segmentId ? null : segmentId)
              }
              onRejectReasonChange={setRejectReason}
            />
          ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {totalPending > 0 && (
        <p className="text-sm text-muted-foreground">
          {totalPending} segment{totalPending === 1 ? "" : "s"} awaiting your response across{" "}
          {routeGroups.length} route{routeGroups.length === 1 ? "" : "s"}.
        </p>
      )}
      {routeGroups.map((group) => (
        <Card
          key={group.route_id}
          className="cursor-pointer transition-colors hover:bg-muted/30"
          onClick={() => setSelectedRouteId(group.route_id)}
        >
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  Order #{group.order_id} · {group.route_label}
                </p>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {group.sender_address || "—"} → {group.destination_address || "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {group.items.length} segment{group.items.length === 1 ? "" : "s"}
                  {group.pendingCount > 0 && (
                    <span className="ml-2 text-amber-700 dark:text-amber-300 font-medium">
                      {group.pendingCount} pending
                    </span>
                  )}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const LEG_STATUS_BADGE: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground border border-border",
  picked_up: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20",
  in_transit: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20",
};

interface SegmentCardProps {
  item: TransporterConfirmationItem;
  actingId: number | null;
  legUpdatingId: number | null;
  rejectingId: number | null;
  rejectReason: string;
  onAccept: (segmentId: number) => void;
  onReject: (segmentId: number) => void;
  onSegmentLegAction: (segmentId: number, legStatus: "picked_up" | "in_transit") => void;
  onToggleReject: (segmentId: number) => void;
  onRejectReasonChange: (value: string) => void;
}

function SegmentCard({
  item,
  actingId,
  legUpdatingId,
  rejectingId,
  rejectReason,
  onAccept,
  onReject,
  onSegmentLegAction,
  onToggleReject,
  onRejectReasonChange,
}: SegmentCardProps) {
  const showPickedUp = canSegmentMarkPickedUp(item);
  const showInTransit = canSegmentMarkInTransit(item);
  const legUpdating = legUpdatingId === item.segment_id;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              Segment {item.segment_index + 1}: {item.from_label} → {item.to_label}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Request sent: {new Date(item.sent_at).toLocaleString()}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
              SEGMENT_STATUS_BADGE[item.status]
            )}
          >
            {item.status}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.status === "accepted" && item.route_selection_status === "confirmed" && (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                LEG_STATUS_BADGE[item.leg_status] ?? LEG_STATUS_BADGE.not_started
              )}
            >
              Leg: {SEGMENT_LEG_LABELS[item.leg_status]}
            </span>
            {showPickedUp && (
              <Button
                type="button"
                size="sm"
                disabled={legUpdating}
                onClick={() => onSegmentLegAction(item.segment_id, "picked_up")}
              >
                {legUpdating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Truck className="h-4 w-4 mr-1" />
                )}
                Picked up
              </Button>
            )}
            {showInTransit && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={legUpdating}
                onClick={() => onSegmentLegAction(item.segment_id, "in_transit")}
              >
                {legUpdating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Truck className="h-4 w-4 mr-1" />
                )}
                In transit
              </Button>
            )}
          </div>
        )}

        {item.status === "pending" ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => onAccept(item.segment_id)}
              disabled={actingId === item.segment_id}
            >
              {actingId === item.segment_id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-1" />
              )}
              Accept
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onToggleReject(item.segment_id)}
              disabled={actingId === item.segment_id}
            >
              <X className="h-4 w-4 mr-1" />
              Reject
            </Button>
          </div>
        ) : item.rejection_reason ? (
          <p className="text-xs text-red-600 dark:text-red-400">
            Rejection reason: {item.rejection_reason}
          </p>
        ) : null}

        {rejectingId === item.segment_id && (
          <div className="flex flex-wrap gap-2 items-end">
            <Input
              placeholder="Reason for rejection (optional)"
              value={rejectReason}
              onChange={(e) => onRejectReasonChange(e.target.value)}
              className="max-w-sm"
            />
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={() => onReject(item.segment_id)}
              disabled={actingId === item.segment_id}
            >
              Confirm reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface RouteConfirmationStatusPanelProps {
  confirmation: RouteConfirmationStatus;
  className?: string;
}

export function RouteConfirmationStatusPanel({
  confirmation,
  className,
}: RouteConfirmationStatusPanelProps) {
  return (
    <div className={cn("rounded-xl border border-border p-4 space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <RouteStatusBadge status={confirmation.selection_status} />
        {confirmation.payment_status === "ready" && (
          <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
            Payment ready
          </span>
        )}
      </div>
      <OrderProgressBar
        percent={confirmation.progress_percent}
        label="Segment confirmation progress"
      />
      <div className="space-y-2">
        {confirmation.segments.map((seg) => (
          <div
            key={seg.segment_id}
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs",
              seg.status === "accepted" && "bg-green-500/5 border border-green-500/20",
              seg.status === "pending" && "bg-amber-500/5 border border-amber-500/20",
              seg.status === "rejected" && "bg-red-500/5 border border-red-500/20"
            )}
          >
            <div>
              <p className="font-medium">
                {seg.from_label} → {seg.to_label}
              </p>
              <p className="text-muted-foreground">{seg.transporter_name}</p>
            </div>
            <div className="text-right">
              <p className="capitalize font-medium">{seg.status}</p>
              <p className="text-muted-foreground capitalize">
                Leg: {SEGMENT_LEG_LABELS[seg.leg_status ?? "not_started"]}
              </p>
              {seg.final_cost != null && (
                <p className="text-muted-foreground">
                  {formatCurrency(seg.final_cost, seg.currency)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
