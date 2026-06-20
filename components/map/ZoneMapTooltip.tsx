"use client";

import { formatCurrency } from "@/lib/utils";
import { formatZoneScheduleLabel } from "@/lib/zoneSchedule";
import { isHubMode, normalizeTransportMode, TRANSPORT_MODE_META } from "@/lib/transportMode";
import type { DriverZone } from "@/types";

const TRANSPORT_LABEL: Record<string, string> = {
  land: "Land",
  air: "Air",
  sea: "Sea",
};

/** Wide tooltip class — pairs with `.map-wide-tooltip` in `globals.css`. */
export const ZONE_MAP_TOOLTIP_CLASS = "map-wide-tooltip";

function rateOrDash(value: number | null | undefined, currency: string) {
  return value != null ? formatCurrency(Number(value), currency) : "—";
}

/**
 * Detailed zone fields shared by single-zone and handoff tooltips.
 * `compact` drops the zone title row (used when a parent supplies a section label).
 */
export function ZoneMapTooltipDetails({
  zone,
  color,
  compact = false,
}: {
  zone: DriverZone;
  color: string;
  compact?: boolean;
}) {
  const mode = normalizeTransportMode(zone.transport_mode);
  const meta = TRANSPORT_MODE_META[mode];
  const modeLabel = TRANSPORT_LABEL[zone.transport_mode] ?? zone.transport_mode;
  const currency = zone.currency ?? "USD";
  const baseRate =
    zone.effective_base_fee ?? zone.base_fee ?? zone.region_rates?.base_fee ?? null;
  const kmRate =
    zone.effective_cost_per_km ?? zone.cost_per_km ?? zone.region_rates?.cost_per_km ?? null;
  const hrRate =
    zone.effective_cost_per_hour ?? zone.cost_per_hour ?? zone.region_rates?.cost_per_hour ?? null;
  const trustScore = zone.driver_trustworthiness ?? 0;

  return (
    <>
      {!compact && (
        <>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
              style={{ background: color }}
            />
            <span className="font-semibold">{zone.zone_name}</span>
          </div>
          <div className="text-muted-foreground mb-1.5">
            Driver: <span className="text-foreground">{zone.driver_name}</span>
          </div>
        </>
      )}
      {compact && (
        <div className="flex items-center gap-2 mb-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
            style={{ background: color }}
          />
          <span className="font-semibold">{zone.zone_name}</span>
          <span className="text-muted-foreground">· {zone.driver_name}</span>
        </div>
      )}
      {isHubMode(mode) && zone.departure_hub && zone.arrival_hub && (
        <div className="mb-1.5 space-y-0.5 text-foreground">
          <div>
            <span className="text-green-600 font-medium">DEP</span>{" "}
            {zone.departure_hub.name}
            {zone.departure_time ? ` · ${zone.departure_time}` : ""}
          </div>
          <div>
            <span className="text-orange-500 font-medium">ARR</span>{" "}
            {zone.arrival_hub.name}
            {zone.arrival_time ? ` · ${zone.arrival_time}` : ""}
          </div>
        </div>
      )}
      {isHubMode(mode) && (!zone.departure_hub || !zone.arrival_hub) && (
        <div className="mb-1.5 text-foreground">
          {meta.label} {meta.hubNoun} · route terminals not set
        </div>
      )}
      {formatZoneScheduleLabel(zone) && (
        <div className="mb-1.5 text-muted-foreground">
          Schedule: <span className="text-foreground">{formatZoneScheduleLabel(zone)}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span className="text-muted-foreground">Base cost</span>
        <span className="font-medium text-right">{rateOrDash(baseRate, currency)}</span>
        <span className="text-muted-foreground">Per km</span>
        <span className="font-medium text-right">{rateOrDash(kmRate, currency)}</span>
        <span className="text-muted-foreground">Per hr</span>
        <span className="font-medium text-right">{rateOrDash(hrRate, currency)}</span>
        <span className="text-muted-foreground">Available</span>
        <span
          className={`font-medium text-right ${
            zone.available ? "text-green-600" : "text-amber-600"
          }`}
        >
          {zone.available ? "Yes" : "No"}
        </span>
        <span className="text-muted-foreground">Mode</span>
        <span className="font-medium text-right">{modeLabel}</span>
        <span className="text-muted-foreground">Trust forwarder</span>
        <span className="font-medium text-right">
          {zone.trust_payment_forwarder ? "Yes" : "No"}
        </span>
        <span className="text-muted-foreground">Trustworthiness</span>
        <span className="font-medium text-right">{trustScore}</span>
        {!isHubMode(mode) && (
          <>
            <span className="text-muted-foreground">Cells · Res</span>
            <span className="font-medium text-right">
              {zone.cell_count} · r{zone.resolution}
            </span>
          </>
        )}
      </div>
    </>
  );
}

/** Rich tooltip for a single zone marker (land cell, air/sea hub icon). */
export function ZoneMapTooltip({ zone, color }: { zone: DriverZone; color: string }) {
  return (
    <div className="text-xs leading-snug min-w-[200px]">
      <ZoneMapTooltipDetails zone={zone} color={color} />
    </div>
  );
}
