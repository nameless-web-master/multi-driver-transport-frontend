"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Route, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { ConfirmationPanel } from "@/components/orders/ConfirmationPanel";
import { TransporterOrdersPanel } from "@/components/orders/TransporterOrdersPanel";
import { getTransporterConfirmations } from "@/lib/api";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { TransporterConfirmationItem } from "@/types";

type TabId = "confirmations" | "my-routes";

export function ConfirmationsPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "my-routes" ? "my-routes" : "confirmations";
  const [tab, setTab] = useState<TabId>(initialTab);
  const [items, setItems] = useState<TransporterConfirmationItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const hasDataRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent && !hasDataRef.current) {
      setInitialLoading(true);
    }
    try {
      const data = await getTransporterConfirmations();
      setItems(data);
      hasDataRef.current = true;
    } catch (err) {
      if (!hasDataRef.current) {
        showToast(
          err instanceof Error ? err.message : "Failed to load confirmations",
          "error",
        );
      }
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    const nextTab = searchParams.get("tab") === "my-routes" ? "my-routes" : "confirmations";
    setTab(nextTab);
  }, [searchParams]);

  useEffect(() => {
    void load(false);
  }, [load]);

  function showMessage(text: string, type: "success" | "error" = "success") {
    showToast(text, type);
  }

  const pendingCount = items.filter((i) => i.status === "pending").length;

  if (initialLoading && tab === "confirmations") {
    return (
      <div className="px-6 pb-8 flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading shipment requests…
      </div>
    );
  }

  return (
    <>
      <div className="px-6 pb-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">My shipments</h2>
              <p className="text-xs text-muted-foreground">
                Respond to requests, set prices, and track deliveries on your routes.
              </p>
            </div>
          </div>
          <div className="flex rounded-lg border border-border p-0.5 text-sm">
            <TabButton
              active={tab === "confirmations"}
              onClick={() => setTab("confirmations")}
              label="Requests"
              badge={pendingCount > 0 ? pendingCount : undefined}
            />
            <TabButton
              active={tab === "my-routes"}
              onClick={() => setTab("my-routes")}
              label="Active"
              icon={<Route className="h-3.5 w-3.5" />}
            />
          </div>
        </div>

        {tab === "confirmations" ? (
          <ConfirmationPanel
            items={items}
            onUpdated={() => void load(true)}
            onMessage={showMessage}
          />
        ) : (
          <TransporterOrdersPanel />
        )}
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  label,
  badge,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
      {badge != null && badge > 0 && (
        <span
          className={cn(
            "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            active
              ? "bg-primary-foreground/20"
              : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
