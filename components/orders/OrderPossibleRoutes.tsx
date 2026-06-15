"use client";

import { useCallback, useEffect, useState } from "react";
import { previewZoneConnectionsByCoordinates } from "@/lib/api";
import type { Order, OrderDraftPreview } from "@/types";
import { OrderDraftZonePreview } from "@/components/orders/OrderDraftZonePreview";

interface Props {
  order: Order;
  onMessage?: (text: string, type?: "success" | "error") => void;
}

/**
 * Possible routes for an existing order. Recomputed live against the current
 * zone graph (so it never shows stale paths), and rendered with the same
 * trace-on-click preview used when creating an order: clicking a route in the
 * list draws only that path on the map. Incomplete routes that can't reach the
 * destination are shown as a gap, not a fake complete route.
 */
export function OrderPossibleRoutes({ order, onMessage }: Props) {
  const [preview, setPreview] = useState<OrderDraftPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasCoords =
    order.sender_lat != null &&
    order.sender_lng != null &&
    order.destination_lat != null &&
    order.destination_lng != null;

  const load = useCallback(async () => {
    if (!hasCoords) {
      setPreview(null);
      setError("This order has no pickup/destination coordinates to compute routes.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await previewZoneConnectionsByCoordinates({
        source_lat: order.sender_lat as number,
        source_lng: order.sender_lng as number,
        destination_lat: order.destination_lat as number,
        destination_lng: order.destination_lng as number,
        source_name: order.source_name || order.sender_name,
        source_address: order.sender_address,
        destination_name: order.receiver_name,
        destination_address: order.destination_address,
      });
      setPreview(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load possible routes";
      setError(msg);
      onMessage?.(msg, "error");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [
    hasCoords,
    order.sender_lat,
    order.sender_lng,
    order.destination_lat,
    order.destination_lng,
    order.source_name,
    order.sender_name,
    order.sender_address,
    order.receiver_name,
    order.destination_address,
    onMessage,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  return <OrderDraftZonePreview preview={preview} loading={loading} error={error} />;
}
