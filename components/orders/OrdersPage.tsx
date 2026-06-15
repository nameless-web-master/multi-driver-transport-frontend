"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Package, Send, Truck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listOrders, updateOrderStatus } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import type { Order } from "@/types";
import { NewOrderForm } from "./NewOrderForm";
import { OrderPossibleRoutes } from "@/components/orders/OrderPossibleRoutes";

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

export function OrdersPage() {
  const { user } = useAuth();
  const isSender = user?.role === "sender" || user?.role === "admin";
  const isReceiver = user?.role === "receiver" || user?.role === "admin";

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listOrders();
      setOrders(data);
    } catch (err) {
      setBanner({ text: err instanceof Error ? err.message : "Failed to load orders", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function showMessage(text: string, type: "success" | "error" = "success") {
    setBanner({ text, type });
    setTimeout(() => setBanner(null), 4000);
  }

  async function handleStatus(order: Order, next: "delivering" | "received") {
    setUpdating(order.id);
    try {
      const updated = await updateOrderStatus(order.id, next);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      showMessage(`Order marked as ${next}.`);
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Update failed", "error");
    } finally {
      setUpdating(null);
    }
  }

  const counts = useMemo(() => {
    const c = { submitted: 0, delivering: 0, received: 0 };
    orders.forEach((o) => (c[o.status] += 1));
    return c;
  }, [orders]);

  const selectedOrder = useMemo(
    () => (selectedOrderId == null ? null : orders.find((o) => o.id === selectedOrderId) ?? null),
    [selectedOrderId, orders]
  );

  function handleRowClick(order: Order) {
    setSelectedOrderId((prev) => (prev === order.id ? null : order.id));
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
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatTile icon={<Clock className="h-5 w-5" />} label="Submitted" value={counts.submitted} />
          <StatTile icon={<Truck className="h-5 w-5" />} label="Delivering" value={counts.delivering} />
          <StatTile icon={<CheckCircle2 className="h-5 w-5" />} label="Received" value={counts.received} />
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
              Click any row to view the route on a map.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : orders.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No orders yet.</div>
            ) : (
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-3 pr-4 font-medium">#</th>
                    <th className="py-3 pr-4 font-medium">{isSender ? "Receiver" : "Sender"}</th>
                    <th className="py-3 pr-4 font-medium">Phone</th>
                    <th className="py-3 pr-4 font-medium">From</th>
                    <th className="py-3 pr-4 font-medium">To</th>
                    <th className="py-3 pr-4 font-medium">Status</th>
                    <th className="py-3 pr-4 font-medium">Submitted</th>
                    <th className="py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const Icon = STATUS_ICON[order.status];
                    const counterparty = isSender ? order.receiver_name : order.sender_name;
                    const counterpartyPhone = isSender ? order.receiver_phone : order.sender_phone;
                    const isSelected = selectedOrderId === order.id;
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
                        <td className="py-3 pr-4 max-w-[180px] truncate" title={order.sender_address}>
                          {order.sender_address || "—"}
                        </td>
                        <td className="py-3 pr-4 max-w-[180px] truncate" title={order.destination_address}>
                          {order.destination_address || "—"}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[order.status]}`}
                          >
                            <Icon className="h-3 w-3" />
                            {order.status}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">{formatDate(order.submitted_at)}</td>
                        <td
                          className="py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isSender && order.status === "submitted" && (
                            <Button
                              size="sm"
                              disabled={updating === order.id}
                              onClick={() => handleStatus(order, "delivering")}
                            >
                              {updating === order.id ? "Updating…" : "Mark delivering"}
                            </Button>
                          )}
                          {isReceiver && order.status === "delivering" && order.receiver_user_id === user?.id && (
                            <Button
                              size="sm"
                              disabled={updating === order.id}
                              onClick={() => handleStatus(order, "received")}
                            >
                              {updating === order.id ? "Updating…" : "Mark received"}
                            </Button>
                          )}
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
          <OrderPossibleRoutes order={selectedOrder} onMessage={showMessage} />
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
