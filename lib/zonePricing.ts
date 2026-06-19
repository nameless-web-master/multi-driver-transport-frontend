import type { DriverZone, RouteSegmentCost, ZonePricingMode } from "@/types";
import { formatCurrency } from "@/lib/utils";

export function formatPricingMode(mode: ZonePricingMode | string | null | undefined): string {
  if (mode === "manual") return "Own price";
  return "System";
}

export function zoneRateDisplay(
  zone: Pick<
    DriverZone,
    | "base_fee"
    | "cost_per_km"
    | "cost_per_hour"
    | "effective_base_fee"
    | "effective_cost_per_km"
    | "effective_cost_per_hour"
    | "currency"
  >,
  field: "base_fee" | "cost_per_km" | "cost_per_hour"
): string {
  const effectiveKey =
    field === "base_fee"
      ? "effective_base_fee"
      : field === "cost_per_km"
        ? "effective_cost_per_km"
        : "effective_cost_per_hour";
  const effective = zone[effectiveKey];
  const override = zone[field];
  const value = effective ?? override;
  if (value == null) return "—";
  const suffix =
    field === "cost_per_km" ? "/km" : field === "cost_per_hour" ? "/hr" : "";
  return `${formatCurrency(Number(value), zone.currency)}${suffix}`;
}

export function segmentPricingHint(
  seg: Pick<
    RouteSegmentCost,
    | "zone_pricing_mode"
    | "pricing_region_name"
    | "effective_cost_per_km"
    | "effective_cost_per_hour"
    | "effective_base_fee"
    | "currency"
    | "distance_km"
    | "time_hours"
  >,
  bookingFeeRate: number
): string | null {
  if (seg.zone_pricing_mode == null) return null;
  const parts: string[] = [formatPricingMode(seg.zone_pricing_mode)];
  if (seg.pricing_region_name) parts.push(seg.pricing_region_name);
  if (seg.zone_pricing_mode === "system") {
    const hints: string[] = [];
    if (seg.effective_cost_per_km != null && seg.distance_km != null) {
      hints.push(
        `travel ≈ ${formatCurrency(seg.effective_cost_per_km * seg.distance_km, seg.currency)}`
      );
    }
    if (seg.effective_cost_per_hour != null && seg.time_hours != null) {
      hints.push(
        `waiting ≈ ${formatCurrency(seg.effective_cost_per_hour * seg.time_hours, seg.currency)}`
      );
    }
    if (hints.length > 0) parts.push(hints.join(", "));
    parts.push(`booking fee ${(bookingFeeRate * 100).toFixed(2)}%`);
  }
  return parts.join(" · ");
}
