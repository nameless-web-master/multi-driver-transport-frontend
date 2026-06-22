"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Route, ShieldCheck } from "lucide-react";
import { ConfirmationPanel } from "@/components/orders/ConfirmationPanel";
import { TransporterOrdersPanel } from "@/components/orders/TransporterOrdersPanel";
import { getTransporterConfirmations } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { TransporterConfirmationItem } from "@/types";

type TabId = "confirmations" | "my-routes";

export function ConfirmationsPage() {
  const [tab, setTab] = useState<TabId>("confirmations");
  const [items, setItems] = useState<TransporterConfirmationItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const hasDataRef = useRef(false);
  const [banner, setBanner] = useState<{ text: string; type: "success" | "error" } | null>(null);

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
        setBanner({
          text: err instanceof Error ? err.message : "Failed to load confirmations",
          type: "error",
        });
      }
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  function showMessage(text: string, type: "success" | "error" = "success") {
    setBanner({ text, type });
    setTimeout(() => setBanner(null), 4000);
  }

  const pendingCount = items.filter((i) => i.status === "pending").length;

  if (initialLoading && tab === "confirmations") {
    return (
      <div className="px-6 pb-8 flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading confirmation requests…
      </div>
    );
  }

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
      <div className="px-6 pb-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Transporter workspace</h2>
              <p className="text-xs text-muted-foreground">
                Review confirmation requests and track assigned routes.
              </p>
            </div>
          </div>
          <div className="flex rounded-lg border border-border p-0.5 text-sm">
            <TabButton
              active={tab === "confirmations"}
              onClick={() => setTab("confirmations")}
              label="Confirmations"
              badge={pendingCount > 0 ? pendingCount : undefined}
            />
            <TabButton
              active={tab === "my-routes"}
              onClick={() => setTab("my-routes")}
              label="My routes"
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
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
      {badge != null && badge > 0 && (
        <span
          className={cn(
            "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            active ? "bg-primary-foreground/20" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
