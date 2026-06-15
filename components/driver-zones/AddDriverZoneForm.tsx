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
import { createDriverZone, updateDriverZone } from "@/lib/api";
import {
  chooseResolutionForArea,
  estimateCellCount,
  formatAreaKm2,
  formatDistanceKm,
  haversineKm,
  polygonAreaKm2,
} from "@/lib/geo";
import { cn, currencyLabel } from "@/lib/utils";
import { isHubMode, type HubRole } from "@/lib/transportMode";
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
} from "@/types";

import { H3MapView } from "@/components/map/H3MapViewDynamic";

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
  cost_per_h3_cell: number | null;
  cost_per_km: number | null;
  cost_per_kg: number | null;
  cost_per_volume_unit: number | null;
  time_of_day_factor: number | null;
  minimum_fee: number | null;
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
  const [costPerH3Cell, setCostPerH3Cell] = useState("");
  const [costPerKm, setCostPerKm] = useState("");
  const [costPerKg, setCostPerKg] = useState("");
  const [costPerVolumeUnit, setCostPerVolumeUnit] = useState("");
  const [timeOfDayFactor, setTimeOfDayFactor] = useState("");
  const [minimumFee, setMinimumFee] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");
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

  useEffect(() => {
    if (editingZone) {
      setDriverName(editingZone.driver_name);
      setZoneName(editingZone.zone_name);
      setResolution(String(editingZone.resolution));
      setSelectedCells(editingZone.h3_cells);
      setManualText(editingZone.h3_cells.join("\n"));
      setTransportMode(editingZone.transport_mode ?? "land");
      setBaseFee(rateToInput(editingZone.base_fee));
      setCostPerH3Cell(rateToInput(editingZone.cost_per_h3_cell));
      setCostPerKm(rateToInput(editingZone.cost_per_km));
      setCostPerKg(rateToInput(editingZone.cost_per_kg));
      setCostPerVolumeUnit(rateToInput(editingZone.cost_per_volume_unit));
      setTimeOfDayFactor(rateToInput(editingZone.time_of_day_factor));
      setMinimumFee(rateToInput(editingZone.minimum_fee));
      setCurrency(editingZone.currency ?? "USD");
      setAvailable(editingZone.available ?? true);
      setTrustForwarder(editingZone.trust_payment_forwarder ?? false);
      setDepartureHub(editingZone.departure_hub);
      setArrivalHub(editingZone.arrival_hub);
      setDepartureTime(editingZone.departure_time ?? "");
      setArrivalTime(editingZone.arrival_time ?? "");
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
    setCostPerH3Cell("");
    setCostPerKm("");
    setCostPerKg("");
    setCostPerVolumeUnit("");
    setTimeOfDayFactor("");
    setMinimumFee("");
    setCurrency("USD");
    setAvailable(true);
    setTrustForwarder(false);
    setMode("draw");
    setAutoResolution(true);
    setDepartureHub(null);
    setArrivalHub(null);
    setDepartureTime("");
    setArrivalTime("");
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
        base_fee: parseOptionalRate(baseFee, "Base fee"),
        cost_per_h3_cell: parseOptionalRate(costPerH3Cell, "Cost per H3 cell"),
        cost_per_km: parseOptionalRate(costPerKm, "Cost per km"),
        cost_per_kg: parseOptionalRate(costPerKg, "Cost per kg"),
        cost_per_volume_unit: parseOptionalRate(costPerVolumeUnit, "Cost per volume unit"),
        time_of_day_factor: parseOptionalRate(timeOfDayFactor, "Time-of-day factor"),
        minimum_fee: parseOptionalRate(minimumFee, "Minimum fee"),
      };
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Invalid rate value.", "error");
      return;
    }

    // Land zones are priced per H3 cell; air/sea (line) zones per km. Drop the
    // field that doesn't apply to the chosen transport type.
    if (isHubRoute) {
      rateFields.cost_per_h3_cell = null;
    } else {
      rateFields.cost_per_km = null;
    }

    const finalZoneName = zoneName.trim() || `${driverName.trim()} Zone`;

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
    } else if (mode === "geofence") {
      if (boundary.length < 3) {
        onMessage("Draw a geofence with at least 3 points on the map.", "error");
        return;
      }
    } else if (selectedCells.length === 0) {
      onMessage("Select at least one H3 cell.", "error");
      return;
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
          departure_time: departureTime.trim() || null,
          arrival_time: arrivalTime.trim() || null,
          ...rateFields,
          currency,
          available,
          trust_payment_forwarder: trustForwarder,
        }
      : {
          driver_name: driverName.trim(),
          zone_name: finalZoneName,
          resolution: resolutionNum,
          transport_mode: transportMode,
          ...rateFields,
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
                    <Label>Pricing rules</Label>
                    <p className="text-xs text-muted-foreground">
                      {isHubRoute
                        ? "Air/sea legs are a line between terminals — priced per km of the route."
                        : "Land zones are made of H3 cells — priced per cell."}{" "}
                      Leave all blank to mark the segment as “missing cost” (manual
                      entry required at route time).
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
                    <Label className="text-xs">Base fee</Label>
                    <Input
                      inputMode="decimal"
                      placeholder="e.g. 20"
                      value={baseFee}
                      onChange={(e) => setBaseFee(e.target.value)}
                    />
                  </div>
                  {isHubRoute ? (
                    <div>
                      <Label className="text-xs">Cost per km</Label>
                      <Input
                        inputMode="decimal"
                        placeholder="e.g. 1.5"
                        value={costPerKm}
                        onChange={(e) => setCostPerKm(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div>
                      <Label className="text-xs">Cost per H3 cell</Label>
                      <Input
                        inputMode="decimal"
                        placeholder="e.g. 2"
                        value={costPerH3Cell}
                        onChange={(e) => setCostPerH3Cell(e.target.value)}
                      />
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">Cost per kg</Label>
                    <Input
                      inputMode="decimal"
                      placeholder="e.g. 1"
                      value={costPerKg}
                      onChange={(e) => setCostPerKg(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Cost per volume unit</Label>
                    <Input
                      inputMode="decimal"
                      placeholder="e.g. 0.05"
                      value={costPerVolumeUnit}
                      onChange={(e) => setCostPerVolumeUnit(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Time-of-day factor</Label>
                    <Input
                      inputMode="decimal"
                      placeholder="e.g. 1.2"
                      value={timeOfDayFactor}
                      onChange={(e) => setTimeOfDayFactor(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Minimum fee</Label>
                    <Input
                      inputMode="decimal"
                      placeholder="e.g. 10"
                      value={minimumFee}
                      onChange={(e) => setMinimumFee(e.target.value)}
                    />
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Departure time (optional)</Label>
                    <Input
                      type="time"
                      value={departureTime}
                      onChange={(e) => setDepartureTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Arrival time (optional)</Label>
                    <Input
                      type="time"
                      value={arrivalTime}
                      onChange={(e) => setArrivalTime(e.target.value)}
                    />
                  </div>
                </div>

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

          <div className="min-h-[360px]">
            <H3MapView
              height={360}
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
