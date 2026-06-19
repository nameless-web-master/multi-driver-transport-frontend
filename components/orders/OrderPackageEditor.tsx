"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import type { Order } from "@/types";
import { updateOrderPackage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrderPackageSummary } from "@/components/orders/OrderPackageSummary";
import {
  PackageListFields,
  packagesFormEntryFromOrder,
  parsePackageFormEntries,
  type PackageFormEntry,
} from "@/components/orders/PackageListFields";

interface Props {
  order: Order;
  canEdit: boolean;
  onUpdated?: (order: Order) => void;
  onCostsRecalculated?: () => void;
  onMessage?: (text: string, type?: "success" | "error") => void;
}

export function OrderPackageEditor({
  order,
  canEdit,
  onUpdated,
  onCostsRecalculated,
  onMessage,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [packages, setPackages] = useState<PackageFormEntry[]>(() =>
    packagesFormEntryFromOrder(order)
  );
  const [description, setDescription] = useState(order.package_description ?? "");

  if (!editing) {
    return (
      <div className="space-y-2">
        <OrderPackageSummary order={order} />
        {canEdit && order.status === "submitted" && (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit package
          </Button>
        )}
      </div>
    );
  }

  async function handleSave() {
    const parsedPackages = parsePackageFormEntries(packages);
    if (!parsedPackages.ok) {
      onMessage?.(parsedPackages.message, "error");
      return;
    }
    setSaving(true);
    try {
      const result = await updateOrderPackage(order.id, {
        packages: parsedPackages.packages,
        package_description: description.trim(),
      });
      onUpdated?.(result.order);
      if (result.route_cost_recalculated) {
        onCostsRecalculated?.();
        onMessage?.("Package updated and route costs recalculated.");
      } else {
        onMessage?.("Package updated. Route costs will refresh when routes are available.");
      }
      setEditing(false);
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Failed to update package", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <PackageListFields packages={packages} onChange={setPackages} />
      <div className="space-y-2">
        <Label>Description</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save package
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={() => setEditing(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
