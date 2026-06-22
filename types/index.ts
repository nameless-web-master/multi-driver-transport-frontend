export interface ConvertH3Request {
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  resolution: number;
}

export interface ConvertH3Response {
  pickup_h3: string;
  dropoff_h3: string;
  resolution: number;
  cell_type: "Hexagon";
  pickup_center: { lat: number; lng: number };
  dropoff_center: { lat: number; lng: number };
}

export type TransportMode = "air" | "land" | "sea";

export type SchedulePattern = "daily" | "weekly" | "monthly";

/**
 * Curated ISO 4217 codes. Keep in sync with `backend/src/models/currency.model.ts`
 * — the backend regenerates its CHECK constraint from that same list on boot.
 * `Intl.NumberFormat` in `formatCurrency` already knows the symbol for every
 * ISO code, so we don't maintain a separate symbol map.
 */
export const CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "CNY",
  "AUD", "CAD", "CHF", "HKD", "SGD",
  "NZD", "KRW", "INR", "MXN", "BRL",
  "RUB", "ZAR", "TRY", "SEK", "NOK",
  "DKK", "PLN", "THB", "IDR", "MYR",
  "PHP", "VND", "AED", "SAR", "ILS",
  "EGP", "NGN", "ARS", "CLP", "COP",
  "CZK", "HUF", "RON", "UAH", "TWD",
  "PKR", "BDT", "LKR", "KES", "MAD",
  "QAR", "KWD", "BHD", "OMR",
] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface LatLngPoint {
  lat: number;
  lng: number;
}

/** A named terminal hub (airport or port) with coordinates. */
export interface HubTerminal {
  name: string;
  lat: number;
  lng: number;
}

import type { PackageType, OrderPackageEntry } from "@/lib/pricing";

export type ZonePricingMode = "system" | "manual";

export interface PricingRegion {
  id: number;
  name: string;
  base_fee: number | null;
  cost_per_km: number | null;
  cost_per_hour: number | null;
  currency: Currency;
  created_at: string;
  updated_at: string;
}

export interface CreatePricingRegionRequest {
  name: string;
  base_fee?: number | null;
  cost_per_km?: number | null;
  cost_per_hour?: number | null;
  currency?: Currency;
}

export interface UpdatePricingRegionRequest {
  name?: string;
  base_fee?: number | null;
  cost_per_km?: number | null;
  cost_per_hour?: number | null;
  currency?: Currency;
}

