export const PACKAGE_TYPES = [
  "letter",
  "extra_small",
  "small",
  "medium_small",
  "medium",
  "medium_large",
  "large",
  "extra_large",
  "other",
] as const;

export type PackageType = (typeof PACKAGE_TYPES)[number];

export const MAX_PACKAGES = 6;

export interface OrderPackageEntry {
  package_type: PackageType;
  weight_lbs: number;
  package_length: number;
  package_width: number;
  package_height: number;
}

export const PACKAGE_TYPE_LABELS: Record<PackageType, string> = {
  letter: "Letter",
  extra_small: "Extra Small",
  small: "Small",
  medium_small: "Medium-small",
  medium: "Medium",
  medium_large: "Medium-large",
  large: "Large",
  extra_large: "Extra Large",
  other: "Other",
};

export const PACKAGE_FACTORS: Record<PackageType, number> = {
  letter: 0.01,
  extra_small: 0.01,
  small: 0.02,
  medium_small: 0.022,
  medium: 0.05,
  medium_large: 0.09,
  large: 0.2,
  extra_large: 0.6,
  other: 0.05,
};

export function packageFactorForType(type: PackageType): number {
  return PACKAGE_FACTORS[type];
}

export function totalPackageFactorForTypes(types: readonly PackageType[]): number {
  return types.reduce((sum, type) => sum + packageFactorForType(type), 0);
}

export function totalPackageFactorForEntries(packages: readonly OrderPackageEntry[]): number {
  return totalPackageFactorForTypes(packages.map((p) => p.package_type));
}

export function formatPackageDimensions(
  entry: Pick<OrderPackageEntry, "package_length" | "package_width" | "package_height">
): string {
  return `${entry.package_length} × ${entry.package_width} × ${entry.package_height} in`;
}

export function rollupOrderTotalsFromPackages(packages: readonly OrderPackageEntry[]): {
  weight_lbs: number;
  dimensions: string;
} {
  const weight_lbs = Math.round(packages.reduce((sum, p) => sum + p.weight_lbs, 0) * 1000) / 1000;
  const dimensions =
    packages.length === 1
      ? formatPackageDimensions(packages[0])
      : packages
          .map((p, i) => `#${i + 1}: ${formatPackageDimensions(p)}`)
          .join(" · ");
  return { weight_lbs, dimensions };
}

export function defaultOrderPackageEntry(type: PackageType = "medium"): OrderPackageEntry {
  return {
    package_type: type,
    weight_lbs: 1,
    package_length: 1,
    package_width: 1,
    package_height: 1,
  };
}

export const PRICING_UNITS = {
  weight: "lb",
  dimension: "in",
  distance: "km",
  time: "hr",
} as const;

export const DEFAULT_BOOKING_FEE_RATE = 0.02;

export const DEFAULT_LAND_SPEED_KMH = 50;

/** Format booking fee rate (0.02) as a display percent string. */
export function formatBookingFeePercent(rate: number): string {
  const pct = rate * 100;
  return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2)}%`;
}
