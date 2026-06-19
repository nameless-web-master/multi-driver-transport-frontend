import { apiRequest, invalidateCache } from "./http";
import type {
  BuildOrderGraphOptions,
  BuildOrderGraphResponse,
  DriverZoneGraph,
  GraphComponent,
  GraphComponentDetail,
  GraphNode,
  GraphNodeDegree,
  GraphSummary,
  OrderDraftPreview,
  OrderGraph,
  OrderGraphSummary,
  RebuildGraphOptions,
  RebuildGraphResponse,
  RecalculateConnectionsResponse,
  ZoneConnection,
  ZoneConnectionFilters,
  ZoneNeighborhood,
} from "@/types";

/**
 * Short TTLs are intentional: long enough to make page navigation instant when
 * the same endpoint is re-requested, short enough that stale data doesn't
 * linger. Mutations clear the cache via `invalidateCache` automatically.
 */
const TTL_LIST = 15_000;
const TTL_DASHBOARD = 10_000;
const TTL_STATIC_LISTS = 30_000;
import type {
  ConvertH3Request,
  ConvertH3Response,
  CreateDriverZoneRequest,
  CreateOrderRequest,
  DriverSummary,
  DriverZone,
  Order,
  OrderStatus,
  ReceiverSummary,
  UpdateDriverZoneRequest,
} from "@/types";
import type { DashboardStats } from "@/types/auth";