export interface DriverZone {
  id: number;
  owner_user_id: number;
  driver_name: string;
  zone_name: string;
  resolution: number;
  h3_cells: string[];
  cell_count: number;
  transport_mode: TransportMode;
  boundary: LatLngPoint[] | null;
  /** Departure terminal — set for air/sea routes. */
  departure_hub: HubTerminal | null;
  /** Arrival terminal — set for air/sea routes. */
  arrival_hub: HubTerminal | null;
  departure_time: string | null;
  arrival_time: string | null;
  /** @deprecated use operation_start_date */
  operation_date: string | null;
  operation_start_date: string | null;
  operation_end_date: string | null;
  schedule_pattern: SchedulePattern;
  weekday_start: number | null;
  weekday_end: number | null;
  month_day_start: number | null;
  month_day_end: number | null;
  /** Land zones — operating window start (HH:MM). */
  operating_start_time: string | null;
  /** Land zones — operating window end (HH:MM). */
  operating_end_time: string | null;
  base_fee: number | null;
  cost_per_km: number | null;
  cost_per_hour: number | null;
  cost_per_h3_cell: number | null;
  cost_per_kg: number | null;
  cost_per_volume_unit: number | null;
  time_of_day_factor: number | null;
  minimum_fee: number | null;
  currency: Currency;
  pricing_mode: ZonePricingMode;
  pricing_region_id: number | null;
  pricing_region_name?: string | null;
  region_rates?: {
    base_fee: number | null;
    cost_per_km: number | null;
    cost_per_hour: number | null;
  } | null;
  effective_base_fee?: number | null;
  effective_cost_per_km?: number | null;
  effective_cost_per_hour?: number | null;
  available: boolean;
  trust_payment_forwarder: boolean;
  driver_trustworthiness?: number;
  /** True when the zone schedule is complete and current time is within the window. */
  schedule_active?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateDriverZoneRequest {
  driver_name: string;
  zone_name: string;
  resolution: number;
  h3_cells?: string[];
  transport_mode: TransportMode;
  boundary?: LatLngPoint[] | null;
  departure_hub?: HubTerminal | null;
  arrival_hub?: HubTerminal | null;
  departure_time?: string | null;
  arrival_time?: string | null;
  operation_start_date: string;
  operation_end_date: string;
  schedule_pattern?: SchedulePattern;
  weekday_start?: number | null;
  weekday_end?: number | null;
  month_day_start?: number | null;
  month_day_end?: number | null;
  operating_start_time?: string | null;
  operating_end_time?: string | null;
  base_fee?: number | null;
  cost_per_km?: number | null;
  cost_per_hour?: number | null;
  cost_per_h3_cell?: number | null;
  cost_per_kg?: number | null;
  cost_per_volume_unit?: number | null;
  time_of_day_factor?: number | null;
  minimum_fee?: number | null;
  currency: Currency;
  pricing_mode?: ZonePricingMode;
  pricing_region_id?: number | null;
  available: boolean;
  trust_payment_forwarder: boolean;
}

export interface UpdateDriverZoneRequest {
  driver_name?: string;
  zone_name?: string;
  resolution?: number;
  h3_cells?: string[];
  transport_mode?: TransportMode;
  boundary?: LatLngPoint[] | null;
  departure_hub?: HubTerminal | null;
  arrival_hub?: HubTerminal | null;
  departure_time?: string | null;
  arrival_time?: string | null;
  operation_date?: string;
  operation_start_date?: string;
  operation_end_date?: string;
  schedule_pattern?: SchedulePattern;
  weekday_start?: number | null;
  weekday_end?: number | null;
  month_day_start?: number | null;
  month_day_end?: number | null;
  operating_start_time?: string | null;
  operating_end_time?: string | null;
  base_fee?: number | null;
  cost_per_km?: number | null;
  cost_per_hour?: number | null;
  cost_per_h3_cell?: number | null;
  cost_per_kg?: number | null;
  cost_per_volume_unit?: number | null;
  time_of_day_factor?: number | null;
  minimum_fee?: number | null;
  currency?: Currency;
  pricing_mode?: ZonePricingMode;
  pricing_region_id?: number | null;
  available?: boolean;
  trust_payment_forwarder?: boolean;
}

export type CellInputMode = "draw" | "manual" | "geofence";

export type DashboardStep = 1 | 2 | 3;

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  kind: "pickup" | "dropoff";
}

export type OrderStatus = "submitted" | "delivering" | "received";

