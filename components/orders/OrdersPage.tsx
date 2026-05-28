"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, MapPin, Package, Send, Truck, X } from "lucide-react";
import { latLngToCell } from "h3-js";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listDriverZones, listOrders, updateOrderStatus } from "@/lib/api";
import { MAP_EMPTY_CELLS } from "@/lib/mapConstants";
import { cn, formatDate } from "@/lib/utils";
import type { ConvertH3Response, DriverZone, Order } from "@/types";
import { NewOrderForm } from "./NewOrderForm";

const H3MapView = dynamic(() => import("@/components/map/H3MapView").then((m) => m.H3MapView), {
  ssr: false,
  loading: () => (
    <div className="h-[320px] rounded-xl bg-muted animate-pulse flex items-center justify-center text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});



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
  const [zones, setZones] = useState<DriverZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);

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

  useEffect(() => {
    listDriverZones()
      .then(setZones)
      .catch(() => setZones([]))
      .finally(() => setZonesLoading(false));
  }, []);

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

  /**
   * Build a `ConvertH3Response` from an order's coordinates so the existing
   * H3MapView can draw the pickup + destination markers and the connecting
   * line without a backend round-trip.
   */
  const selectedTrip: ConvertH3Response | null = useMemo(() => {
    if (!selectedOrder) return null;
    const { sender_lat, sender_lng, destination_lat, destination_lng } = selectedOrder;
    if (
      sender_lat == null ||
      sender_lng == null ||
      destination_lat == null ||
      destination_lng == null
    ) {
      return null;
    }
    const resolution = 8;
    return {
      pickup_h3: latLngToCell(sender_lat, sender_lng, resolution),
      dropoff_h3: latLngToCell(destination_lat, destination_lng, resolution),
      resolution,
      cell_type: "Hexagon",
      pickup_center: { lat: sender_lat, lng: sender_lng },
      dropoff_center: { lat: destination_lat, lng: destination_lng },
    };
  }, [selectedOrder]);

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
          <OrderRouteCard
            order={selectedOrder}
            trip={selectedTrip}
            zones={zones}
            zonesLoading={zonesLoading}
            onClose={() => setSelectedOrderId(null)}
          />
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

interface OrderRouteCardProps {
  order: Order;
  trip: ConvertH3Response | null;
  zones: DriverZone[];
  zonesLoading: boolean;
  onClose: () => void;
}

function OrderRouteCard({ order, trip, zones, zonesLoading, onClose }: OrderRouteCardProps) {
  const availableCount = zones.filter((z) => z.available).length;
  const mapResolution = trip?.resolution ?? zones[0]?.resolution ?? 8;
  const showMap = trip != null || zones.length > 0;
  const Icon = STATUS_ICON[order.status];
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Order #{order.id} route
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {order.sender_name} → {order.receiver_name}
            {!zonesLoading && zones.length > 0 && (
              <span className="ml-1">
                · {zones.length} driver zone{zones.length === 1 ? "" : "s"} (
                {availableCount} available)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[order.status]}`}
          >
            <Icon className="h-3 w-3" />
            {order.status}
          </span>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close map">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-border p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              Pickup
            </div>
            <p className="font-medium break-words">{order.sender_address || "—"}</p>
            {order.sender_lat != null && order.sender_lng != null ? (
              <p className="mt-1 text-xs text-muted-foreground font-mono">
                {order.sender_lat.toFixed(5)}, {order.sender_lng.toFixed(5)}
              </p>
            ) : (
              <p className="mt-1 text-xs text-amber-600">No coordinates on file</p>
            )}
          </div>
          <div className="rounded-xl border border-border p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
              Destination
            </div>
            <p className="font-medium break-words">{order.destination_address || "—"}</p>
            {order.destination_lat != null && order.destination_lng != null ? (
              <p className="mt-1 text-xs text-muted-foreground font-mono">
                {order.destination_lat.toFixed(5)}, {order.destination_lng.toFixed(5)}
              </p>
            ) : (
              <p className="mt-1 text-xs text-amber-600">No coordinates on file</p>
            )}
          </div>
        </div>

        {showMap ? (
          <>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                Pickup
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                Destination
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-5 rounded bg-blue-500/30 border border-blue-500" />
                Available zone
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-5 rounded bg-blue-500/10 border border-dashed border-blue-500/60" />
                Unavailable zone
              </span>
            </div>
            <div className="h-[420px] rounded-xl overflow-hidden border border-border">
              <H3MapView
                height="100%"
                resolution={mapResolution}
                selectedCells={MAP_EMPTY_CELLS}
                savedZones={zones}
                conversion={trip}
                interactive
              />
            </div>
            {!trip && (
              <p className="text-xs text-amber-600">
                Pickup or destination coordinates are missing for this order; driver zones are still
                shown on the map.
              </p>
            )}
          </>
        ) : zonesLoading ? (
          <div className="h-[320px] rounded-xl bg-muted animate-pulse flex items-center justify-center text-sm text-muted-foreground">
            Loading map…
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            This order has no coordinates and there are no driver zones to display.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
