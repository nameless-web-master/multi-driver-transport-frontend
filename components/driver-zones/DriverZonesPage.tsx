"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Shapes, Star, Users } from "lucide-react";
import { AddDriverZoneForm } from "@/components/driver-zones/AddDriverZoneForm";
import { DriverZonesTable } from "@/components/driver-zones/DriverZonesTable";
import { ZoneDetailCard } from "@/components/driver-zones/ZoneDetailCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { MAP_EMPTY_CELLS } from "@/lib/mapConstants";
import { deleteDriverZone, listDriverZones } from "@/lib/api";
import type { DriverZone } from "@/types";

const H3MapView = dynamic(() => import("@/components/map/H3MapView").then((m) => m.H3MapView), {
  ssr: false,
  loading: () => <div className="h-[360px] rounded-xl bg-muted animate-pulse" />,
});

export function DriverZonesPage() {
  const { user } = useAuth();
  const [zones, setZones] = useState<DriverZone[]>([]);
  const [viewZone, setViewZone] = useState<DriverZone | null>(null);
  const [editingZone, setEditingZone] = useState<DriverZone | null>(null);
  const [banner, setBanner] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const refreshZones = useCallback(async () => {
    try {
      const data = await listDriverZones();
      setZones(data);
      setViewZone((prev) => (prev ? data.find((z) => z.id === prev.id) ?? null : null));
    } catch (err) {
      setBanner({
        text: err instanceof Error ? err.message : "Failed to load zones",
        type: "error",
      });
    }
  }, []);

  useEffect(() => {
    refreshZones();
  }, [refreshZones]);

  function showMessage(text: string, type: "success" | "error" = "success") {
    setBanner({ text, type });
    setTimeout(() => setBanner(null), 4000);
  }

  async function handleDelete(zone: DriverZone) {
    if (!confirm(`Delete zone "${zone.zone_name}"?`)) return;
    try {
      await deleteDriverZone(zone.id);
      if (viewZone?.id === zone.id) setViewZone(null);
      if (editingZone?.id === zone.id) setEditingZone(null);
      await refreshZones();
      showMessage("Zone deleted.");
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Delete failed", "error");
    }
  }

  const availableCount = zones.filter((z) => z.available).length;
  const totalCells = zones.reduce((s, z) => s + z.cell_count, 0);

  return (
    <>
      {banner && (
        <div
          className={`mx-6 mb-4 rounded-xl border px-4 py-3 text-sm ${
            banner.type === "success"
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="px-6 pb-8 space-y-6">
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatTile
            icon={<Shapes className="h-5 w-5" />}
            label="Total zones"
            value={String(zones.length)}
            sub={`${availableCount} available · ${totalCells} cells`}
          />
          <StatTile
            icon={<Star className="h-5 w-5" />}
            label="Trustworthiness"
            value={String(user?.trustworthiness ?? 0)}
            sub="Increases when senders/receivers follow you"
          />
          <StatTile
            icon={<Users className="h-5 w-5" />}
            label="Driver"
            value={user?.full_name ?? "—"}
            sub={user?.company_name || "—"}
          />
        </section>

        <AddDriverZoneForm
          zones={zones}
          conversion={null}
          editingZone={editingZone}
          onSaved={refreshZones}
          onCancelEdit={() => setEditingZone(null)}
          onMessage={showMessage}
        />

        <DriverZonesTable
          zones={zones}
          onView={(z) => setViewZone(z)}
          onEdit={(z) => setEditingZone(z)}
          onDelete={handleDelete}
        />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ZoneDetailCard zone={viewZone} conversion={null} />
          {viewZone && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Zone Map</CardTitle>
              </CardHeader>
              <CardContent>
                <H3MapView
                  height={320}
                  resolution={viewZone.resolution}
                  selectedCells={MAP_EMPTY_CELLS}
                  savedZones={zones}
                  interactive
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tracking-tight truncate">{value}</p>
            {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
