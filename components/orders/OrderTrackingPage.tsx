"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, MapPin } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeliveryStatusStepper } from "@/components/orders/DeliveryStatusStepper";
import { RoleBasedMapView } from "@/components/orders/RoleBasedMapView";
import { RouteConfirmationStatusPanel } from "@/components/orders/ConfirmationPanel";
import { OrderProgressBar } from "@/components/orders/SegmentTimeline";
import { RouteStatusBadge } from "@/components/orders/RouteStatusBadge";
import {
  getOrderById,
  getOrderTrackingStatus,
  getReceiverOrderView,
  getRouteConfirmationStatus,
  getSelectedRoute,
  getSenderOrderView,
} from "@/lib/api";
import type {
  Order,
  RouteConfirmationStatus,
  TrackingStatus,
} from "@/types";

interface Props {
  orderId: number;
}

export function OrderTrackingPage({ orderId }: Props) {
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>("CONFIRMED");
  const [pickupReadyAt, setPickupReadyAt] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<RouteConfirmationStatus | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const routeIdRef = useRef<number | null>(null);

  const loadConfirmationContext = useCallback(async () => {
    const role = user?.role;
    if (role === "sender" || role === "admin") {
      const view = await getSenderOrderView(orderId);
      setConfirmation(view.confirmation);
      routeIdRef.current = view.confirmation?.route_id ?? null;
    } else if (role === "receiver") {
      const view = await getReceiverOrderView(orderId);
      setConfirmation(view.confirmation);
      routeIdRef.current = view.confirmation?.route_id ?? null;
    } else {
      setConfirmation(null);
      routeIdRef.current = null;
    }

    if (!routeIdRef.current) {
      try {
        const selection = await getSelectedRoute(orderId);
        routeIdRef.current = selection.selected_route_id;
        const status = await getRouteConfirmationStatus(selection.selected_route_id);
        setConfirmation(status);
      } catch {
        routeIdRef.current = null;
      }
    }
  }, [orderId, user?.role]);

  const pollLiveData = useCallback(async () => {
    if (!hasLoadedRef.current) return;
    setRefreshing(true);
    try {
      const tracking = await getOrderTrackingStatus(orderId);
      setTrackingStatus(tracking.tracking_status);
      setPickupReadyAt(tracking.pickup_ready_at);
      if (routeIdRef.current) {
        const status = await getRouteConfirmationStatus(routeIdRef.current);
        setConfirmation(status);
      }
    } catch {
      // Keep last good data during background refresh.
    } finally {
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    hasLoadedRef.current = false;
    routeIdRef.current = null;
    setInitialLoading(true);
    setError(null);

    void (async () => {
      try {
        const o = await getOrderById(orderId);
        setOrder(o);
        hasLoadedRef.current = true;
        if (user?.role) {
          await loadConfirmationContext();
        }
        const tracking = await getOrderTrackingStatus(orderId);
        setTrackingStatus(tracking.tracking_status);
        setPickupReadyAt(tracking.pickup_ready_at);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tracking data");
      } finally {
        setInitialLoading(false);
      }
    })();
  }, [orderId]);

  useEffect(() => {
    if (!hasLoadedRef.current || !user?.role) return;
    void loadConfirmationContext();
  }, [user?.role, loadConfirmationContext]);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    const id = setInterval(() => {
      void pollLiveData();
    }, 15000);
    return () => clearInterval(id);
  }, [orderId, pollLiveData]);

  if (initialLoading) {
    return (
      <div className="px-6 pb-8 flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading order tracking…
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="px-6 pb-8 text-center py-12 text-sm text-red-600 dark:text-red-400">
        {error ?? "Order not found"}
      </div>
    );
  }

  const role = user?.role ?? "sender";
  const routeConfirmed =
    order.route_selection_status === "confirmed" ||
    confirmation?.selection_status === "confirmed";

  return (
    <div className="px-6 pb-8 space-y-6">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to orders
      </Link>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Order #{order.id} tracking
            </CardTitle>
            <div className="flex items-center gap-2">
              {refreshing && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
              {confirmation && (
                <RouteStatusBadge status={confirmation.selection_status} />
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {order.sender_address} → {order.destination_address}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <DeliveryStatusStepper
            trackingStatus={trackingStatus}
            pickupReadyAt={pickupReadyAt ?? order.pickup_ready_at}
            routeConfirmed={routeConfirmed}
            segments={confirmation?.segments}
          />
          {confirmation && confirmation.selection_status !== "confirmed" && (
            <OrderProgressBar
              percent={confirmation.progress_percent}
              label="Route confirmation progress"
            />
          )}
          <RoleBasedMapView
            order={order}
            confirmation={confirmation}
            trackingStatus={trackingStatus}
            pickupReadyAt={pickupReadyAt ?? order.pickup_ready_at}
            routeConfirmed={routeConfirmed}
            role={role === "driver" ? "driver" : role === "receiver" ? "receiver" : "sender"}
          />
        </CardContent>
      </Card>

      {confirmation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Segment confirmation details</CardTitle>
          </CardHeader>
          <CardContent>
            <RouteConfirmationStatusPanel confirmation={confirmation} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
