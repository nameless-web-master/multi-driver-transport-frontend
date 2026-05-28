"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MAP_EMPTY_CELLS } from "@/lib/mapConstants";
import type { DriverZone } from "@/types";

const H3MapView = dynamic(() => import("@/components/map/H3MapView").then((m) => m.H3MapView), {
  ssr: false,
  loading: () => <div className="h-48 rounded-xl bg-muted animate-pulse" />,
});

interface MapPreviewCardProps {
  zones: DriverZone[];
}

export function MapPreviewCard({ zones }: MapPreviewCardProps) {
  const resolution = zones[0]?.resolution ?? 9;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Map Preview</CardTitle>
        <Link href="/map-view" className="text-xs text-primary font-medium hover:underline">
          Open map
        </Link>
      </CardHeader>
      <CardContent>
        {zones.length === 0 ? (
          <div className="h-48 rounded-xl border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground">
            Add driver zones to see map preview
          </div>
        ) : (
          <H3MapView
            height={192}
            resolution={resolution}
            selectedCells={MAP_EMPTY_CELLS}
            savedZones={zones}
            interactive={false}
            showZoneTooltips={false}
            zoom={4}
          />
        )}
      </CardContent>
    </Card>
  );
}
