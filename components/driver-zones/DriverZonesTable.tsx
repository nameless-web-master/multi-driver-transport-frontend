"use client";

import { Eye, Pencil, Plane, Ship, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { DriverZone } from "@/types";

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
];

function driverInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function ModeIcon({ mode }: { mode: string }) {
  if (mode === "air") return <Plane className="h-3.5 w-3.5" aria-label="air" />;
  if (mode === "sea") return <Ship className="h-3.5 w-3.5" aria-label="sea" />;
  return <Truck className="h-3.5 w-3.5" aria-label="land" />;
}

interface Props {
  zones: DriverZone[];
  onAdd?: () => void;
  onView: (zone: DriverZone) => void;
  onEdit?: (zone: DriverZone) => void;
  onDelete?: (zone: DriverZone) => void;
}

export function DriverZonesTable({ zones, onAdd, onView, onEdit, onDelete }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Driver Zones</CardTitle>
        {onAdd && (
          <Button size="sm" onClick={onAdd}>
            + Add Driver Zone
          </Button>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-3 pr-4 font-medium">Driver</th>
              <th className="py-3 pr-4 font-medium">Zone</th>
              <th className="py-3 pr-4 font-medium">Mode</th>
              <th className="py-3 pr-4 font-medium">Base fee</th>
              <th className="py-3 pr-4 font-medium">Available</th>
              <th className="py-3 pr-4 font-medium">Trust forwarder</th>
              <th className="py-3 pr-4 font-medium">Cells</th>
              <th className="py-3 pr-4 font-medium">Created</th>
              <th className="py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {zones.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted-foreground">
                  No driver zones yet.
                </td>
              </tr>
            )}
            {zones.map((zone, idx) => (
              <tr key={zone.id} className="border-b border-border/70 last:border-0">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-8 w-8 rounded-full text-white text-xs font-bold flex items-center justify-center ${AVATAR_COLORS[idx % AVATAR_COLORS.length]}`}
                    >
                      {driverInitial(zone.driver_name)}
                    </span>
                    <span className="font-medium">{zone.driver_name}</span>
                  </div>
                </td>
                <td className="py-3 pr-4">{zone.zone_name}</td>
                <td className="py-3 pr-4">
                  <span className="inline-flex items-center gap-1.5 capitalize">
                    <ModeIcon mode={zone.transport_mode} />
                    {zone.transport_mode}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  {zone.base_fee != null
                    ? formatCurrency(Number(zone.base_fee), zone.currency)
                    : "—"}
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      zone.available
                        ? "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20"
                        : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border border-zinc-500/20"
                    }`}
                  >
                    {zone.available ? "Yes" : "No"}
                  </span>
                </td>
                <td className="py-3 pr-4">{zone.trust_payment_forwarder ? "Yes" : "No"}</td>
                <td className="py-3 pr-4">{zone.cell_count}</td>
                <td className="py-3 pr-4 text-muted-foreground">{formatDate(zone.created_at)}</td>
                <td className="py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onView(zone)} aria-label="View zone">
                      <Eye className="h-4 w-4" />
                    </Button>
                    {onEdit && (
                      <Button variant="ghost" size="sm" onClick={() => onEdit(zone)} aria-label="Edit zone">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {onDelete && (
                      <Button variant="ghost" size="sm" onClick={() => onDelete(zone)} aria-label="Delete zone">
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
