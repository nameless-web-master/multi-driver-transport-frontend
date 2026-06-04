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
  rate_cost: number;
  currency: Currency;
  available: boolean;
  trust_payment_forwarder: boolean;
  driver_trustworthiness?: number;
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
  rate_cost: number;
  currency: Currency;
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
  rate_cost?: number;
  currency?: Currency;
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
  sender_lat: number | null;
  sender_lng: number | null;
  destination_address: string;
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
  weight_kg: number | null;
  dimensions: string;
  status: OrderStatus;
  submitted_at: string;
  delivering_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderRequest {
  receiver_user_id: number;
  sender_address?: string;
  sender_lat?: number | null;
  sender_lng?: number | null;
  notes?: string;
  driver_user_id?: number | null;
  source_name?: string;
  source_contact?: string;
  payment_method?: string;
  shipping_method?: string;
  package_description?: string;
  weight_kg?: number | null;
  dimensions?: string;
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

export type ConnectionType = "overlap" | "adjacent";

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
}

export interface ZoneConnection {
  id: number;
  connection_type: ConnectionType;
  transfer_cells: string[];
  adjacent_cell_pairs: AdjacentCellPair[];
  recommended_transfer_cell: string | null;
  transport_method_a: string | null;
  transport_method_b: string | null;
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
}

export interface OrderDraftConnection {
  id: number;
  from_zone_id: number;
  to_zone_id: number;
  connection_type: ConnectionType;
  transfer_cells: string[];
  adjacent_cell_pairs: AdjacentCellPair[];
  used_in_preview: boolean;
}

export interface OrderDraftChain {
  zone_ids: number[];
  connection_ids: number[];
  hops: number;
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
