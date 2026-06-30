"use client";

import { Clock } from "lucide-react";
import type { ScheduleInactiveZone } from "@/types";

interface Props {
  zones: ScheduleInactiveZone[];
  className?: string;
}

function coversLabel(covers: ScheduleInactiveZone["covers"]): string {
  if (covers === "both") return "pickup and destination";
  if (covers === "pickup") return "pickup";
  return "destination";
}

export function ScheduleInactiveNotice({ zones, className }: Props) {
  if (zones.length === 0) return null;

  return (
    <div
      className={
        className ??
        "rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm text-sky-950 dark:text-sky-100 space-y-2"
      }
    >
      <div className="flex items-start gap-2">
        <Clock className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">Some transporters are outside their operating hours</p>
          <p className="text-xs opacity-90">
            Routes only include transporters whose schedule is active right now. The zones below
            cover this location but are unavailable until their next operating window.
          </p>
        </div>
      </div>
      <ul className="space-y-1.5 text-xs pl-6">
        {zones.map((z) => (
          <li key={z.zone_id}>
            <span className="font-medium">{z.transport_name}</span>
            <span className="text-muted-foreground"> · {z.zone_name}</span>
            <span className="block text-muted-foreground">
              Covers {coversLabel(z.covers)}
              {z.schedule_summary ? ` · ${z.schedule_summary}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
