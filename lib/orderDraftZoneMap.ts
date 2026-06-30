import type { DriverZone, OrderDraftZoneSummary, TransportMode } from "@/types";
import { isHubMode, normalizeTransportMode } from "@/lib/transportMode";

export function zoneCells(z: OrderDraftZoneSummary): string[] {
  return Array.isArray(z.cells) ? z.cells : [];
}

/** Map an order-preview zone summary to a DriverZone for map tooltips. */
export function summaryToDriverZone(z: OrderDraftZoneSummary): DriverZone {
  return {
    id: z.zone_id,
    owner_user_id: z.transport_id,
    driver_name: z.transport_name,
    zone_name: z.zone_name,
    resolution: z.resolution,
    h3_cells: zoneCells(z),
    cell_count: z.cell_count,
    transport_mode: ((z.transport_method ?? "land") as TransportMode),
    boundary: null,
    departure_hub: z.departure_hub ?? null,
    arrival_hub: z.arrival_hub ?? null,
    departure_time: z.departure_time ?? null,
    arrival_time: z.arrival_time ?? null,
    operation_date: z.operation_date ?? z.operation_start_date ?? null,
    operation_start_date: z.operation_start_date ?? z.operation_date ?? null,
    operation_end_date: z.operation_end_date ?? z.operation_date ?? null,
    schedule_pattern: z.schedule_pattern ?? "daily",
    weekday_start: z.weekday_start ?? null,
    weekday_end: z.weekday_end ?? null,
    month_day_start: z.month_day_start ?? null,
    month_day_end: z.month_day_end ?? null,
    operating_start_time: z.operating_start_time ?? null,
    operating_end_time: z.operating_end_time ?? null,
    base_fee: z.base_fee ?? null,
    cost_per_h3_cell: null,
    cost_per_km: z.cost_per_km ?? null,
    cost_per_hour: z.cost_per_hour ?? null,
    cost_per_kg: null,
    cost_per_volume_unit: null,
    time_of_day_factor: null,
    minimum_fee: null,
    currency: (z.currency ?? "USD") as DriverZone["currency"],
    pricing_mode: "manual",
    pricing_region_id: null,
    available: true,
    trust_payment_forwarder: z.trust_payment_forwarder ?? false,
    driver_trustworthiness: z.driver_trustworthiness ?? 0,
    created_at: "",
    updated_at: "",
  };
}

/** Split land polygons from air/sea hub routes for the zone visibility toggle. */
export function partitionDriverZones(zones: DriverZone[]): {
  landZones: DriverZone[];
  pathHubZones: DriverZone[];
} {
  const landZones: DriverZone[] = [];
  const pathHubZones: DriverZone[] = [];
  for (const z of zones) {
    if (isHubMode(normalizeTransportMode(z.transport_mode))) pathHubZones.push(z);
    else landZones.push(z);
  }
  return { landZones, pathHubZones };
}
