"use client";

import dynamic from "next/dynamic";
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
  polygonAreaKm2,
} from "@/lib/geo";
import { cn, currencyLabel } from "@/lib/utils";
import {
  CURRENCIES,
  type CellInputMode,
  type ConvertH3Response,
  type Currency,
  type DriverZone,
  type LatLngPoint,
  type TransportMode,
} from "@/types";

const H3MapView = dynamic(() => import("@/components/map/H3MapView").then((m) => m.H3MapView), {
  ssr: false,
  loading: () => (
    <div className="h-[360px] rounded-xl bg-muted animate-pulse flex items-center justify-center text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

const RESOLUTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

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
  const [rateCost, setRateCost] = useState("0");
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

  useEffect(() => {
    if (editingZone) {
      setDriverName(editingZone.driver_name);
      setZoneName(editingZone.zone_name);
      setResolution(String(editingZone.resolution));
      setSelectedCells(editingZone.h3_cells);
      setManualText(editingZone.h3_cells.join("\n"));
      setTransportMode(editingZone.transport_mode ?? "land");
      setRateCost(String(editingZone.rate_cost ?? 0));
      setCurrency(editingZone.currency ?? "USD");
      setAvailable(editingZone.available ?? true);
      setTrustForwarder(editingZone.trust_payment_forwarder ?? false);
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
    setRateCost("0");
    setCurrency("USD");
    setAvailable(true);
    setTrustForwarder(false);
    setMode("draw");
    setAutoResolution(true);
  }, []);

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
    const rate = Number(rateCost);
    if (!Number.isFinite(rate) || rate < 0) {
      onMessage("Rate / cost must be a number ≥ 0.", "error");
      return;
    }

    const finalZoneName = zoneName.trim() || `${driverName.trim()} Zone`;

    if (mode === "geofence") {
      if (boundary.length < 3) {
        onMessage("Draw a geofence with at least 3 points on the map.", "error");
        return;
      }
    } else if (selectedCells.length === 0) {
      onMessage("Select at least one H3 cell.", "error");
      return;
    }

    const payload = {
      driver_name: driverName.trim(),
      zone_name: finalZoneName,
      resolution: resolutionNum,
      transport_mode: transportMode,
      rate_cost: rate,
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div>
                <Label>Rate / Cost</Label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={rateCost}
                    onChange={(e) => setRateCost(e.target.value)}
                  />
                  <Select
                    className="w-28"
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
              </div>
            </div>

            <div>
              <Label>Transport mode</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {TRANSPORT_OPTIONS.map(({ mode: m, label, icon: Icon }) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTransportMode(m)}
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

            {mode === "manual" && (
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
              {mode === "geofence" ? (
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
              resolution={resolutionNum}
              selectedCells={selectedCellsForMap}
              onCellsChange={mode === "draw" ? setSelectedCells : undefined}
              geofenceEnabled={mode === "geofence"}
              boundary={boundary}
              onBoundaryChange={mode === "geofence" ? setBoundary : undefined}
              /*
                When editing an existing geofence the user is mostly fine-
                tuning the polygon, so clicks on empty map shouldn't keep
                appending new vertices — that's a creation-time UX. They
                can still drag points and click an edge to insert one.
              */
              geofenceAppendOnMapClick={!editingZone}
              savedZones={savedZonesForMap}
              conversion={conversion}
              drawEnabled={mode === "draw"}
              focusZone={editingZone}
              interactive
            />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
