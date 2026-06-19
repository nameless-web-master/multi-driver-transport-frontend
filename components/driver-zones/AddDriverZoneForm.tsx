"use client";

import { Hexagon, Loader2, PenLine, Pentagon, Plane, Ship, Truck } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getResolution, isValidCell } from "h3-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createDriverZone, getPricingConfig, listPricingRegions, updateDriverZone } from "@/lib/api";
import {
  chooseResolutionForArea,
  estimateCellCount,
  formatAreaKm2,
  formatDistanceKm,
  haversineKm,
  polygonAreaKm2,
} from "@/lib/geo";
import { cn, currencyLabel } from "@/lib/utils";
import { DEFAULT_BOOKING_FEE_RATE, formatBookingFeePercent } from "@/lib/pricing";
import { isHubMode, type HubRole } from "@/lib/transportMode";
import { todayOperationDate, SCHEDULE_PATTERNS, WEEKDAY_OPTIONS } from "@/lib/zoneSchedule";
import type { SchedulePattern } from "@/types";
import { isLikelyWater, reverseGeocode } from "@/lib/places";
import { AddressSearchInput, type SelectedPlace } from "@/components/ui/AddressSearchInput";
import {
  CURRENCIES,
  type CellInputMode,
  type ConvertH3Response,
  type Currency,
  type DriverZone,
  type HubTerminal,
  type LatLngPoint,
  type TransportMode,
  type ZonePricingMode,
} from "@/types";

import { H3MapView } from "@/components/map/H3MapViewDynamic";

/** Default map height on the driver zone create/edit form (px). */
export const DRIVER_ZONE_FORM_MAP_HEIGHT = 520;

const RESOLUTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** Default H3 resolution for hub-derived cells on air/sea routes. */
const HUB_ROUTE_RESOLUTION = 7;

// Module-level constant so the "no cells" prop has a stable reference
// across renders. Prevents H3MapView from invalidating downstream memos.
const EMPTY_CELLS: string[] = [];

const TRANSPORT_OPTIONS: { mode: TransportMode; label: string; icon: typeof Plane }[] = [
  { mode: "land", label: "Land", icon: Truck },
  { mode: "air", label: "Air", icon: Plane },
  { mode: "sea", label: "Sea", icon: Ship },
];

interface Props {
  zones: DriverZone[];
  conversion: ConvertH3Response | null;
  editingZone: DriverZone | null;
  onSaved: () => void;
  onCancelEdit: () => void;
  onMessage: (text: string, type?: "success" | "error") => void;
}

