"use client";

import type { Order } from "@/types";
import {
  PACKAGE_TYPE_LABELS,
  formatPackageDimensions,
  rollupOrderTotalsFromPackages,
  type OrderPackageEntry,
  type PackageType,
} from "@/lib/pricing";

function resolvePackages(order: Pick<Order, "package_type" | "packages" | "weight_lbs" | "package_length" | "package_width" | "package_height">): OrderPackageEntry[] {
  if (order.packages?.length) {
    return order.packages;
  }
  if (
    order.package_type != null &&
    order.weight_lbs != null &&
    order.package_length != null &&
    order.package_width != null &&
    order.package_height != null
  ) {
    return [
      {
        package_type: order.package_type,
        weight_lbs: order.weight_lbs,
        package_length: order.package_length,
        package_width: order.package_width,
        package_height: order.package_height,
      },
    ];
  }
  return [];
}

export function OrderPackageSummary({
  order,
}: {
  order: Pick<
    Order,
    | "package_type"
    | "packages"
    | "package_factor"
    | "weight_lbs"
    | "package_length"
    | "package_width"
    | "package_height"
    | "dimensions"
    | "package_description"
  >;
}) {
  const packages = resolvePackages(order);
  const totals =
    packages.length > 0
      ? rollupOrderTotalsFromPackages(packages)
      : {
          weight_lbs: order.weight_lbs,
          dimensions: order.dimensions || "—",
        };

  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div>
          <p className="text-muted-foreground">Packages</p>
          <p className="font-medium">{packages.length || "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Total package factor</p>
          <p className="font-medium">{order.package_factor ?? "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Total weight</p>
          <p className="font-medium">
            {totals.weight_lbs != null ? `${totals.weight_lbs} lb` : "—"}
          </p>
        </div>
      </div>

      {packages.length > 0 ? (
        <div className="space-y-2">
          {packages.map((pkg, index) => (
            <div
              key={index}
              className="rounded-md border border-border/50 bg-background/60 px-2 py-1.5"
            >
              <p className="font-medium">
                Package {index + 1}: {PACKAGE_TYPE_LABELS[pkg.package_type as PackageType]}
              </p>
              <p className="text-muted-foreground">
                {pkg.weight_lbs} lb · {formatPackageDimensions(pkg)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">Package details not set</p>
      )}

      {order.package_description ? (
        <div>
          <p className="text-muted-foreground">Description</p>
          <p className="font-medium">{order.package_description}</p>
        </div>
      ) : null}
    </div>
  );
}
