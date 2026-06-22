"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, MapPin, Package, Route as RouteIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadges } from "@/components/orders/OrderStatusBadges";
import { listOrders } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import type { Order } from "@/types";
import { RouteCostComparison } from "@/components/orders/RouteCostComparison";
import { OrderPackageEditor } from "@/components/orders/OrderPackageEditor";

export function RoutesPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const isSender = user?.role === "sender" || user?.role === "admin";
  const isDriver = user?.role === "driver";

  const [orders, setOrders] = useState<Order[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const hasOrdersRef = useRef(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [costRefreshKey, setCostRefreshKey] = useState(0);
  const [banner, setBanner] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent && !hasOrdersRef.current) {
      setInitialLoading(true);
    }
    try {
      const data = await listOrders();
      setOrders(data);
      hasOrdersRef.current = data.length > 0;
    } catch (err) {
      setBanner({
        text: err instanceof Error ? err.message : "Failed to load orders",
        type: "error",
      });
    } finally {
      setInitialLoading(false);
    }
  }, []);

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
    setBanner({ text, type });
    setTimeout(() => setBanner(null), 4000);
  }, []);

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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RouteIcon className="h-4 w-4" />
              Select an order
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {isDriver
                ? "Pick an order to view routes and enter quotes for your segments."
                : "Pick an order to compare possible delivery routes by estimated cost. Routes are generated from connected transporter zones between pickup and destination."}
            </p>
          </CardHeader>
          <CardContent>
            {initialLoading ? (
              <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading orders…
              </div>
            ) : orders.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-sm text-muted-foreground">No orders yet.</p>
                {isSender && (
                  <Link
                    href="/orders"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Package className="h-4 w-4" />
                    Create an order first
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
                          <p className="font-medium">Order #{order.id}</p>
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
                <CardTitle className="text-base">Package · Order #{selectedOrder.id}</CardTitle>
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
            <RouteCostComparison
              orderId={selectedOrder.id}
              refreshSignal={costRefreshKey}
              onMessage={showMessage}
            />
          </div>
        ) : !initialLoading && orders.length > 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Select an order above to view route cost comparison.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