function parseManualCells(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

interface ZoneRateInput {
  base_fee: number | null;
  cost_per_km: number | null;
  cost_per_hour: number | null;
  cost_per_h3_cell: null;
  cost_per_kg: null;
  cost_per_volume_unit: null;
  time_of_day_factor: null;
  minimum_fee: null;
}

/** Stored rate value → input string ("" when unset). */
function rateToInput(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

/**
 * Parse an optional pricing input. Empty string → null (not set). Throws with
 * a friendly message when the value is present but not a valid number ≥ 0.
 */
function parseOptionalRate(raw: string, label: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label} must be a number ≥ 0.`);
  }
  return n;
}

/**
 * Concise terminal label from a picked place. Nominatim `display_name` is
 * very long ("Toronto Pearson International Airport, 6301, Silver Dart Drive,
 * Mississauga, …"); the leading segment is the venue name, which is the
 * meaningful terminal label.
 */
function hubLabelFromPlace(place: SelectedPlace): string {
  const first = place.display_name.split(",")[0]?.trim();
  return first || place.label || place.display_name;
}

export function AddDriverZoneForm({
  zones,
  conversion,
  editingZone,
  onSaved,
  onCancelEdit,
  onMessage,
}: Props) {
  const [driverName, setDriverName] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [resolution, setResolution] = useState("7");
  const [mode, setMode] = useState<CellInputMode>("draw");
  const [selectedCells, setSelectedCells] = useState<string[]>([]);
  const [boundary, setBoundary] = useState<LatLngPoint[]>([]);
  const [transportMode, setTransportMode] = useState<TransportMode>("land");
  // Milestone 5 — detailed per-zone pricing. Empty string means "not set".
  const [baseFee, setBaseFee] = useState("");
  const [costPerKm, setCostPerKm] = useState("");
  const [costPerHour, setCostPerHour] = useState("");
  const [pricingMode, setPricingMode] = useState<ZonePricingMode>("system");
  const [pricingRegionId, setPricingRegionId] = useState<string>("");
  const [pricingRegions, setPricingRegions] = useState<
    import("@/types").PricingRegion[]
  >([]);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [bookingFeeRate, setBookingFeeRate] = useState(DEFAULT_BOOKING_FEE_RATE);
  const [available, setAvailable] = useState(true);
  const [trustForwarder, setTrustForwarder] = useState(false);
  const [manualText, setManualText] = useState("");
  const [saving, setSaving] = useState(false);
  /**
   * In geofence mode, picking H3 resolution by hand for a large area is
   * a footgun — at res 7 a city-sized polygon explodes into thousands of
   * cells and the map can stall. When enabled, the form derives the
   * coarsest resolution that keeps the total cell count under a budget.
   * The user can still flip it off and choose manually.
   */
  const [autoResolution, setAutoResolution] = useState(true);
  const [departureHub, setDepartureHub] = useState<HubTerminal | null>(null);
  const [arrivalHub, setArrivalHub] = useState<HubTerminal | null>(null);
  const [departureTime, setDepartureTime] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [operationStartDate, setOperationStartDate] = useState(todayOperationDate);
  const [operationEndDate, setOperationEndDate] = useState(todayOperationDate);
  const [schedulePattern, setSchedulePattern] = useState<SchedulePattern>("daily");
  const [weekdayStart, setWeekdayStart] = useState("1");
  const [weekdayEnd, setWeekdayEnd] = useState("5");
  const [monthDayStart, setMonthDayStart] = useState("1");
  const [monthDayEnd, setMonthDayEnd] = useState("15");
  const [operatingStartTime, setOperatingStartTime] = useState("");
  const [operatingEndTime, setOperatingEndTime] = useState("");
  const [activeHubPick, setActiveHubPick] = useState<HubRole>("departure");
  const [hubWaterWarning, setHubWaterWarning] = useState<string | null>(null);

  const isHubRoute = isHubMode(transportMode);

  // Air/sea legs are a line between two terminals; show the route distance so
  // the transporter can price it per km.
  const routeDistanceKm = useMemo(() => {
    if (
      !isHubRoute ||
      !departureHub ||
      !arrivalHub ||
      !Number.isFinite(departureHub.lat) ||
      !Number.isFinite(departureHub.lng) ||
      !Number.isFinite(arrivalHub.lat) ||
      !Number.isFinite(arrivalHub.lng)
    ) {
      return null;
    }
    return haversineKm(
      { lat: departureHub.lat, lng: departureHub.lng },
      { lat: arrivalHub.lat, lng: arrivalHub.lng }
    );
  }, [isHubRoute, departureHub, arrivalHub]);

  const selectedPricingRegion = useMemo(() => {
    const id = Number(pricingRegionId);
    if (!Number.isFinite(id)) return null;
    return pricingRegions.find((r) => r.id === id) ?? null;
  }, [pricingRegionId, pricingRegions]);

  useEffect(() => {
    getPricingConfig()
      .then((cfg) => setBookingFeeRate(cfg.booking_fee_rate))
      .catch(() => setBookingFeeRate(DEFAULT_BOOKING_FEE_RATE));
    listPricingRegions()
      .then(setPricingRegions)
      .catch(() => setPricingRegions([]));
  }, []);

  useEffect(() => {
    if (editingZone) {
      setDriverName(editingZone.driver_name);
      setZoneName(editingZone.zone_name);
      setResolution(String(editingZone.resolution));
      setSelectedCells(editingZone.h3_cells);
      setManualText(editingZone.h3_cells.join("\n"));
      setTransportMode(editingZone.transport_mode ?? "land");
      setBaseFee(rateToInput(editingZone.base_fee));
      setCostPerKm(rateToInput(editingZone.cost_per_km));
      setCostPerHour(rateToInput(editingZone.cost_per_hour));
      setPricingMode(editingZone.pricing_mode ?? "system");
      setPricingRegionId(
        editingZone.pricing_region_id != null ? String(editingZone.pricing_region_id) : ""
      );
      setCurrency(editingZone.currency ?? "USD");
      setAvailable(editingZone.available ?? true);
      setTrustForwarder(editingZone.trust_payment_forwarder ?? false);
      setDepartureHub(editingZone.departure_hub);
      setArrivalHub(editingZone.arrival_hub);
      setDepartureTime(editingZone.departure_time ?? "");
      setArrivalTime(editingZone.arrival_time ?? "");
      const start =
        editingZone.operation_start_date ?? editingZone.operation_date ?? todayOperationDate();
      const end =
        editingZone.operation_end_date ?? editingZone.operation_date ?? start;
      setOperationStartDate(start);
      setOperationEndDate(end);
      setSchedulePattern(editingZone.schedule_pattern ?? "daily");
      setWeekdayStart(String(editingZone.weekday_start ?? 1));
      setWeekdayEnd(String(editingZone.weekday_end ?? 5));
      setMonthDayStart(String(editingZone.month_day_start ?? 1));
      setMonthDayEnd(String(editingZone.month_day_end ?? 15));
      setOperatingStartTime(editingZone.operating_start_time ?? "");
      setOperatingEndTime(editingZone.operating_end_time ?? "");
      if (editingZone.boundary && editingZone.boundary.length >= 3) {
        setBoundary(editingZone.boundary);
        setMode("geofence");
        // Loading an existing geofence — respect the stored resolution
        // unless the user explicitly turns auto-tune on again.
        setAutoResolution(false);
      } else {
        setBoundary([]);
        setMode("draw");
      }
    }
  }, [editingZone]);

  useEffect(() => {
    if (editingZone || !conversion) return;
    setResolution(String(conversion.resolution));
  }, [conversion?.resolution, editingZone]);

  useEffect(() => {
    if (mode !== "manual") {
      setManualText(selectedCells.join("\n"));
    }
  }, [selectedCells, mode]);

  // Best-effort land/water check: warn (don't block) if a terminal hub looks
  // like it was dropped on open water. Client requirement: transfers must
  // happen on land. Coastal ports sit on the waterline, so this is advisory.
  useEffect(() => {
    if (!isHubRoute) {
      setHubWaterWarning(null);
      return;
    }
    const depValid = departureHub && Number.isFinite(departureHub.lat) && Number.isFinite(departureHub.lng);
    const arrValid = arrivalHub && Number.isFinite(arrivalHub.lat) && Number.isFinite(arrivalHub.lng);
    if (!depValid && !arrValid) {
      setHubWaterWarning(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const offenders: string[] = [];
      if (depValid) {
        const r = await reverseGeocode(departureHub!.lat, departureHub!.lng, controller.signal);
        if (isLikelyWater(r)) offenders.push("departure");
      }
      if (arrValid) {
        const r = await reverseGeocode(arrivalHub!.lat, arrivalHub!.lng, controller.signal);
        if (isLikelyWater(r)) offenders.push("arrival");
      }
      if (offenders.length > 0) {
        setHubWaterWarning(
          `The ${offenders.join(" and ")} terminal${
            offenders.length > 1 ? "s appear" : " appears"
          } to be on water. Transfers must happen on land — place ${
            offenders.length > 1 ? "them" : "it"
          } on the airport/port itself.`
        );
      } else {
        setHubWaterWarning(null);
      }
    }, 700);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [isHubRoute, departureHub?.lat, departureHub?.lng, arrivalHub?.lat, arrivalHub?.lng]);

  const resolutionNum = Number(resolution);

  // Area + cell-count estimate for the current geofence. Memoized so the
  // (mildly expensive) spherical polygon math doesn't run on every keystroke.
  const geofenceArea = useMemo(() => {
    if (mode !== "geofence" || boundary.length < 3) return 0;
    return polygonAreaKm2(boundary);
  }, [mode, boundary]);

  const recommendedResolution = useMemo(() => {
    if (geofenceArea <= 0) return null;
    return chooseResolutionForArea(geofenceArea, 400, 1, 10);
  }, [geofenceArea]);

  const estimatedCells = useMemo(() => {
    if (geofenceArea <= 0) return 0;
    return estimateCellCount(geofenceArea, resolutionNum);
  }, [geofenceArea, resolutionNum]);

  // Auto-snap the resolution dropdown to the recommendation while the
  // user is drawing a geofence and hasn't opted out of auto-tune.
  useEffect(() => {
    if (mode !== "geofence") return;
    if (!autoResolution) return;
    if (recommendedResolution == null) return;
    const next = String(recommendedResolution);
    setResolution((prev) => (prev === next ? prev : next));
  }, [mode, autoResolution, recommendedResolution]);

  useEffect(() => {
    if (mode === "manual") {
      const parsed = parseManualCells(manualText);
      const valid = parsed.filter(
        (c) => isValidCell(c) && getResolution(c) === resolutionNum
      );
      setSelectedCells(valid);
    }
  }, [manualText, mode, resolutionNum]);

  useEffect(() => {
    if (mode === "geofence") return;
    setSelectedCells((prev) => {
      const filtered = prev.filter(
        (c) => isValidCell(c) && getResolution(c) === resolutionNum
      );
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [resolutionNum, mode]);

  const invalidManual = useMemo(() => {
    if (mode !== "manual") return [];
    return parseManualCells(manualText).filter(
      (c) => !isValidCell(c) || getResolution(c) !== resolutionNum
    );
  }, [manualText, mode, resolutionNum]);

  // Stabilize the props handed to the (heavy) map so unrelated form state
  // changes — e.g. typing in the driver/zone name input — don't trigger a
  // full re-layout of every saved-zone polygon on every keystroke.
  const savedZonesForMap = useMemo(
    () => zones.filter((z) => z.id !== editingZone?.id),
    [zones, editingZone?.id]
  );
  const selectedCellsForMap = useMemo(
    () => (mode !== "geofence" ? selectedCells : EMPTY_CELLS),
    [mode, selectedCells]
  );

  const clearForm = useCallback(() => {
    setDriverName("");
    setZoneName("");
    setSelectedCells([]);
    setBoundary([]);
    setManualText("");
    setTransportMode("land");
    setBaseFee("");
    setCostPerKm("");
    setCostPerHour("");
    setPricingMode("system");
    setPricingRegionId("");
    setCurrency("USD");
    setAvailable(true);
    setTrustForwarder(false);
    setMode("draw");
    setAutoResolution(true);
    setDepartureHub(null);
    setArrivalHub(null);
    setDepartureTime("");
    setArrivalTime("");
    setOperationStartDate(todayOperationDate());
    setOperationEndDate(todayOperationDate());
    setSchedulePattern("daily");
    setWeekdayStart("1");
    setWeekdayEnd("5");
    setMonthDayStart("1");
    setMonthDayEnd("15");
    setOperatingStartTime("");
    setOperatingEndTime("");
    setActiveHubPick("departure");
  }, []);

  function handleTransportModeChange(next: TransportMode) {
    setTransportMode(next);
    if (isHubMode(next)) {
      setMode("draw");
      setSelectedCells([]);
      setBoundary([]);
      setManualText("");
      setResolution(String(HUB_ROUTE_RESOLUTION));
    } else {
      setDepartureHub(null);
      setArrivalHub(null);
      setDepartureTime("");
      setArrivalTime("");
    }
  }

  const handleCancel = useCallback(() => {
    clearForm();
    onCancelEdit();
  }, [clearForm, onCancelEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!driverName.trim()) {
      onMessage("Driver name is required.", "error");
      return;
    }

    let rateFields: ZoneRateInput;
    try {
      rateFields = {
        base_fee: parseOptionalRate(baseFee, "Base cost"),
        cost_per_km: parseOptionalRate(costPerKm, "Cost per km"),
        cost_per_hour: parseOptionalRate(costPerHour, "Cost per hour"),
        cost_per_h3_cell: null,
        cost_per_kg: null,
        cost_per_volume_unit: null,
        time_of_day_factor: null,
        minimum_fee: null,
      };
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Invalid rate value.", "error");
      return;
    }

    if (pricingMode === "system") {
      const region = selectedPricingRegion;
      const hasRegionRates =
        region != null &&
        (region.base_fee != null || region.cost_per_km != null || region.cost_per_hour != null);
      const hasZoneRates =
        rateFields.base_fee != null ||
        rateFields.cost_per_km != null ||
        rateFields.cost_per_hour != null;
      if (!hasRegionRates && !hasZoneRates) {
        onMessage(
          "System pricing requires a region with rates or at least one rate field on this zone.",
          "error"
        );
        return;
      }
    }

    const finalZoneName = zoneName.trim() || `${driverName.trim()} Zone`;

    if (!operationStartDate.trim() || !operationEndDate.trim()) {
      onMessage("Operation start and end dates are required.", "error");
      return;
    }
    if (operationStartDate > operationEndDate) {
      onMessage("Operation end date must be on or after the start date.", "error");
      return;
    }
    if (schedulePattern === "weekly" && (!weekdayStart || !weekdayEnd)) {
      onMessage("Select the weekday range for this zone.", "error");
      return;
    }
    if (schedulePattern === "monthly" && (!monthDayStart || !monthDayEnd)) {
      onMessage("Select the day-of-month range for this zone.", "error");
      return;
    }

    const schedulePayload = {
      operation_start_date: operationStartDate.trim(),
      operation_end_date: operationEndDate.trim(),
      schedule_pattern: schedulePattern,
      weekday_start: schedulePattern === "weekly" ? Number(weekdayStart) : null,
      weekday_end: schedulePattern === "weekly" ? Number(weekdayEnd) : null,
      month_day_start: schedulePattern === "monthly" ? Number(monthDayStart) : null,
      month_day_end: schedulePattern === "monthly" ? Number(monthDayEnd) : null,
    };

    if (isHubRoute) {
      if (transportMode !== "air" && transportMode !== "sea") {
        onMessage("Select Air or Sea transport mode for terminal routes.", "error");
        return;
      }
      if (!departureHub?.name.trim()) {
        onMessage("Departure terminal name is required.", "error");
        return;
      }
      if (!Number.isFinite(departureHub.lat) || !Number.isFinite(departureHub.lng)) {
        onMessage("Place the departure terminal on the map.", "error");
        return;
      }
      if (!arrivalHub?.name.trim()) {
        onMessage("Arrival terminal name is required.", "error");
        return;
      }
      if (!Number.isFinite(arrivalHub.lat) || !Number.isFinite(arrivalHub.lng)) {
        onMessage("Place the arrival terminal on the map.", "error");
        return;
      }
      if (!departureTime.trim()) {
        onMessage("Departure time is required for air/sea routes.", "error");
        return;
      }
      if (!arrivalTime.trim()) {
        onMessage("Arrival time is required for air/sea routes.", "error");
        return;
      }
    } else if (mode === "geofence") {
      if (boundary.length < 3) {
        onMessage("Draw a geofence with at least 3 points on the map.", "error");
        return;
      }
    } else if (selectedCells.length === 0) {
      onMessage("Select at least one H3 cell.", "error");
      return;
    }

    if (!isHubRoute) {
      if (!operatingStartTime.trim()) {
        onMessage("Operating start time is required for land zones.", "error");
        return;
      }
      if (!operatingEndTime.trim()) {
        onMessage("Operating end time is required for land zones.", "error");
        return;
      }
    }

    const payload = isHubRoute
      ? {
          driver_name: driverName.trim(),
          zone_name: finalZoneName,
          resolution: HUB_ROUTE_RESOLUTION,
          transport_mode: transportMode,
          departure_hub: {
            name: departureHub!.name.trim(),
            lat: departureHub!.lat,
            lng: departureHub!.lng,
          },
          arrival_hub: {
            name: arrivalHub!.name.trim(),
            lat: arrivalHub!.lat,
            lng: arrivalHub!.lng,
          },
          departure_time: departureTime.trim(),
          arrival_time: arrivalTime.trim(),
          ...schedulePayload,
          ...rateFields,
          pricing_mode: pricingMode,
          pricing_region_id: pricingRegionId ? Number(pricingRegionId) : null,
          currency,
          available,
          trust_payment_forwarder: trustForwarder,
        }
      : {
          driver_name: driverName.trim(),
          zone_name: finalZoneName,
          resolution: resolutionNum,
          transport_mode: transportMode,
          operating_start_time: operatingStartTime.trim(),
          operating_end_time: operatingEndTime.trim(),
          ...schedulePayload,
          ...rateFields,
          pricing_mode: pricingMode,
          pricing_region_id: pricingRegionId ? Number(pricingRegionId) : null,
          currency,
          available,
          trust_payment_forwarder: trustForwarder,
          ...(mode === "geofence"
            ? { boundary, h3_cells: undefined }
            : { h3_cells: selectedCells, boundary: null }),
        };

    setSaving(true);
    try {
      if (editingZone) {
        await updateDriverZone(editingZone.id, payload);
        onMessage("Driver zone updated.", "success");
      } else {
        await createDriverZone(payload);
        onMessage("Driver zone saved.", "success");
      }
      clearForm();
      onCancelEdit();
      onSaved();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to save zone", "error");
    } finally {
      setSaving(false);
    }
  }

  function clearSelection() {
    setSelectedCells([]);
    setBoundary([]);
    setManualText("");
    setAutoResolution(true);
    if (isHubRoute) {
      setDepartureHub(null);
      setArrivalHub(null);
      setDepartureTime("");
      setArrivalTime("");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>{editingZone ? "Edit Driver Zone" : "Add Driver Zone"}</CardTitle>
        {editingZone && (
          <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
            Cancel edit
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <Label>Driver Name</Label>
              <Input
                placeholder="e.g. Your fleet driver name"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Zone Name (Optional)</Label>
              <Input
                placeholder="e.g. Downtown SF Zone"
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-3">
              {!isHubRoute && (
                <div>
                  <Label>
                    H3 Resolution
                    {mode === "geofence" && autoResolution && (
                      <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                        auto
                      </span>
                    )}
                  </Label>
                  <Select
                    value={resolution}
                    onChange={(e) => {
                      if (mode === "geofence") setAutoResolution(false);
                      setResolution(e.target.value);
                    }}
                  >
                    {RESOLUTIONS.map((r) => (
                      <option key={r} value={String(r)}>
                        {r}
                      </option>
                    ))}
                  </Select>
                  {mode === "geofence" && geofenceArea > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>
                        Area:{" "}
                        <span className="font-medium text-foreground">
                          {formatAreaKm2(geofenceArea)}
                        </span>
                      </span>
                      <span>
                        ≈{" "}
                        <span
                          className={cn(
                            "font-medium",
                            estimatedCells > 1500 ? "text-danger" : "text-foreground"
                          )}
                        >
                          {estimatedCells.toLocaleString()}
                        </span>{" "}
                        cells
                      </span>
                      {!autoResolution && recommendedResolution != null && recommendedResolution !== resolutionNum && (
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => {
                            setAutoResolution(true);
                            setResolution(String(recommendedResolution));
                          }}
                        >
                          Use auto (r{recommendedResolution})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-3 rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Label>Pricing</Label>
                    <p className="text-xs text-muted-foreground">
                      {pricingMode === "system"
                        ? "System calculates: (base × package factor) + traveling + waiting +"
                        : "You set cost per route — enter quotes when orders are priced."}{" "}
                      {pricingMode === "system" && (
                        <span>{formatBookingFeePercent(bookingFeeRate)} booking fee (platform).</span>
                      )}
                      {isHubRoute && pricingMode === "system" && (
                        <span className="block mt-1">
                          Air segments always require a manual quote at route time.
                        </span>
                      )}
                    </p>
                  </div>
                  <Select
                    className="w-28 shrink-0"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as Currency)}
                    aria-label="Currency"
                    title={currencyLabel(currency)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c} title={currencyLabel(c)}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Pricing mode</Label>
                    <Select
                      value={pricingMode}
                      onChange={(e) => setPricingMode(e.target.value as ZonePricingMode)}
                    >
                      <option value="system">System calculates</option>
                      <option value="manual">I set my own price</option>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Pricing region</Label>
                    <Select
                      value={pricingRegionId}
                      onChange={(e) => setPricingRegionId(e.target.value)}
                    >
                      <option value="">No region</option>
                      {pricingRegions.map((r) => (
                        <option key={r.id} value={String(r.id)}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Regional defaults (e.g. minimum wage) apply when fields are left empty.
                    </p>
                  </div>
                </div>
                {isHubRoute && (
                  <div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">
                      Route distance (departure → arrival)
                    </span>
                    <span className="font-medium">
                      {routeDistanceKm != null
                        ? formatDistanceKm(routeDistanceKm)
                        : "Place both terminals on the map"}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Base cost</Label>
                    <Input
                      inputMode="decimal"
                      placeholder={
                        selectedPricingRegion?.base_fee != null
                          ? `Region: ${selectedPricingRegion.base_fee}`
                          : "e.g. 20"
                      }
                      value={baseFee}
                      onChange={(e) => setBaseFee(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Cost per distance (per km)</Label>
                    <Input
                      inputMode="decimal"
                      placeholder={
                        selectedPricingRegion?.cost_per_km != null
                          ? `Region: ${selectedPricingRegion.cost_per_km}`
                          : "e.g. 1.5"
                      }
                      value={costPerKm}
                      onChange={(e) => setCostPerKm(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Waiting rate (per hour / wage)</Label>
                    <Input
                      inputMode="decimal"
                      placeholder={
                        selectedPricingRegion?.cost_per_hour != null
                          ? `Region: ${selectedPricingRegion.cost_per_hour}`
                          : "e.g. 25"
                      }
                      value={costPerHour}
                      onChange={(e) => setCostPerHour(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <p className="text-[11px] text-muted-foreground rounded-md bg-muted/50 px-2 py-2">
                      Traveling and waiting costs are computed from distance and time.
                      Booking fee: {formatBookingFeePercent(bookingFeeRate)} (set by admin).
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <Label>Transport mode</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {TRANSPORT_OPTIONS.map(({ mode: m, label, icon: Icon }) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleTransportModeChange(m)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer transition-colors text-sm",
                      transportMode === m
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Operation schedule</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Operation start date</Label>
                  <Input
                    type="date"
                    value={operationStartDate}
                    onChange={(e) => setOperationStartDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label>Operation end date</Label>
                  <Input
                    type="date"
                    value={operationEndDate}
                    onChange={(e) => setOperationEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <Label>Repeats</Label>
                <Select
                  value={schedulePattern}
                  onChange={(e) => setSchedulePattern(e.target.value as SchedulePattern)}
                >
                  {SCHEDULE_PATTERNS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </div>
              {schedulePattern === "weekly" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>From weekday</Label>
                    <Select value={weekdayStart} onChange={(e) => setWeekdayStart(e.target.value)}>
                      {WEEKDAY_OPTIONS.map((d) => (
                        <option key={d.value} value={String(d.value)}>
                          {d.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>To weekday</Label>
                    <Select value={weekdayEnd} onChange={(e) => setWeekdayEnd(e.target.value)}>
                      {WEEKDAY_OPTIONS.map((d) => (
                        <option key={d.value} value={String(d.value)}>
                          {d.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              )}
              {schedulePattern === "monthly" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>From day of month</Label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={monthDayStart}
                      onChange={(e) => setMonthDayStart(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label>To day of month</Label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={monthDayEnd}
                      onChange={(e) => setMonthDayEnd(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}
              {isHubRoute ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Departure time</Label>
                    <Input
                      type="time"
                      value={departureTime}
                      onChange={(e) => setDepartureTime(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label>Arrival time</Label>
                    <Input
                      type="time"
                      value={arrivalTime}
                      onChange={(e) => setArrivalTime(e.target.value)}
                      required
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Operating start time</Label>
                    <Input
                      type="time"
                      value={operatingStartTime}
                      onChange={(e) => setOperatingStartTime(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label>Operating end time</Label>
                    <Input
                      type="time"
                      value={operatingEndTime}
                      onChange={(e) => setOperatingEndTime(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Zones are available only within the operation date range, on matching
                days (daily / weekly / monthly), and between the start and end times.
                They disappear from the active map outside that window.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <label
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer",
                  available ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"
                )}
              >
                <Checkbox checked={available} onChange={(e) => setAvailable(e.target.checked)} />
                Available for orders
              </label>
              <label
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer",
                  trustForwarder ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"
                )}
              >
                <Checkbox
                  checked={trustForwarder}
                  onChange={(e) => setTrustForwarder(e.target.checked)}
                />
                Trust payment forwarder
              </label>
            </div>

            {isHubRoute ? (
              <div className="space-y-4 rounded-xl border border-border p-4 bg-muted/30">
                <p className="text-sm font-medium">
                  {transportMode === "air" ? "Airport" : "Port"} route terminals
                </p>
                <p className="text-xs text-muted-foreground">
                  Define the departure and arrival {transportMode === "air" ? "airports" : "ports"} for
                  this route. Click the map to place each terminal.
                </p>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={activeHubPick === "departure" ? "primary" : "outline"}
                    onClick={() => setActiveHubPick("departure")}
                  >
                    Place departure
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={activeHubPick === "arrival" ? "primary" : "outline"}
                    onClick={() => setActiveHubPick("arrival")}
                  >
                    Place arrival
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Departure {transportMode === "air" ? "airport" : "port"}</Label>
                    <AddressSearchInput
                      preferTerminals
                      placeholder={
                        transportMode === "air"
                          ? "Search airport (e.g. Toronto Pearson, YYZ)"
                          : "Search port (e.g. Port of Halifax)"
                      }
                      value={departureHub?.name ?? ""}
                      onChange={(text) =>
                        setDepartureHub((prev) => ({
                          name: text,
                          lat: prev?.lat ?? NaN,
                          lng: prev?.lng ?? NaN,
                        }))
                      }
                      onPick={(place: SelectedPlace) => {
                        setActiveHubPick("departure");
                        setDepartureHub({
                          name: hubLabelFromPlace(place),
                          lat: place.lat,
                          lng: place.lng,
                        });
                      }}
                    />
                    {departureHub && Number.isFinite(departureHub.lat) && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {departureHub.lat.toFixed(4)}, {departureHub.lng.toFixed(4)}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>Arrival {transportMode === "air" ? "airport" : "port"}</Label>
                    <AddressSearchInput
                      preferTerminals
                      placeholder={
                        transportMode === "air"
                          ? "Search airport (e.g. Montreal, YUL)"
                          : "Search port (e.g. Port of Montreal)"
                      }
                      value={arrivalHub?.name ?? ""}
                      onChange={(text) =>
                        setArrivalHub((prev) => ({
                          name: text,
                          lat: prev?.lat ?? NaN,
                          lng: prev?.lng ?? NaN,
                        }))
                      }
                      onPick={(place: SelectedPlace) => {
                        setActiveHubPick("arrival");
                        setArrivalHub({
                          name: hubLabelFromPlace(place),
                          lat: place.lat,
                          lng: place.lng,
                        });
                      }}
                    />
                    {arrivalHub && Number.isFinite(arrivalHub.lat) && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {arrivalHub.lat.toFixed(4)}, {arrivalHub.lng.toFixed(4)}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Tip: search for the {transportMode === "air" ? "airport" : "port"} by name, or
                  click the map to drop a terminal manually.
                </p>

                {hubWaterWarning && (
                  <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    {hubWaterWarning}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <Label>Define zone by</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={mode === "draw" ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setMode("draw")}
                  >
                    <PenLine className="h-4 w-4" />
                    H3 cells
                  </Button>
                  <Button
                    type="button"
                    variant={mode === "geofence" ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setMode("geofence")}
                  >
                    <Pentagon className="h-4 w-4" />
                    Geofence
                  </Button>
                  <Button
                    type="button"
                    variant={mode === "manual" ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setMode("manual")}
                  >
                    <Hexagon className="h-4 w-4" />
                    Cell IDs
                  </Button>
                </div>
              </div>
            )}

            {!isHubRoute && mode === "manual" && (
              <div>
                <Label>H3 Cell IDs (comma or newline separated)</Label>
                <textarea
                  className={cn(
                    "mt-1 flex min-h-[120px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  )}
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="87283473fffffff&#10;87283475fffffff"
                />
                {invalidManual.length > 0 && (
                  <p className="text-xs text-danger mt-1">
                    {invalidManual.length} cell ID(s) are invalid or don&apos;t match resolution{" "}
                    {resolutionNum}
                  </p>
                )}
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              {isHubRoute ? (
                <>
                  Terminals placed:{" "}
                  <span className="font-semibold text-foreground">
                    {(departureHub && Number.isFinite(departureHub.lat) ? 1 : 0) +
                      (arrivalHub && Number.isFinite(arrivalHub.lat) ? 1 : 0)}
                  </span>{" "}
                  / 2
                </>
              ) : mode === "geofence" ? (
                <>
                  Geofence vertices:{" "}
                  <span className="font-semibold text-foreground">{boundary.length}</span>
                  {boundary.length >= 3 && (
                    <span className="text-success ml-1">(ready to save)</span>
                  )}
                </>
              ) : (
                <>
                  Selected cells:{" "}
                  <span className="font-semibold text-foreground">{selectedCells.length}</span>
                </>
              )}
            </p>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="button" variant="danger" onClick={clearSelection}>
                Clear
              </Button>
              <Button type="button" variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editingZone ? "Update Zone" : "Save Zone"}
              </Button>
            </div>
          </div>

          <div
            className="relative w-full min-h-0 xl:sticky xl:top-4"
            style={{ height: DRIVER_ZONE_FORM_MAP_HEIGHT }}
          >
            <H3MapView
              height="100%"
              resolution={isHubRoute ? HUB_ROUTE_RESOLUTION : resolutionNum}
              selectedCells={selectedCellsForMap}
              onCellsChange={!isHubRoute && mode === "draw" ? setSelectedCells : undefined}
              geofenceEnabled={!isHubRoute && mode === "geofence"}
              boundary={boundary}
              onBoundaryChange={!isHubRoute && mode === "geofence" ? setBoundary : undefined}
              geofenceAppendOnMapClick={!editingZone}
              savedZones={savedZonesForMap}
              conversion={conversion}
              drawEnabled={!isHubRoute && mode === "draw"}
              focusZone={editingZone}
              interactive
              hubPlacementEnabled={isHubRoute}
              hubTransportMode={transportMode === "sea" ? "sea" : "air"}
              activeHubPick={activeHubPick}
              departureHub={departureHub}
              arrivalHub={arrivalHub}
              onDepartureHubChange={setDepartureHub}
              onArrivalHubChange={setArrivalHub}
            />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
