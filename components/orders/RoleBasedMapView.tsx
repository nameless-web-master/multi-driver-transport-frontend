"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { H3MapView } from "@/components/map/H3MapViewDynamic";
import type { H3MapHandoffMarker } from "@/components/map/H3MapView";
import { MAP_EMPTY_CELLS } from "@/lib/mapConstants";
import { previewZoneConnectionsByCoordinates } from "@/lib/api";
import { summaryToDriverZone } from "@/lib/orderDraftZoneMap";
import { buildRouteHandoffs } from "@/lib/orderRouteChain";
import { Button } from "@/components/ui/button";
import { DeliveryProgressTimeline } from "@/components/orders/SegmentTimeline";
import type {
  Order,
  OrderDraftConnection,
  OrderDraftPreview,
  OrderDraftZoneSummary,
  RouteConfirmationStatus,
  TrackingStatus,
} from "@/types";

interface RoleBasedMapViewProps {
  order: Order;
  confirmation: RouteConfirmationStatus | null;
  trackingStatus?: TrackingStatus;
  pickupReadyAt?: string | null;
  routeConfirmed?: boolean;
  role: "sender" | "receiver" | "driver" | "admin";
}

function buildZonesById(preview: OrderDraftPreview): Map<number, OrderDraftZoneSummary> {
  const m = new Map<number, OrderDraftZoneSummary>();
  for (const z of preview.connected_zones ?? []) m.set(z.zone_id, z);
  for (const z of preview.pickup_zones ?? []) m.set(z.zone_id, z);
  for (const z of preview.destination_zones ?? []) m.set(z.zone_id, z);
  return m;
}

function buildConnectionsById(preview: OrderDraftPreview): Map<number, OrderDraftConnection> {
  const m = new Map<number, OrderDraftConnection>();
  for (const c of preview.connections ?? []) m.set(c.id, c);
  return m;
}

export function RoleBasedMapView({
  order,
  confirmation,
  trackingStatus = "CONFIRMED",
  pickupReadyAt = null,
  routeConfirmed = false,
  role,
}: RoleBasedMapViewProps) {
  const [preview, setPreview] = useState<OrderDraftPreview | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasPreviewRef = useRef(false);

  const loadPreview = useCallback(
    async (silent = false) => {
      if (
        order.sender_lat == null ||
        order.sender_lng == null ||
        order.destination_lat == null ||
        order.destination_lng == null
      ) {
        setPreview(null);
        hasPreviewRef.current = false;
        setInitialLoading(false);
        return;
      }

      if (!silent && !hasPreviewRef.current) {
        setInitialLoading(true);
      } else if (silent && hasPreviewRef.current) {
        setRefreshing(true);
      }

      try {
        const data = await previewZoneConnectionsByCoordinates({
          source_lat: order.sender_lat,
          source_lng: order.sender_lng,
          destination_lat: order.destination_lat,
          destination_lng: order.destination_lng,
          source_address: order.sender_address,
          destination_address: order.destination_address,
        });
        setPreview(data);
        hasPreviewRef.current = true;
      } catch {
        if (!hasPreviewRef.current) setPreview(null);
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [order.id, order.sender_lat, order.sender_lng, order.destination_lat, order.destination_lng, order.sender_address, order.destination_address]
  );

  useEffect(() => {
    hasPreviewRef.current = false;
    void loadPreview(false);
  }, [loadPreview]);

  const zonesById = useMemo(
    () => (preview ? buildZonesById(preview) : new Map()),
    [preview]
  );
  const connectionsById = useMemo(
    () => (preview ? buildConnectionsById(preview) : new Map()),
    [preview]
  );

  const selectedChain = useMemo(() => {
    if (!preview?.possible_connection_chains?.length) return null;
    if (!confirmation) return preview.possible_connection_chains[0];
    return (
      preview.possible_connection_chains.find(
        (c) => c.zone_ids.length === confirmation.segments.length
      ) ?? preview.possible_connection_chains[0]
    );
  }, [preview, confirmation]);

  const savedZones = useMemo(() => {
    if (!selectedChain) return [];
    return selectedChain.zone_ids
      .map((id) => zonesById.get(id))
      .filter(Boolean)
      .map((z) => summaryToDriverZone(z!));
  }, [selectedChain, zonesById]);

  const handoffMarkers: H3MapHandoffMarker[] = useMemo(() => {
    if (!selectedChain) return [];
    const steps = buildRouteHandoffs(selectedChain, connectionsById, zonesById, new Map());
    return steps.map((s) => s.marker);
  }, [selectedChain, connectionsById, zonesById]);

  const routeSegments = useMemo(() => {
    if (!order.sender_lat || !order.sender_lng || !order.destination_lat || !order.destination_lng) {
      return null;
    }
    const points: { lat: number; lng: number }[] = [
      { lat: order.sender_lat, lng: order.sender_lng },
    ];
    for (const m of handoffMarkers) {
      points.push({ lat: m.lat, lng: m.lng });
    }
    points.push({ lat: order.destination_lat, lng: order.destination_lng });
    return [points];
  }, [order.sender_lat, order.sender_lng, order.destination_lat, order.destination_lng, handoffMarkers]);

  const roleLabel =
    role === "sender"
      ? "Sender view — full route path"
      : role === "receiver"
        ? "Receiver view — incoming delivery path"
        : "Transporter view — assigned route segments";

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading map…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{roleLabel}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void loadPreview(true)}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
          )}
          Refresh map
        </Button>
      </div>

      {confirmation && (
        <DeliveryProgressTimeline
          segments={confirmation.segments}
          trackingStatus={trackingStatus}
          pickupReadyAt={pickupReadyAt}
          routeConfirmed={routeConfirmed}
        />
      )}

      <H3MapView
        resolution={15}
        selectedCells={MAP_EMPTY_CELLS}
        interactive={false}
        savedZones={savedZones}
        routeSegments={routeSegments}
        handoffMarkers={handoffMarkers}
        endpointLabels={{
          senderAddress: order.sender_address || "Sender",
          receiverAddress: order.destination_address || "Receiver",
        }}
        fitFocus="endpoints"
        height={360}
      />

      {confirmation && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {confirmation.segments.map((seg) => (
            <div
              key={seg.segment_id}
              className="rounded-lg border border-border px-3 py-2 text-xs"
              title={`${seg.transporter_name} · ${seg.status}`}
            >
              <p className="font-medium capitalize">
                {seg.leg_status !== "not_started" ? seg.leg_status.replace("_", " ") : seg.status}
              </p>
              <p className="text-muted-foreground">
                {seg.from_label} → {seg.to_label}
              </p>
              <p>{seg.transporter_name}</p>
              {seg.final_cost != null && (
                <p className="text-muted-foreground mt-1">
                  Cost: {seg.final_cost.toFixed(2)} {seg.currency}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
