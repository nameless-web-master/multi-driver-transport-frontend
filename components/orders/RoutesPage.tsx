"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, MapPin, Package, Route as RouteIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadges } from "@/components/orders/OrderStatusBadges";
import { connectOrder, listOrders, rejectOrder } from "@/lib/api";
import { getShipmentEntityLabels, shipmentRef } from "@/lib/entityLabels";
import { paymentMethodLabel } from "@/lib/paymentFlow";
import { showToast } from "@/lib/toast";
import { cn, formatDate } from "@/lib/utils";
import type { Order } from "@/types";
import { RouteCostComparison } from "@/components/orders/RouteCostComparison";
import { OrderPackageEditor } from "@/components/orders/OrderPackageEditor";

export function RoutesPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const isSender = user?.role === "sender" || user?.role === "admin";
  const isDriver = user?.role === "driver";
  const entity = getShipmentEntityLabels();
  const entityLabel = entity.lowercase;
  const EntityLabel = entity.capitalized;

  const [orders, setOrders] = useState<Order[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const hasOrdersRef = useRef(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [costRefreshKey, setCostRefreshKey] = useState(0);
  const [connecting, setConnecting] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);

  const isAwaitingConnect = (order: Order) => order.tracking_status === "AWAITING_CONNECT";
  const isRejected = (order: Order) => order.tracking_status === "REJECTED";

  const refresh = useCallback(async (silent = false) => {
    if (!silent && !hasOrdersRef.current) {
      setInitialLoading(true);
    }
    try {
      const data = await listOrders();
      setOrders(data);
      hasOrdersRef.current = data.length > 0;
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : `Failed to load ${entityLabel}s`,
        "error"
      );
    } finally {
      setInitialLoading(false);
    }
  }, [entityLabel]);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  // Deep-link: /routes?orderId=5
  useEffect(() => {
    const raw = searchParams.get("orderId");
    if (!raw) return;
    const id = Number(raw);
    if (Number.isFinite(id)) setSelectedOrderId(id);
  }, [searchParams]);

  // Auto-select the first order when none is chosen yet.
  useEffect(() => {
    if (selectedOrderId != null || orders.length === 0) return;
    setSelectedOrderId(orders[0].id);
  }, [orders, selectedOrderId]);

  const selectedOrder = useMemo(
    () =>
      selectedOrderId == null ? null : orders.find((o) => o.id === selectedOrderId) ?? null,
    [selectedOrderId, orders]
  );

  const showMessage = useCallback((text: string, type: "success" | "error" = "success") => {
    showToast(text, type);
  }, []);

  async function handleConnect(order: Order) {
    setConnecting(order.id);
    try {
      const { route_recalc_warning, ...updated } = await connectOrder(order.id);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      setCostRefreshKey((k) => k + 1);
      showToast("Shipment connected. Compare routes below.", "success");
      if (route_recalc_warning) {
        showToast(route_recalc_warning, "error");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to connect shipment", "error");
    } finally {
      setConnecting(null);
    }
  }

  async function handleReject(order: Order) {
    setRejecting(order.id);
    try {
      const updated = await rejectOrder(order.id);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      showToast("Shipment request rejected.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to reject shipment", "error");
    } finally {
      setRejecting(null);
    }
  }

  return (
    <>
      <div className="px-6 pb-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RouteIcon className="h-4 w-4" />
              Select {entity.indefiniteArticle} {EntityLabel}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {isDriver
                ? "Pick a shipment to view routes and enter quotes for your segments."
                : "Pick a shipment to compare possible delivery routes by estimated cost."}
            </p>
          </CardHeader>
          <CardContent>
            {initialLoading ? (
              <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading {entityLabel}s…
              </div>
            ) : orders.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-sm text-muted-foreground">No {entityLabel}s yet.</p>
                {isSender && (
                  <Link
                    href="/orders"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Package className="h-4 w-4" />
                    View shipments on Orders
                  </Link>
                )}
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {orders.map((order) => {
                  const isSelected = selectedOrderId === order.id;
                  const counterparty = isSender
                    ? order.receiver_name
                    : isDriver
                      ? `${order.sender_name} → ${order.receiver_name}`
                      : order.sender_name;
                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setSelectedOrderId(order.id)}
                      className={cn(
                        "rounded-xl border p-4 text-left transition-colors",
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{shipmentRef(order.id)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {isSender ? "To" : isDriver ? "Route" : "From"}: {counterparty}
                          </p>
                        </div>
                        <OrderStatusBadges order={order} compact />
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p className="flex items-start gap-1.5">
                          <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                          <span className="line-clamp-1">{order.sender_address || "—"}</span>
                        </p>
                        <p className="flex items-start gap-1.5">
                          <MapPin className="h-3 w-3 shrink-0 mt-0.5 text-primary" />
                          <span className="line-clamp-1">{order.destination_address || "—"}</span>
                        </p>
                      </div>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        {formatDate(order.created_at)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {selectedOrder ? (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Package · {shipmentRef(selectedOrder.id)}
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
            {selectedOrder && isAwaitingConnect(selectedOrder) ? (
              <Card>
                <CardContent className="py-8 text-center space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Payment:{" "}
                    <span className="font-medium text-foreground">
                      {paymentMethodLabel(selectedOrder.payment_method)}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isSender
                      ? "Confirm this shipment request to build routes, or reject if you cannot fulfill it."
                      : "Waiting for the sender to confirm this shipment before routes are available."}
                  </p>
                  {isSender && (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button
                        onClick={() => void handleConnect(selectedOrder)}
                        disabled={connecting === selectedOrder.id || rejecting === selectedOrder.id}
                      >
                        {connecting === selectedOrder.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Connecting…
                          </>
                        ) : (
                          "Confirm shipment"
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void handleReject(selectedOrder)}
                        disabled={connecting === selectedOrder.id || rejecting === selectedOrder.id}
                      >
                        {rejecting === selectedOrder.id ? "Rejecting…" : "Reject"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : selectedOrder && isRejected(selectedOrder) ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  This shipment request was rejected by the sender.
                </CardContent>
              </Card>
            ) : (
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
          </div>
        ) : !initialLoading && orders.length > 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Select {entity.indefiniteArticle} {entityLabel} above to view route cost comparison.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
