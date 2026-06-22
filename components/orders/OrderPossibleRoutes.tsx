"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { previewZoneConnectionsByCoordinates } from "@/lib/api";
import type { Order, OrderDraftPreview } from "@/types";
import { OrderDraftZonePreview } from "@/components/orders/OrderDraftZonePreview";

interface Props {
  order: Order;
  /** Bump to silently reload route preview (e.g. after package edit). */
  refreshSignal?: number;
  onMessage?: (text: string, type?: "success" | "error") => void;
}

/**
 * Possible routes for an existing order. Recomputed live against the current
 * zone graph (so it never shows stale paths), and rendered with the same
 * trace-on-click preview used when creating an order: clicking a route in the
 * list draws only that path on the map. Incomplete routes that can't reach the
 * destination are shown as a gap, not a fake complete route.
 */
export function OrderPossibleRoutes({ order, refreshSignal = 0, onMessage }: Props) {
  const [preview, setPreview] = useState<OrderDraftPreview | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPreviewRef = useRef(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const hasCoords =
    order.sender_lat != null &&
    order.sender_lng != null &&
    order.destination_lat != null &&
    order.destination_lng != null;

  const load = useCallback(
    async (silent = false) => {
      if (!hasCoords) {
        setPreview(null);
        setError("This order has no pickup/destination coordinates to compute routes.");
        hasPreviewRef.current = false;
        setInitialLoading(false);
        return;
      }

      if (!silent && !hasPreviewRef.current) {
        setInitialLoading(true);
      } else if (silent && hasPreviewRef.current) {
        setRefreshing(true);
      }
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
        hasPreviewRef.current = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load possible routes";
        if (!hasPreviewRef.current) {
          setError(msg);
          onMessageRef.current?.(msg, "error");
          setPreview(null);
        }
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [
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
    ]
  );

  useEffect(() => {
    hasPreviewRef.current = false;
    void load(false);
  }, [order.id, load]);

  useEffect(() => {
    if (refreshSignal === 0 || !hasPreviewRef.current) return;
    void load(true);
  }, [refreshSignal, order.id, load]);

  return (
    <OrderDraftZonePreview
      preview={preview}
      loading={initialLoading}
      refreshing={refreshing}
      error={error}
    />
  );
}