export interface Order {
  id: number;
  sender_user_id: number;
  receiver_user_id: number;
  driver_user_id: number | null;
  sender_name: string;
  sender_phone: string;
  receiver_name: string;
  receiver_phone: string;
  sender_address: string;
  sender_billing_address: string;
  sender_lat: number | null;
  sender_lng: number | null;
  destination_address: string;
  receiver_billing_address: string;
  destination_lat: number | null;
  destination_lng: number | null;
  notes: string;
  pickup_h3: string | null;
  delivery_h3: string | null;
  h3_resolution: number | null;
  source_name: string;
  source_contact: string;
  payment_method: string;
  shipping_method: string;
  package_description: string;
  package_type: PackageType | null;
  packages: OrderPackageEntry[];
  package_factor: number | null;
  weight_lbs: number | null;
  package_weight_unit: string;
  package_length: number | null;
  package_width: number | null;
  package_height: number | null;
  package_dimension_unit: string;
  dimensions: string;
  status: OrderStatus;
  tracking_status: TrackingStatus;
  pickup_ready_at?: string | null;
  route_selection_status?: RouteSelectionStatus | null;
  selected_route_id?: number | null;
  selected_route_label?: string | null;
  submitted_at: string;
  delivering_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderRequest {
  receiver_user_id: number;
  sender_address?: string;
  sender_billing_address?: string;
  sender_lat?: number | null;
  sender_lng?: number | null;
  destination_address?: string;
  destination_lat?: number | null;
  destination_lng?: number | null;
  receiver_billing_address?: string;
  notes?: string;
  driver_user_id?: number | null;
  source_name?: string;
  source_contact?: string;
  payment_method?: string;
  shipping_method?: string;
  package_description?: string;
  /** @deprecated Prefer `packages` */
  package_type?: PackageType;
  packages?: OrderPackageEntry[];
  weight_lbs?: number | null;
  package_length?: number | null;
  package_width?: number | null;
  package_height?: number | null;
  package_dimension_unit?: string;
  dimensions?: string;
}

export interface UpdateOrderPackageRequest {
  package_type?: PackageType;
  packages?: OrderPackageEntry[];
  weight_lbs?: number | null;
  package_length?: number | null;
  package_width?: number | null;
  package_height?: number | null;
  package_description?: string;
  dimensions?: string;
}

export interface UpdateOrderPackageResponse {
  order: Order;
  route_cost_recalculated: boolean;
}

export interface PricingConfig {
  booking_fee_rate: number;
  land_speed_kmh: number;
  units: {
    weight: string;
    dimension: string;
    distance: string;
    time: string;
  };
  land_distance_provider: "google" | "h3";
  external_quote_configured: boolean;
}

export interface UpdatePricingConfigRequest {
  booking_fee_rate?: number;
  land_speed_kmh?: number;
}

export interface ReceiverSummary {
  id: number;
  full_name: string;
  phone: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

export interface DriverSummary {
  id: number;
  full_name: string;
  company_name: string;
  phone: string;
  trustworthiness: number;
  zone_count: number;
  followed: boolean;
  transport_modes: string[];
}

// --------------------------------------------------------------------------
// Milestone 2 — zone overlap / adjacency graph
// --------------------------------------------------------------------------

export type ConnectionType = "overlap" | "adjacent" | "hub";

/** Which terminal of an air/sea zone anchors a hub connection. */
export type HubRole = "departure" | "arrival";

export interface AdjacentCellPair {
  from_cell: string;
  to_cell: string;
}

export interface ZoneConnectionParty {
  id: number;
  zone_name: string;
  transport_id: number;
  transport_name: string;
  transport_method: string | null;
  cell_count: number;
  resolution: number;
  /**
   * Full H3 cell list, embedded in the connection so the map can render
   * both zones even when the viewer (e.g. a driver) doesn't have access
   * to the other party's zone through the regular zones API.
   */
  cells: string[];
  /** Air/sea route terminals. Null for land zones. */
  departure_hub: HubTerminal | null;
  arrival_hub: HubTerminal | null;
  departure_time: string | null;
  arrival_time: string | null;
  operation_date?: string | null;
  operation_start_date?: string | null;
  operation_end_date?: string | null;
  schedule_pattern?: SchedulePattern;
  weekday_start?: number | null;
  weekday_end?: number | null;
  month_day_start?: number | null;
  month_day_end?: number | null;
  operating_start_time?: string | null;
  operating_end_time?: string | null;
}

export interface ZoneConnection {
  id: number;
  connection_type: ConnectionType;
  transfer_cells: string[];
  adjacent_cell_pairs: AdjacentCellPair[];
  recommended_transfer_cell: string | null;
  transport_method_a: string | null;
  transport_method_b: string | null;
  /** For `hub` connections: which terminal anchors each air/sea side. */
  hub_role_a?: HubRole | null;
  hub_role_b?: HubRole | null;
  transfer_cell_count: number;
  adjacent_pair_count: number;
  zone_a: ZoneConnectionParty;
  zone_b: ZoneConnectionParty;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecalculateConnectionsResponse {
  message: string;
  total_connections: number;
  overlap_connections: number;
  adjacent_connections: number;
  hub_connections?: number;
  zones_compared: number;
}

export interface ZoneConnectionFilters {
  connection_type?: ConnectionType;
  transport_id?: number;
  zone_id?: number;
}

// --------------------------------------------------------------------------
// Milestone 2 — Order draft zone-connection preview
//
// Computed from raw pickup/drop-off coordinates *before* an order is saved,
// so the sender can decide whether handoff is even feasible.
// --------------------------------------------------------------------------

export type OrderConnectionStatus =
  | "connected"
  | "not_connected"
  | "no_pickup_zone"
  | "no_destination_zone";

export interface OrderDraftZoneSummary {
  zone_id: number;
  zone_name: string;
  transport_id: number;
  transport_name: string;
  transport_method: string | null;
  cell_count: number;
  resolution: number;
  /**
   * H3 cells of the zone, sampled by the backend for map rendering. Use
   * `cell_count` for the true total — `cells.length` may be smaller.
   * Optional when the API omits cells (older backend) or a zone has none.
   */
  cells?: string[];
  is_pickup: boolean;
  is_destination: boolean;
  /** BFS depth from pickup. 0 for pickup zones; null if unreached. */
  depth: number | null;
  /** Air/sea route terminals (null for land zones) so the map can draw the leg. */
  departure_hub?: HubTerminal | null;
  arrival_hub?: HubTerminal | null;
  departure_time?: string | null;
  arrival_time?: string | null;
  operation_date?: string | null;
  operation_start_date?: string | null;
  operation_end_date?: string | null;
  schedule_pattern?: SchedulePattern;
  weekday_start?: number | null;
  weekday_end?: number | null;
  month_day_start?: number | null;
  month_day_end?: number | null;
  operating_start_time?: string | null;
  operating_end_time?: string | null;
  base_fee?: number | null;
  cost_per_km?: number | null;
  cost_per_hour?: number | null;
  currency?: string | null;
  trust_payment_forwarder?: boolean;
  driver_trustworthiness?: number;
}

export interface OrderDraftConnection {
  id: number;
  from_zone_id: number;
  to_zone_id: number;
  connection_type: ConnectionType;
  transfer_cells: string[];
  adjacent_cell_pairs: AdjacentCellPair[];
  used_in_preview: boolean;
  /** For `hub` connections: which terminal anchors each air/sea side. */
  hub_role_a?: HubRole | null;
  hub_role_b?: HubRole | null;
}

export interface OrderDraftChain {
  zone_ids: number[];
  connection_ids: number[];
  hops: number;
}

/**
 * Milestone 4 — incomplete routes + nearest-gap suggestion, returned only
 * when no complete pickup→drop-off route exists but both ends have a covering
 * zone.
 */
export interface OrderDraftGap {
  pickup_frontier_zone_id: number | null;
  destination_frontier_zone_id: number | null;
  distance_km: number | null;
  /** Incomplete route pickup → … → pickup frontier. */
  pickup_chain: OrderDraftChain | null;
  /** Incomplete route destination frontier → … → drop-off. */
  destination_chain: OrderDraftChain | null;
  suggested_transport_name: string | null;
  suggested_zone_name: string | null;
  message: string;
}

export interface OrderDraftPreview {
  source: { name: string; address: string; lat: number; lng: number; h3: string };
  destination: { name: string; address: string; lat: number; lng: number; h3: string };
  preview_resolution: number;
  max_depth: number;
  pickup_zones: OrderDraftZoneSummary[];
  destination_zones: OrderDraftZoneSummary[];
  connected_zones: OrderDraftZoneSummary[];
  connections: OrderDraftConnection[];
  transfer_cells: string[];
  is_connected_to_destination: boolean;
  status: OrderConnectionStatus;
  message: string;
  possible_connection_chains: OrderDraftChain[];
  /** Milestone 4 — present only when there is no complete route. */
  gap?: OrderDraftGap | null;
}

// --------------------------------------------------------------------------
// Milestone 3 — Driver-Zone Graph
//
// Built from existing transport zones (M1) and zone connections (M2):
//   Node = transport zone
//   Edge = overlap/adjacency connection
//
// The graph is computed dynamically server-side; the front-end consumes
// the same response shape from the dashboard and the inspection drawers.
// --------------------------------------------------------------------------

export type GraphNodeType = "transport_zone";
export type GraphZoneType = "h3" | "geofence";

export interface GraphPrimaryCoordinate {
  lat: number;
  lng: number;
}

export interface GraphNode {
  id: string;
  node_type: GraphNodeType;
  zone_id: number;
  zone_name: string;
  transport_id: number;
  transport_name: string;
  transport_method: string | null;
  zone_type: GraphZoneType;
  h3_cell_count: number;
  /** H3 resolution of `cells`. 0 when no cells. */
  resolution: number;
  /** Full H3 cell list for the zone — used by the on-map graph view. */
  cells: string[];
  primary_coordinate: GraphPrimaryCoordinate | null;
  /** Air/sea route terminals. Null for land zones. */
  departure_hub: HubTerminal | null;
  arrival_hub: HubTerminal | null;
  departure_time: string | null;
  arrival_time: string | null;
  is_isolated: boolean;
  component_id: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  connection_type: ConnectionType;
  transfer_cells: string[];
  adjacent_cell_pairs: AdjacentCellPair[];
  recommended_transfer_cell: string | null;
  transport_method_a: string | null;
  transport_method_b: string | null;
  weight: number;
  is_active: boolean;
}

export interface GraphComponent {
  id: string;
  node_ids: string[];
  edge_ids: string[];
  zone_count: number;
  transport_count: number;
  connection_count: number;
  transport_methods: string[];
  has_overlap: boolean;
  has_adjacency: boolean;
}

export interface GraphSummary {
  total_nodes: number;
  total_edges: number;
  connected_components: number;
  isolated_zones: number;
  overlap_edges: number;
  adjacent_edges: number;
  hub_edges?: number;
  total_components_including_isolated: number;
  generated_at: string;
}

export interface DriverZoneGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  components: GraphComponent[];
  isolated_nodes: GraphNode[];
  summary: GraphSummary;
}

export interface GraphComponentDetail {
  component: GraphComponent;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ZoneNeighborhood {
  zone: GraphNode;
  neighbors: GraphNode[];
  edges: GraphEdge[];
  degree: number;
}

export interface GraphNodeDegree {
  zone_id: number;
  node_id: string;
  degree: number;
}

export interface RebuildGraphOptions {
  recalculate_connections?: boolean;
}

export interface RebuildGraphResponse extends DriverZoneGraph {
  message: string;
}

// --------------------------------------------------------------------------
// Milestone 3 — Order-based transporter graph (sender → receiver)
//
// Built per order: sender / receiver are graph endpoints, transporter
// zones are nodes, overlap/adjacency are zone↔zone edges, and coverage
// edges link the endpoints. Connectivity only — no routes / cost / ETA.
// --------------------------------------------------------------------------

export type OrderGraphNodeType = "sender" | "receiver" | "transport_zone";
export type OrderGraphEdgeType =
  | "pickup_coverage"
  | "delivery_coverage"
  | ConnectionType;

export interface OrderGraphCoordinate {
  lat: number;
  lng: number;
}

export interface OrderGraphEndpointNode {
  id: "sender" | "receiver";
  node_type: "sender" | "receiver";
  label: string;
  h3: string | null;
  primary_coordinate: OrderGraphCoordinate | null;
}

export interface OrderGraphZoneNode {
  id: string;
  node_type: "transport_zone";
  zone_id: number;
  transport_id: number;
  transport_name: string;
  zone_name: string;
  zone_type: GraphZoneType;
  transport_method: string | null;
  h3_cell_count: number;
  resolution: number;
  cells: string[];
  primary_coordinate: OrderGraphCoordinate | null;
  is_pickup_covering: boolean;
  is_delivery_covering: boolean;
  is_reachable: boolean;
  is_isolated: boolean;
}

export type OrderGraphNode = OrderGraphEndpointNode | OrderGraphZoneNode;

export interface OrderGraphEdge {
  id: string;
  source: string;
  target: string;
  edge_type: OrderGraphEdgeType;
  transfer_cells: string[];
  recommended_transfer_cell: string | null;
  adjacent_cell_pairs: AdjacentCellPair[];
}

export interface OrderGraphSummary {
  total_nodes: number;
  total_edges: number;
  pickup_covering_transporters: number;
  delivery_covering_transporters: number;
  reachable_transporters: number;
  unreachable_transporters: number;
  has_complete_connection: boolean;
}

export interface OrderGraph {
  order_id: number;
  pickup_h3: string | null;
  delivery_h3: string | null;
  nodes: OrderGraphNode[];
  edges: OrderGraphEdge[];
  has_complete_connection: boolean;
  pickup_covering_zones: number[];
  delivery_covering_zones: number[];
  reachable_zone_ids: number[];
  unreachable_zone_ids: number[];
  isolated_zone_ids: number[];
  summary: OrderGraphSummary;
}

export interface BuildOrderGraphOptions {
  recalculate_connections?: boolean;
}

export interface BuildOrderGraphResponse extends OrderGraph {
  message: string;
}

/** Type guard: narrow an OrderGraphNode to a transporter-zone node. */
export function isOrderGraphZoneNode(
  node: OrderGraphNode
): node is OrderGraphZoneNode {
  return node.node_type === "transport_zone";
}

// --------------------------------------------------------------------------
// Milestone 5 — route cost
// --------------------------------------------------------------------------

export type SegmentCostStatus = "calculated" | "manual" | "missing" | "requested";
export type SegmentCostSource = "calculated" | "manual" | "external";
export type RouteCostStatus = "complete" | "partial" | "missing";

export interface SegmentCostBreakdown {
  base_cost: number;
  package_factor: number;
  adjusted_base_cost: number;
  travelling_cost: number;
  waiting_cost: number;
  sub_total: number;
  booking_fee_rate: number;
  booking_fee: number;
  total_cost: number;
}

export interface RouteSegmentCost {
  segment_id: number;
  segment_index: number;
  transporter_id: number;
  transporter_name: string;
  from_node_id: string;
  from_label: string;
  to_node_id: string;
  to_label: string;
  transport_method: string;
  zone_id: number | null;
  zone_pricing_mode: ZonePricingMode | null;
  pricing_region_name: string | null;
  effective_base_fee: number | null;
  effective_cost_per_km: number | null;
  effective_cost_per_hour: number | null;
  distance_h3_cells: number | null;
  distance_km: number | null;
  time_hours: number | null;
  package_factor: number | null;
  base_fee: number | null;
  distance_cost: number | null;
  waiting_cost: number | null;
  booking_fee: number | null;
  weight_cost: number | null;
  volume_cost: number | null;
  time_factor_amount: number | null;
  calculated_cost: number | null;
  manual_cost: number | null;
  final_cost: number | null;
  cost_status: SegmentCostStatus;
  cost_source: SegmentCostSource | null;
  currency: string;
  breakdown: SegmentCostBreakdown | null;
}

export interface RouteCostSummary {
  route_id: number;
  order_id: number;
  route_label: string;
  transporters: string[];
  segment_count: number;
  total_calculated_cost: number | null;
  total_manual_cost: number | null;
  total_final_cost: number | null;
  missing_segment_count: number;
  requested_segment_count: number;
  currency: string;
  status: RouteCostStatus;
  segments: RouteSegmentCost[];
}

export interface OrderRouteCostComparison {
  order_id: number;
  currency: string;
  booking_fee_rate: number;
  package_type: PackageType | null;
  packages: OrderPackageEntry[];
  package_factor: number | null;
  package_weight_lbs: number | null;
  package_dimensions_in: string | null;
  routes: RouteCostSummary[];
}

export interface TransporterQuoteRequest {
  order_id: number;
  order_status: string;
  sender_address: string;
  destination_address: string;
  package_type: PackageType | null;
  packages?: OrderPackageEntry[];
  package_weight_lbs: number | null;
  package_dimensions_in: string | null;
  route_id: number;
  route_label: string;
  segment: RouteSegmentCost;
  updated_at: string;
}

// --------------------------------------------------------------------------
// Milestone 6 — route confirmation
// --------------------------------------------------------------------------

export type RouteSelectionStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "partially_confirmed";

export type PaymentStatus = "pending" | "ready" | "not_required";

export type SegmentConfirmationStatus = "pending" | "accepted" | "rejected";

export interface RouteSelection {
  id: number;
  order_id: number;
  selected_route_id: number;
  selected_by_user_id: number;
  status: RouteSelectionStatus;
  payment_status: PaymentStatus;
  route_label: string;
  created_at: string;
  updated_at: string;
}

export type SegmentLegStatus = "not_started" | "picked_up" | "in_transit";

export interface SegmentConfirmationDetail {
  segment_id: number;
  segment_index: number;
  transporter_id: number;
  transporter_name: string;
  from_node_id: string;
  from_label: string;
  to_node_id: string;
  to_label: string;
  status: SegmentConfirmationStatus;
  leg_status: SegmentLegStatus;
  rejection_reason: string | null;
  confirmed_at: string | null;
  final_cost: number | null;
  currency: string;
}

export interface RouteConfirmationStatus {
  route_id: number;
  order_id: number;
  route_label: string;
  selection_status: RouteSelectionStatus;
  payment_status: PaymentStatus;
  confirmed_count: number;
  pending_count: number;
  rejected_count: number;
  total_segments: number;
  progress_percent: number;
  segments: SegmentConfirmationDetail[];
}

export interface TransporterConfirmationItem {
  confirmation_id: number;
  route_id: number;
  order_id: number;
  segment_id: number;
  segment_index: number;
  from_label: string;
  to_label: string;
  status: SegmentConfirmationStatus;
  leg_status: SegmentLegStatus;
  rejection_reason: string | null;
  route_label: string;
  sender_address: string;
  destination_address: string;
  sent_at: string;
  route_selection_status: RouteSelectionStatus | null;
  order_tracking_status: TrackingStatus;
  pickup_ready_at: string | null;
  route_segment_count: number;
  previous_leg_status: SegmentLegStatus | null;
}

// --------------------------------------------------------------------------
// Milestone 7 — order tracking & role views
// --------------------------------------------------------------------------

export type TrackingStatus =
  | "CONFIRMED"
  | "PICKUP_AVAILABLE"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "DELIVERED";

export interface OrderStatusHistoryEntry {
  id: number;
  status: string;
  updated_by: number | null;
  updated_by_name: string | null;
  timestamp: string;
}

export interface OrderTrackingStatus {
  order_id: number;
  tracking_status: TrackingStatus;
  pickup_ready_at: string | null;
  legacy_status: string;
  history: OrderStatusHistoryEntry[];
}

export interface SenderOrderView {
  order: Order;
  tracking_status: TrackingStatus;
  all_routes: RouteCostSummary[];
  selected_route: RouteSelection | null;
  confirmation: RouteConfirmationStatus | null;
  transporters: string[];
}

export interface ReceiverOrderView {
  order: Order;
  tracking_status: TrackingStatus;
  selected_route: RouteSelection | null;
  confirmation: RouteConfirmationStatus | null;
  transporter_chain: string[];
  destination_zone_coverage: boolean;
}

export interface TransporterOrderViewItem {
  order_id: number;
  order_status: string;
  tracking_status: TrackingStatus;
  sender_address: string;
  destination_address: string;
  route_id: number;
  route_label: string;
  my_segments: {
    segment_id: number;
    segment_index: number;
    from_label: string;
    to_label: string;
    confirmation_status: string;
    cost_status: string;
    final_cost: number | null;
  }[];
  upstream_transporter: string | null;
  downstream_transporter: string | null;
}