export function convertLocations(payload: ConvertH3Request): Promise<ConvertH3Response> {
  return apiRequest<ConvertH3Response>("/api/h3/convert", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listDriverZones(
  ownerUserId?: number,
  options?: { activeOnly?: boolean }
): Promise<DriverZone[]> {
  const params = new URLSearchParams();
  if (ownerUserId) params.set("owner_user_id", String(ownerUserId));
  if (options?.activeOnly) params.set("active", "true");
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<DriverZone[]>(`/api/driver-zones${qs}`, {
    cacheOptions: { ttlMs: TTL_LIST },
  });
}

export function getDriverZone(id: number): Promise<DriverZone> {
  return apiRequest<DriverZone>(`/api/driver-zones/${id}`, {
    cacheOptions: { ttlMs: TTL_LIST },
  });
}

export function createDriverZone(payload: CreateDriverZoneRequest): Promise<DriverZone> {
  return apiRequest<DriverZone>("/api/driver-zones", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateDriverZone(
  id: number,
  payload: UpdateDriverZoneRequest
): Promise<DriverZone> {
  return apiRequest<DriverZone>(`/api/driver-zones/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteDriverZone(id: number): Promise<void> {
  return apiRequest<void>(`/api/driver-zones/${id}`, { method: "DELETE" });
}

export function polygonToCells(payload: {
  boundary: { lat: number; lng: number }[];
  resolution: number;
}): Promise<{ h3_cells: string[]; cell_count: number; resolution: number }> {
  return apiRequest("/api/h3/polygon-to-cells", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getDashboardStats(): Promise<DashboardStats> {
  return apiRequest<DashboardStats>("/api/dashboard/stats", {
    cacheOptions: { ttlMs: TTL_DASHBOARD },
  });
}

export function listOrders(): Promise<Order[]> {
  return apiRequest<Order[]>("/api/orders", {
    cacheOptions: { ttlMs: TTL_LIST },
  });
}

export function createOrder(payload: CreateOrderRequest): Promise<Order> {
  return apiRequest<Order>("/api/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateOrderStatus(id: number, status: Exclude<OrderStatus, "submitted">): Promise<Order> {
  return apiRequest<Order>(`/api/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function listReceivers(): Promise<ReceiverSummary[]> {
  return apiRequest<ReceiverSummary[]>("/api/users/receivers", {
    cacheOptions: { ttlMs: TTL_STATIC_LISTS },
  });
}

export function listDrivers(): Promise<DriverSummary[]> {
  return apiRequest<DriverSummary[]>("/api/users/drivers", {
    cacheOptions: { ttlMs: TTL_STATIC_LISTS },
  });
}

export function followDriver(driverId: number): Promise<{ followed: boolean; trustworthiness: number }> {
  return apiRequest(`/api/users/drivers/${driverId}/follow`, { method: "POST" });
}

export function unfollowDriver(driverId: number): Promise<{ followed: boolean; trustworthiness: number }> {
  return apiRequest(`/api/users/drivers/${driverId}/follow`, { method: "DELETE" });
}

export function setTransporterZonesAvailability(
  driverId: number,
  available: boolean
): Promise<{ updated_count: number }> {
  return apiRequest(`/api/users/drivers/${driverId}/zones-availability`, {
    method: "PATCH",
    body: JSON.stringify({ available }),
  });
}

/** Re-exported so pages can manually bust the cache after a side effect. */
export { invalidateCache };

// --------------------------------------------------------------------------
// Milestone 2 — Zone connections
// --------------------------------------------------------------------------

function buildZoneConnectionQuery(filters?: ZoneConnectionFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  if (filters.connection_type) params.set("connection_type", filters.connection_type);
  if (filters.transport_id) params.set("transport_id", String(filters.transport_id));
  if (filters.zone_id) params.set("zone_id", String(filters.zone_id));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function listZoneConnections(
  filters?: ZoneConnectionFilters
): Promise<ZoneConnection[]> {
  const qs = buildZoneConnectionQuery(filters);
  return apiRequest<ZoneConnection[]>(`/api/zone-connections${qs}`, {
    cacheOptions: { ttlMs: TTL_LIST },
  });
}

export function getZoneConnection(id: number): Promise<ZoneConnection> {
  return apiRequest<ZoneConnection>(`/api/zone-connections/${id}`, {
    cacheOptions: { ttlMs: TTL_LIST },
  });
}

export function listConnectionsForZone(zoneId: number): Promise<ZoneConnection[]> {
  return apiRequest<ZoneConnection[]>(`/api/zones/${zoneId}/connections`, {
    cacheOptions: { ttlMs: TTL_LIST },
  });
}

export function recalculateZoneConnections(): Promise<RecalculateConnectionsResponse> {
  return apiRequest<RecalculateConnectionsResponse>("/api/zone-connections/recalculate", {
    method: "POST",
  });
}

export function detectConnectionsForZone(
  zoneId: number
): Promise<RecalculateConnectionsResponse & { zone_id: number }> {
  return apiRequest(`/api/zones/${zoneId}/detect-connections`, { method: "POST" });
}

export function deactivateZoneConnection(id: number): Promise<void> {
  return apiRequest<void>(`/api/zone-connections/${id}`, { method: "DELETE" });
}

// --------------------------------------------------------------------------
// Milestone 2 — Order draft preview (pre-submit)
// --------------------------------------------------------------------------

export interface DraftZonePreviewRequest {
  source_lat: number;
  source_lng: number;
  destination_lat: number;
  destination_lng: number;
  source_name?: string;
  source_address?: string;
  destination_name?: string;
  destination_address?: string;
  max_depth?: number;
}

/**
 * Preview the zone-connection network for a draft order (pickup -> drop-off)
 * before it is actually submitted. Available to senders, receivers, and admins.
 */
export function previewZoneConnectionsByCoordinates(
  payload: DraftZonePreviewRequest
): Promise<OrderDraftPreview> {
  return apiRequest<OrderDraftPreview>("/api/orders/zone-connection-preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --------------------------------------------------------------------------
// Milestone 3 — Driver-Zone Graph
// --------------------------------------------------------------------------

const GRAPH_TTL = 10_000;

export function getDriverZoneGraph(): Promise<DriverZoneGraph> {
  return apiRequest<DriverZoneGraph>("/api/driver-zone-graph", {
    cacheOptions: { ttlMs: GRAPH_TTL },
  });
}

export function rebuildDriverZoneGraph(
  options: RebuildGraphOptions = {}
): Promise<RebuildGraphResponse> {
  return apiRequest<RebuildGraphResponse>("/api/driver-zone-graph/rebuild", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export function getDriverZoneGraphSummary(): Promise<GraphSummary> {
  return apiRequest<GraphSummary>("/api/driver-zone-graph/summary", {
    cacheOptions: { ttlMs: GRAPH_TTL },
  });
}

export function listGraphComponents(): Promise<GraphComponent[]> {
  return apiRequest<GraphComponent[]>("/api/driver-zone-graph/components", {
    cacheOptions: { ttlMs: GRAPH_TTL },
  });
}

export function getGraphComponent(componentId: string): Promise<GraphComponentDetail> {
  return apiRequest<GraphComponentDetail>(
    `/api/driver-zone-graph/components/${encodeURIComponent(componentId)}`,
    { cacheOptions: { ttlMs: GRAPH_TTL } }
  );
}

export function listIsolatedGraphZones(): Promise<GraphNode[]> {
  return apiRequest<GraphNode[]>("/api/driver-zone-graph/isolated-zones", {
    cacheOptions: { ttlMs: GRAPH_TTL },
  });
}

export function getZoneNeighborhood(zoneId: number): Promise<ZoneNeighborhood> {
  return apiRequest<ZoneNeighborhood>(
    `/api/driver-zone-graph/zones/${zoneId}/neighborhood`,
    { cacheOptions: { ttlMs: GRAPH_TTL } }
  );
}

export function getZoneNodeDegree(zoneId: number): Promise<GraphNodeDegree> {
  return apiRequest<GraphNodeDegree>(
    `/api/driver-zone-graph/zones/${zoneId}/degree`,
    { cacheOptions: { ttlMs: GRAPH_TTL } }
  );
}

// --------------------------------------------------------------------------
// Milestone 3 — Order-based transporter graph (sender → receiver)
// --------------------------------------------------------------------------

export function getOrderGraph(orderId: number): Promise<OrderGraph> {
  return apiRequest<OrderGraph>(`/api/order-graph/${orderId}`, {
    cacheOptions: { ttlMs: GRAPH_TTL },
  });
}

export function buildOrderGraph(
  orderId: number,
  options: BuildOrderGraphOptions = {}
): Promise<BuildOrderGraphResponse> {
  return apiRequest<BuildOrderGraphResponse>(`/api/order-graph/${orderId}/build`, {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export function getOrderGraphSummary(orderId: number): Promise<OrderGraphSummary> {
  return apiRequest<OrderGraphSummary>(`/api/order-graph/${orderId}/summary`, {
    cacheOptions: { ttlMs: GRAPH_TTL },
  });
}

// --------------------------------------------------------------------------
// Milestone 5 — route cost
// --------------------------------------------------------------------------

export function getOrderRouteCostComparison(
  orderId: number
): Promise<import("@/types").OrderRouteCostComparison> {
  // No client cache: the backend recomputes routes against the current zone
  // graph on each call, so we always want the freshest comparison here.
  return apiRequest(`/api/orders/${orderId}/route-cost-comparison`);
}

export function recalculateOrderCosts(
  orderId: number
): Promise<import("@/types").OrderRouteCostComparison> {
  return apiRequest(`/api/orders/${orderId}/recalculate-costs`, { method: "POST" });
}

export function applyManualSegmentCost(
  segmentCostId: number,
  manualCost: number
): Promise<import("@/types").RouteSegmentCost> {
  return apiRequest(`/api/route-segment-costs/${segmentCostId}/manual-cost`, {
    method: "POST",
    body: JSON.stringify({ manual_cost: manualCost }),
  });
}

export function applyExternalSegmentCost(
  segmentCostId: number,
  quotedCost: number
): Promise<import("@/types").RouteSegmentCost> {
  return apiRequest(`/api/route-segment-costs/${segmentCostId}/external-cost`, {
    method: "POST",
    body: JSON.stringify({ manual_cost: quotedCost }),
  });
}

export function fetchExternalSegmentQuote(
  segmentCostId: number
): Promise<import("@/types").RouteSegmentCost> {
  return apiRequest(`/api/route-segment-costs/${segmentCostId}/fetch-external-quote`, {
    method: "POST",
  });
}

export function requestSegmentQuote(
  segmentCostId: number
): Promise<import("@/types").RouteSegmentCost> {
  return apiRequest(`/api/route-segment-costs/${segmentCostId}/request-quote`, {
    method: "POST",
  });
}

export function getTransporterQuoteQueue(): Promise<import("@/types").TransporterQuoteRequest[]> {
  return apiRequest("/api/route-segment-costs/transporter-queue");
}

export function updateOrderPackage(
  orderId: number,
  body: import("@/types").UpdateOrderPackageRequest
): Promise<import("@/types").UpdateOrderPackageResponse> {
  return apiRequest(`/api/orders/${orderId}/package`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function getPricingConfig(): Promise<import("@/types").PricingConfig> {
  return apiRequest("/api/pricing/config");
}

export function updatePricingConfig(
  body: import("@/types").UpdatePricingConfigRequest
): Promise<import("@/types").PricingConfig> {
  return apiRequest("/api/pricing/config", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function listPricingRegions(): Promise<import("@/types").PricingRegion[]> {
  return apiRequest("/api/pricing/regions");
}

export function createPricingRegion(
  body: import("@/types").CreatePricingRegionRequest
): Promise<import("@/types").PricingRegion> {
  return apiRequest("/api/pricing/regions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updatePricingRegion(
  id: number,
  body: import("@/types").UpdatePricingRegionRequest
): Promise<import("@/types").PricingRegion> {
  return apiRequest(`/api/pricing/regions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deletePricingRegion(id: number): Promise<void> {
  return apiRequest(`/api/pricing/regions/${id}`, { method: "DELETE" });
}
