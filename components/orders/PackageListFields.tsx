"use client";

import {
  MAX_PACKAGES,
  PACKAGE_TYPE_LABELS,
  PACKAGE_TYPES,
  PRICING_UNITS,
  defaultOrderPackageEntry,
  packageFactorForType,
  totalPackageFactorForEntries,
  type OrderPackageEntry,
  type PackageType,
} from "@/lib/pricing";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export interface PackageFormEntry {
  package_type: PackageType;
  weight_lbs: string;
  package_length: string;
  package_width: string;
  package_height: string;
}

export function packageFormEntryFromOrder(entry: OrderPackageEntry): PackageFormEntry {
  return {
    package_type: entry.package_type,
    weight_lbs: String(entry.weight_lbs),
    package_length: String(entry.package_length),
    package_width: String(entry.package_width),
    package_height: String(entry.package_height),
  };
}

export function packagesFormEntryFromOrder(order: {
  packages?: OrderPackageEntry[];
  package_type?: PackageType | null;
  weight_lbs?: number | null;
  package_length?: number | null;
  package_width?: number | null;
  package_height?: number | null;
}): PackageFormEntry[] {
  if (order.packages?.length) {
    return order.packages.map(packageFormEntryFromOrder);
  }
  if (
    order.package_type &&
    order.weight_lbs != null &&
    order.package_length != null &&
    order.package_width != null &&
    order.package_height != null
  ) {
    return [
      packageFormEntryFromOrder({
        package_type: order.package_type,
        weight_lbs: order.weight_lbs,
        package_length: order.package_length,
        package_width: order.package_width,
        package_height: order.package_height,
      }),
    ];
  }
  return [packageFormEntryFromOrder(defaultOrderPackageEntry())];
}

export function parsePackageFormEntries(
  entries: PackageFormEntry[]
): { ok: true; packages: OrderPackageEntry[] } | { ok: false; message: string } {
  const packages: OrderPackageEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const weight = Number(entry.weight_lbs.trim());
    const length = Number(entry.package_length.trim());
    const width = Number(entry.package_width.trim());
    const height = Number(entry.package_height.trim());
    if (!Number.isFinite(weight) || weight <= 0) {
      return { ok: false, message: `Package ${i + 1}: enter a valid weight in lbs` };
    }
    if (!Number.isFinite(length) || length <= 0) {
      return { ok: false, message: `Package ${i + 1}: enter a valid length in inches` };
    }
    if (!Number.isFinite(width) || width <= 0) {
      return { ok: false, message: `Package ${i + 1}: enter a valid width in inches` };
    }
    if (!Number.isFinite(height) || height <= 0) {
      return { ok: false, message: `Package ${i + 1}: enter a valid height in inches` };
    }
    packages.push({
      package_type: entry.package_type,
      weight_lbs: weight,
      package_length: length,
      package_width: width,
      package_height: height,
    });
  }
  return { ok: true, packages };
}

interface Props {
  packages: PackageFormEntry[];
  onChange: (packages: PackageFormEntry[]) => void;
}

export function PackageListFields({ packages, onChange }: Props) {
  const parsed = parsePackageFormEntries(packages);
  const totalFactor = parsed.ok
    ? totalPackageFactorForEntries(parsed.packages)
    : totalPackageFactorForEntries(
        packages.map((p) => ({ ...defaultOrderPackageEntry(p.package_type), package_type: p.package_type }))
      );
  const totalWeight = parsed.ok
    ? Math.round(parsed.packages.reduce((sum, p) => sum + p.weight_lbs, 0) * 1000) / 1000
    : null;

  function setCount(nextCount: number) {
    const clamped = Math.min(MAX_PACKAGES, Math.max(1, nextCount));
    const next = [...packages];
    while (next.length < clamped) {
      next.push(packageFormEntryFromOrder(defaultOrderPackageEntry()));
    }
    while (next.length > clamped) {
      next.pop();
    }
    onChange(next);
  }

  function updateAt(index: number, patch: Partial<PackageFormEntry>) {
    const next = packages.map((pkg, i) => (i === index ? { ...pkg, ...patch } : pkg));
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Number of packages</Label>
          <Select value={String(packages.length)} onChange={(e) => setCount(Number(e.target.value))}>
            {Array.from({ length: MAX_PACKAGES }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Total package factor</Label>
          <p className="text-sm font-medium pt-2">{totalFactor}</p>
        </div>
        <div className="space-y-2">
          <Label>Total weight ({PRICING_UNITS.weight})</Label>
          <p className="text-sm font-medium pt-2">{totalWeight ?? "—"}</p>
        </div>
      </div>

      <div className="space-y-4">
        {packages.map((pkg, index) => (
          <div
            key={index}
            className="rounded-lg border border-border/70 bg-muted/20 p-4 space-y-3"
          >
            <p className="text-sm font-medium">Package {index + 1}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                <Label>Type</Label>
                <Select
                  value={pkg.package_type}
                  onChange={(e) => updateAt(index, { package_type: e.target.value as PackageType })}
                >
                  {PACKAGE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {PACKAGE_TYPE_LABELS[t]} (×{packageFactorForType(t)})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Weight ({PRICING_UNITS.weight})</Label>
                <Input
                  inputMode="decimal"
                  value={pkg.weight_lbs}
                  onChange={(e) => updateAt(index, { weight_lbs: e.target.value })}
                  placeholder="e.g. 10"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Length ({PRICING_UNITS.dimension})</Label>
                <Input
                  inputMode="decimal"
                  value={pkg.package_length}
                  onChange={(e) => updateAt(index, { package_length: e.target.value })}
                  placeholder="e.g. 40"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Width ({PRICING_UNITS.dimension})</Label>
                <Input
                  inputMode="decimal"
                  value={pkg.package_width}
                  onChange={(e) => updateAt(index, { package_width: e.target.value })}
                  placeholder="e.g. 30"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Height ({PRICING_UNITS.dimension})</Label>
                <Input
                  inputMode="decimal"
                  value={pkg.package_height}
                  onChange={(e) => updateAt(index, { package_height: e.target.value })}
                  placeholder="e.g. 20"
                  required
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
