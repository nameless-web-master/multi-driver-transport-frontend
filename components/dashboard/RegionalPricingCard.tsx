"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  createPricingRegion,
  deletePricingRegion,
  listPricingRegions,
  updatePricingRegion,
} from "@/lib/api";
import { currencyLabel } from "@/lib/utils";
import { CURRENCIES, type Currency, type PricingRegion } from "@/types";

type RegionDraft = {
  name: string;
  base_fee: string;
  cost_per_km: string;
  cost_per_hour: string;
  currency: Currency;
};

function emptyDraft(): RegionDraft {
  return {
    name: "",
    base_fee: "",
    cost_per_km: "",
    cost_per_hour: "",
    currency: "CAD",
  };
}

function regionToDraft(region: PricingRegion): RegionDraft {
  return {
    name: region.name,
    base_fee: region.base_fee != null ? String(region.base_fee) : "",
    cost_per_km: region.cost_per_km != null ? String(region.cost_per_km) : "",
    cost_per_hour: region.cost_per_hour != null ? String(region.cost_per_hour) : "",
    currency: region.currency,
  };
}

function parseOptionalRate(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) throw new Error("Rates must be non-negative numbers");
  return n;
}

export function RegionalPricingCard() {
  const [regions, setRegions] = useState<PricingRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | "new" | null>(null);
  const [drafts, setDrafts] = useState<Record<number, RegionDraft>>({});
  const [newDraft, setNewDraft] = useState<RegionDraft>(emptyDraft);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPricingRegions();
      setRegions(data);
      setDrafts(
        Object.fromEntries(data.map((r) => [r.id, regionToDraft(r)]))
      );
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Failed to load regions",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveRegion(id: number) {
    const draft = drafts[id];
    if (!draft?.name.trim()) {
      setMessage({ text: "Region name is required.", type: "error" });
      return;
    }
    setSavingId(id);
    setMessage(null);
    try {
      const updated = await updatePricingRegion(id, {
        name: draft.name.trim(),
        base_fee: parseOptionalRate(draft.base_fee),
        cost_per_km: parseOptionalRate(draft.cost_per_km),
        cost_per_hour: parseOptionalRate(draft.cost_per_hour),
        currency: draft.currency,
      });
      setRegions((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setDrafts((prev) => ({ ...prev, [id]: regionToDraft(updated) }));
      setMessage({ text: "Region saved.", type: "success" });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Failed to save region",
        type: "error",
      });
    } finally {
      setSavingId(null);
    }
  }

  async function handleCreate() {
    if (!newDraft.name.trim()) {
      setMessage({ text: "Region name is required.", type: "error" });
      return;
    }
    setSavingId("new");
    setMessage(null);
    try {
      const created = await createPricingRegion({
        name: newDraft.name.trim(),
        base_fee: parseOptionalRate(newDraft.base_fee),
        cost_per_km: parseOptionalRate(newDraft.cost_per_km),
        cost_per_hour: parseOptionalRate(newDraft.cost_per_hour),
        currency: newDraft.currency,
      });
      setRegions((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setDrafts((prev) => ({ ...prev, [created.id]: regionToDraft(created) }));
      setNewDraft(emptyDraft());
      setMessage({ text: "Region created.", type: "success" });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Failed to create region",
        type: "error",
      });
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this pricing region? Zones using it will keep their overrides only.")) {
      return;
    }
    setSavingId(id);
    setMessage(null);
    try {
      await deletePricingRegion(id);
      setRegions((prev) => prev.filter((r) => r.id !== id));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setMessage({ text: "Region deleted.", type: "success" });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Failed to delete region",
        type: "error",
      });
    } finally {
      setSavingId(null);
    }
  }

  function updateDraft(id: number, patch: Partial<RegionDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading regional rates…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Regional defaults for system pricing (e.g. minimum wage per region). Transporters
        on <span className="font-medium text-foreground">system pricing</span> inherit these
        unless they override per zone.
      </p>

      {regions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No regions yet — add one below.</p>
      ) : (
        <div className="space-y-3">
          {regions.map((region) => {
            const draft = drafts[region.id] ?? regionToDraft(region);
            return (
              <div
                key={region.id}
                className="rounded-lg border border-border/70 p-3 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Region name</Label>
                    <Input
                      value={draft.name}
                      onChange={(e) => updateDraft(region.id, { name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Base cost</Label>
                    <Input
                      inputMode="decimal"
                      value={draft.base_fee}
                      onChange={(e) => updateDraft(region.id, { base_fee: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Cost per km</Label>
                    <Input
                      inputMode="decimal"
                      value={draft.cost_per_km}
                      onChange={(e) => updateDraft(region.id, { cost_per_km: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Cost per hour (wage)</Label>
                    <Input
                      inputMode="decimal"
                      value={draft.cost_per_hour}
                      onChange={(e) => updateDraft(region.id, { cost_per_hour: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    className="w-28"
                    value={draft.currency}
                    onChange={(e) =>
                      updateDraft(region.id, { currency: e.target.value as Currency })
                    }
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleSaveRegion(region.id)}
                    disabled={savingId === region.id}
                  >
                    {savingId === region.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(region.id)}
                    disabled={savingId === region.id}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-dashed border-border p-3 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Add region
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs">Region name</Label>
            <Input
              placeholder="e.g. Ontario"
              value={newDraft.name}
              onChange={(e) => setNewDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-xs">Base cost</Label>
            <Input
              inputMode="decimal"
              value={newDraft.base_fee}
              onChange={(e) => setNewDraft((d) => ({ ...d, base_fee: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-xs">Cost per km</Label>
            <Input
              inputMode="decimal"
              value={newDraft.cost_per_km}
              onChange={(e) => setNewDraft((d) => ({ ...d, cost_per_km: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-xs">Cost per hour (wage)</Label>
            <Input
              inputMode="decimal"
              value={newDraft.cost_per_hour}
              onChange={(e) => setNewDraft((d) => ({ ...d, cost_per_hour: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="w-28"
            value={newDraft.currency}
            onChange={(e) =>
              setNewDraft((d) => ({ ...d, currency: e.target.value as Currency }))
            }
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c} title={currencyLabel(c)}>
                {c}
              </option>
            ))}
          </Select>
          <Button type="button" size="sm" onClick={handleCreate} disabled={savingId === "new"}>
            {savingId === "new" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add region
          </Button>
        </div>
      </div>

      {message && (
        <p
          className={`text-xs ${
            message.type === "success" ? "text-emerald-600" : "text-destructive"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
