"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, DollarSign, Loader2, Package, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTransporterConfirmations, getTransporterQuoteQueue } from "@/lib/api";
import { cn } from "@/lib/utils";

interface WorkCounts {
  pendingConfirmations: number;
  quotesNeeded: number;
  activeShipments: number;
}

interface TaskLinkProps {
  href: string;
  label: string;
  description: string;
  count: number;
  icon: React.ReactNode;
  accent?: "amber" | "violet" | "blue";
}

const ACCENT: Record<NonNullable<TaskLinkProps["accent"]>, string> = {
  amber: "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50",
  violet: "border-violet-500/30 bg-violet-500/5 hover:border-violet-500/50",
  blue: "border-primary/30 bg-primary/5 hover:border-primary/50",
};

function TaskLink({ href, label, description, count, icon, accent = "blue" }: TaskLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors",
        ACCENT[accent]
      )}
    >
      <div className="h-10 w-10 rounded-lg bg-background border border-border flex items-center justify-center shrink-0 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{label}</p>
          {count > 0 && (
            <span className="rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-semibold tabular-nums">
              {count}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </Link>
  );
}

export function TransporterWorkSummary() {
  const [counts, setCounts] = useState<WorkCounts | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [confirmations, quotes] = await Promise.all([
        getTransporterConfirmations(),
        getTransporterQuoteQueue(),
      ]);
      const pendingConfirmations = confirmations.filter((i) => i.status === "pending").length;
      const quotesNeeded = quotes.filter(
        (q) => q.segment.cost_status === "requested" || q.segment.cost_status === "missing"
      ).length;
      const activeOrderIds = new Set(
        confirmations
          .filter((i) => i.status === "accepted" && i.route_selection_status === "confirmed")
          .map((i) => i.order_id)
      );
      setCounts({
        pendingConfirmations,
        quotesNeeded,
        activeShipments: activeOrderIds.size,
      });
    } catch {
      setCounts({ pendingConfirmations: 0, quotesNeeded: 0, activeShipments: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">What needs your attention</CardTitle>
        <p className="text-xs text-muted-foreground">
          Start here for shipment requests, pricing, and active deliveries.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your work queue…
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <TaskLink
              href="/transporter/confirmations"
              label="Shipment requests"
              description="Accept, reject, or update leg status"
              count={counts?.pendingConfirmations ?? 0}
              icon={<CheckCircle2 className="h-5 w-5" />}
              accent="amber"
            />
            <TaskLink
              href="/quote-requests"
              label="Set prices"
              description="Enter costs for requested segments"
              count={counts?.quotesNeeded ?? 0}
              icon={<DollarSign className="h-5 w-5" />}
              accent="violet"
            />
            <TaskLink
              href="/transporter/confirmations?tab=my-routes"
              label="Active shipments"
              description="Track deliveries you accepted"
              count={counts?.activeShipments ?? 0}
              icon={<Truck className="h-5 w-5" />}
              accent="blue"
            />
          </div>
        )}
        {!loading && counts && counts.pendingConfirmations === 0 && counts.quotesNeeded === 0 && (
          <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" />
            No urgent tasks right now. Check active shipments or update your zones.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
