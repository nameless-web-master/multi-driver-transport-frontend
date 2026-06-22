"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, MapPin, Package, Route, Send, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listOrders, updateOrderTrackingStatus } from "@/lib/api";
import { getDeliveryStatusLabel } from "@/components/orders/DeliveryStatusStepper";
import { canMarkDelivered, canMarkPickReady } from "@/lib/trackingActions";
import { cn, formatDate } from "@/lib/utils";
import type { Order, TrackingStatus } from "@/types";
import { NewOrderForm } from "./NewOrderForm";
import { OrderPossibleRoutes } from "@/components/orders/OrderPossibleRoutes";
import { OrderPackageEditor } from "@/components/orders/OrderPackageEditor";
import { RouteStatusBadge } from "@/components/orders/RouteStatusBadge";

export function OrdersPage() {
  const { user } = useAuth();
  const isSender = user?.role === "sender" || user?.role === "admin";
  const isReceiver = user?.role === "receiver" || user?.role === "admin";

  const [orders, setOrders] = useState<Order[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const hasOrdersRef = useRef(false);
  const [updating, setUpdating] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [costRefreshKey, setCostRefreshKey] = useState(0);

  const refresh = useCallback(async () => {
    if (!hasOrdersRef.current) {
      setInitialLoading(true);
    }
    try {
      const data = await listOrders();
      setOrders(data);
      hasOrdersRef.current = true;
    } catch (err) {
      setBanner({ text: err instanceof Error ? err.message : "Failed to load orders", type: "error" });
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const showMessage = useCallback((text: string, type: "success" | "error" = "success") => {
    setBanner({ text, type });
    setTimeout(() => setBanner(null), 4000);
  }, []);

  const counts = useMemo(() => {
    const c = { noRoute: 0, pending: 0, confirmed: 0, rejected: 0 };
    orders.forEach((o) => {
      if (!o.selected_route_id) {
        c.noRoute += 1;
      } else if (o.route_selection_status === "confirmed") {
        c.confirmed += 1;
      } else if (o.route_selection_status === "rejected") {
        c.rejected += 1;
      } else {
        c.pending += 1;
      }
    });
    return c;
  }, [orders]);

  const selectedOrder = useMemo(
    () => (selectedOrderId == null ? null : orders.find((o) => o.id === selectedOrderId) ?? null),
    [selectedOrderId, orders]
  );

  function handleRowClick(order: Order) {
    setSelectedOrderId((prev) => (prev === order.id ? null : order.id));
  }

  async function handleTrackingAction(order: Order, status: TrackingStatus) {
    setUpdating(order.id);
    try {
      const result = await updateOrderTrackingStatus(order.id, status);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? {
                ...o,
                tracking_status: result.tracking_status,
                pickup_ready_at: result.pickup_ready_at,
              }
            : o
        )
      );
      showMessage(
        status === "PICKUP_AVAILABLE"
          ? "Pickup marked as ready."
          : status === "DELIVERED"
            ? "Order marked as delivered."
            : "Status updated."
      );
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Update failed", "error");
    } finally {
      setUpdating(null);
    }
  }

  return (
    <>
      {banner && (
        <div
          className={`mx-6 mb-4 rounded-xl border px-4 py-3 text-sm ${
            banner.type === "success"
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="px-6 pb-8 space-y-6">
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile icon={<Route className="h-5 w-5" />} label="No route selected" value={counts.noRoute} />
          <StatTile icon={<Clock className="h-5 w-5" />} label="Awaiting confirmation" value={counts.pending} />
          <StatTile icon={<CheckCircle2 className="h-5 w-5" />} label="Route confirmed" value={counts.confirmed} />
          <StatTile icon={<XCircle className="h-5 w-5" />} label="Route rejected" value={counts.rejected} />
        </section>

        {isSender && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-4 w-4" /> Create order
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NewOrderForm
                onCreated={(order) => {
                  setOrders((prev) => [order, ...prev]);
                  showMessage("Order submitted.");
                }}
                onMessage={showMessage}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              {isSender ? "Your orders" : "Orders to you"}
            </CardTitle>
            <p className="hidden sm:block text-xs text-muted-foreground">
              Click any row to view package details and route options.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {initialLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : orders.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No orders yet.</div>
            ) : (
              <table className="w-full min-w-[1000px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-3 pr-4 font-medium">#</th>
                    <th className="py-3 pr-4 font-medium">{isSender ? "Receiver" : "Sender"}</th>
                    <th className="py-3 pr-4 font-medium">Phone</th>
                    <th className="py-3 pr-4 font-medium">From</th>
                    <th className="py-3 pr-4 font-medium">To</th>
                    <th className="py-3 pr-4 font-medium">Route</th>
                    <th className="py-3 pr-4 font-medium">Route status</th>
                    <th className="py-3 pr-4 font-medium">Delivery status</th>
                    <th className="py-3 pr-4 font-medium">Submitted</th>
                    <th className="py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const counterparty = isSender ? order.receiver_name : order.sender_name;
                    const counterpartyPhone = isSender ? order.receiver_phone : order.sender_phone;
                    const isSelected = selectedOrderId === order.id;
                    const hasRoute = Boolean(order.selected_route_id);
                    return (
                      <tr
                        key={order.id}
                        onClick={() => handleRowClick(order)}
                        className={cn(
                          "border-b border-border/70 last:border-0 cursor-pointer transition-colors",
                          isSelected ? "bg-primary/5" : "hover:bg-muted/50"
                        )}
                      >
                        <td className="py-3 pr-4 font-mono text-xs">#{order.id}</td>
                        <td className="py-3 pr-4 font-medium">{counterparty}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{counterpartyPhone || "—"}</td>
                        <td className="py-3 pr-4 max-w-[160px] truncate" title={order.sender_address}>
                          {order.sender_address || "—"}
                        </td>
                        <td className="py-3 pr-4 max-w-[160px] truncate" title={order.destination_address}>
                          {order.destination_address || "—"}
                        </td>
                        <td className="py-3 pr-4 max-w-[140px] truncate text-muted-foreground" title={order.selected_route_label ?? undefined}>
                          {order.selected_route_label || "—"}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-col gap-1 items-start">
                            {hasRoute && order.route_selection_status ? (
                              <RouteStatusBadge status={order.route_selection_status} />
                            ) : (
                              <span className="text-xs text-muted-foreground">No route selected</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          {order.route_selection_status === "confirmed" ? (
                            <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                              {getDeliveryStatusLabel(
                                true,
                                order.pickup_ready_at,
                                order.tracking_status
                              )}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">{formatDate(order.submitted_at)}</td>
                        <td
                          className="py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex flex-col items-end gap-1.5">
                            {isSender && canMarkPickReady(order) && (
                              <Button
                                size="sm"
                                disabled={updating === order.id}
                                onClick={() => void handleTrackingAction(order, "PICKUP_AVAILABLE")}
                              >
                                {updating === order.id ? "Updating…" : "Pick ready"}
                              </Button>
                            )}
                            {isReceiver &&
                              (order.receiver_user_id === user?.id || user?.role === "admin") &&
                              canMarkDelivered(order) && (
                                <Button
                                  size="sm"
                                  disabled={updating === order.id}
                                  onClick={() => void handleTrackingAction(order, "DELIVERED")}
                                >
                                  {updating === order.id ? "Updating…" : "Delivered"}
                                </Button>
                              )}
                            <Link
                              href={`/orders/${order.id}/tracking`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            >
                              <MapPin className="h-3.5 w-3.5" />
                              Track
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {selectedOrder && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Package details · Order #{selectedOrder.id}</CardTitle>
              </CardHeader>
              <CardContent>
                <OrderPackageEditor
                  order={selectedOrder}
                  canEdit={isSender}
                  onUpdated={(updated) => {
                    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
                  }}
                  onCostsRecalculated={() => setCostRefreshKey((k) => k + 1)}
                  onMessage={(text, type) => showMessage(text, type)}
                />
              </CardContent>
            </Card>
            <OrderPossibleRoutes
              order={selectedOrder}
              refreshSignal={costRefreshKey}
              onMessage={showMessage}
            />
          </div>
        )}
      </div>
    </>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            {icon}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tracking-tight">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
