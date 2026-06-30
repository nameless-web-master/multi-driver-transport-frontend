"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, MapPin, Package, Route, Send, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listOrders, connectOrder, updateOrderTrackingStatus } from "@/lib/api";
import { RouteCostComparison } from "@/components/orders/RouteCostComparison";
import { shipmentRef } from "@/lib/entityLabels";
import { showToast } from "@/lib/toast";
import { getDeliveryStatusLabel } from "@/components/orders/DeliveryStatusStepper";
import { canMarkDelivered, canMarkPickReady, canReceiverMarkPickReadyForPff } from "@/lib/trackingActions";
import { cn, formatDate } from "@/lib/utils";
import type { Order, TrackingStatus } from "@/types";
import { ReceiverNewOrderForm } from "./ReceiverNewOrderForm";
import { OrderPossibleRoutes } from "@/components/orders/OrderPossibleRoutes";
import { OrderPackageEditor } from "@/components/orders/OrderPackageEditor";
import { RouteStatusBadge } from "@/components/orders/RouteStatusBadge";

export function OrdersPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const isSender = user?.role === "sender" || user?.role === "admin";
  const isReceiver = user?.role === "receiver" || user?.role === "admin";

  const [orders, setOrders] = useState<Order[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const hasOrdersRef = useRef(false);
  const [updating, setUpdating] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState<number | null>(null);
  const [costRefreshKey, setCostRefreshKey] = useState(0);

  const isAwaitingConnect = (order: Order) => order.tracking_status === "AWAITING_CONNECT";

  const refresh = useCallback(async () => {
    if (!hasOrdersRef.current) {
      setInitialLoading(true);
    }
    try {
      const data = await listOrders();
      setOrders(data);
      hasOrdersRef.current = true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load orders", "error");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const raw = searchParams.get("orderId");
    if (!raw) return;
    const id = Number(raw);
    if (Number.isFinite(id)) setSelectedOrderId(id);
  }, [searchParams]);

  const showMessage = useCallback((text: string, type: "success" | "error" = "success") => {
    showToast(text, type);
  }, []);

  const counts = useMemo(() => {
    const c = { awaitingConnect: 0, noRoute: 0, pending: 0, confirmed: 0, rejected: 0 };
    orders.forEach((o) => {
      if (isAwaitingConnect(o)) {
        c.awaitingConnect += 1;
        return;
      }
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

  async function handleConnect(order: Order) {
    setConnecting(order.id);
    try {
      const { route_recalc_warning, ...updated } = await connectOrder(order.id);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      setSelectedOrderId(updated.id);
      setCostRefreshKey((k) => k + 1);
      showMessage("Shipment connected. Select a route and send confirmations.");
      if (route_recalc_warning) {
        showMessage(route_recalc_warning, "error");
      }
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Failed to connect order", "error");
    } finally {
      setConnecting(null);
    }
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
      <div className="px-6 pb-8 space-y-6">
        <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {isSender && (
            <StatTile icon={<Send className="h-5 w-5" />} label="Awaiting connect" value={counts.awaitingConnect} />
          )}
          <StatTile icon={<Route className="h-5 w-5" />} label="No route selected" value={counts.noRoute} />
          <StatTile icon={<Clock className="h-5 w-5" />} label="Awaiting confirmation" value={counts.pending} />
          <StatTile icon={<CheckCircle2 className="h-5 w-5" />} label="Route confirmed" value={counts.confirmed} />
          <StatTile icon={<XCircle className="h-5 w-5" />} label="Route rejected" value={counts.rejected} />
        </section>

        {isReceiver && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-4 w-4" /> Request shipment
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Submit a shipment request to a sender. They will connect routes after reviewing your order.
              </p>
            </CardHeader>
            <CardContent>
              <ReceiverNewOrderForm
                onCreated={(order) => {
                  setOrders((prev) => [order, ...prev]);
                }}
                onMessage={showMessage}
              />
            </CardContent>
          </Card>
        )}

        {isSender && (
          <Card className="border-dashed">
            <CardContent className="py-6 text-sm text-muted-foreground">
              Incoming shipment requests appear below. Click a row, then <strong className="text-foreground">Connect</strong> to
              build routes and send transporter confirmations. Receivers initiate new orders — you no longer pick from a
              global receiver directory.
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              {isSender ? "Your shipments" : "Shipments to you"}
            </CardTitle>
            <p className="hidden sm:block text-xs text-muted-foreground">
              Click any row to view package details and route options.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {initialLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : orders.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No shipments yet.</div>
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
                            {isAwaitingConnect(order) ? (
                              <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/20">
                                Awaiting connect
                              </span>
                            ) : hasRoute && order.route_selection_status ? (
                              <RouteStatusBadge status={order.route_selection_status} />
                            ) : (
                              <span className="text-xs text-muted-foreground">No route selected</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          {isAwaitingConnect(order) ? (
                            <span className="text-xs text-muted-foreground">Not started</span>
                          ) : order.route_selection_status === "confirmed" ? (
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
                            {isSender && isAwaitingConnect(order) && (
                              <Button
                                size="sm"
                                disabled={connecting === order.id}
                                onClick={() => void handleConnect(order)}
                              >
                                {connecting === order.id ? "Connecting…" : "Connect"}
                              </Button>
                            )}
                            {isSender && canMarkPickReady(order) && (
                              <Button
                                size="sm"
                                disabled={updating === order.id}
                                onClick={() => void handleTrackingAction(order, "PICKUP_AVAILABLE")}
                              >
                                {updating === order.id ? "Updating…" : "Pick ready"}
                              </Button>
                            )}
                            {isReceiver && canReceiverMarkPickReadyForPff(order) && (
                              <Button
                                size="sm"
                                disabled={updating === order.id}
                                onClick={() => void handleTrackingAction(order, "PICKUP_AVAILABLE")}
                              >
                                {updating === order.id ? "Updating…" : "Pickup available"}
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
            {isSender && isAwaitingConnect(selectedOrder) && (
              <Card className="border-violet-500/30 bg-violet-500/5">
                <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Shipment request from {selectedOrder.receiver_name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Review package details, then connect to generate routes and compare costs.
                    </p>
                  </div>
                  <Button
                    disabled={connecting === selectedOrder.id}
                    onClick={() => void handleConnect(selectedOrder)}
                  >
                    {connecting === selectedOrder.id ? "Connecting…" : "Connect shipment"}
                  </Button>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Package details · {shipmentRef(selectedOrder.id)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <OrderPackageEditor
                  order={selectedOrder}
                  canEdit={isSender && !isAwaitingConnect(selectedOrder)}
                  onUpdated={(updated) => {
                    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
                  }}
                  onCostsRecalculated={() => setCostRefreshKey((k) => k + 1)}
                  onMessage={(text, type) => showMessage(text, type)}
                />
              </CardContent>
            </Card>
            {!isAwaitingConnect(selectedOrder) && (
              <>
                <OrderPossibleRoutes
                  order={selectedOrder}
                  refreshSignal={costRefreshKey}
                  onMessage={showMessage}
                />
                {(isReceiver || isSender) && (
                  <RouteCostComparison
                    orderId={selectedOrder.id}
                    order={selectedOrder}
                    onOrderUpdated={(updated) => {
                      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
                    }}
                    refreshSignal={costRefreshKey}
                    onMessage={showMessage}
                  />
                )}
              </>
            )}
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
