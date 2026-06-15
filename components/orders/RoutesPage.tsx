"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Package,
  Route as RouteIcon,
  Truck,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listOrders } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import type { Order } from "@/types";
import { RouteCostComparison } from "@/components/orders/RouteCostComparison";

const STATUS_BADGE: Record<Order["status"], string> = {
  submitted:
    "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20",
  delivering:
    "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20",
  received:
    "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20",
};

const STATUS_ICON = {
  submitted: Clock,
  delivering: Truck,
  received: CheckCircle2,
};

export function RoutesPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const isSender = user?.role === "sender" || user?.role === "admin";

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listOrders();
      setOrders(data);
    } catch (err) {
      setBanner({
        text: err instanceof Error ? err.message : "Failed to load orders",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
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

  function showMessage(text: string, type: "success" | "error" = "success") {
    setBanner({ text, type });
    setTimeout(() => setBanner(null), 4000);
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RouteIcon className="h-4 w-4" />
              Select an order
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Pick an order to compare possible delivery routes by estimated cost. Routes are
              generated from connected transporter zones between pickup and destination.
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
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
                  const Icon = STATUS_ICON[order.status];
                  const isSelected = selectedOrderId === order.id;
                  const counterparty = isSender ? order.receiver_name : order.sender_name;
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
                            {isSender ? "To" : "From"}: {counterparty}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                            STATUS_BADGE[order.status]
                          )}
                        >
                          <Icon className="h-3 w-3" />
                          {order.status}
                        </span>
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
          <RouteCostComparison orderId={selectedOrder.id} onMessage={showMessage} />
        ) : !loading && orders.length > 0 ? (
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
