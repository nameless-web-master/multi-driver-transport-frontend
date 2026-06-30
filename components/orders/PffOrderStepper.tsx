"use client";

import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isPffPaymentMethod } from "@/lib/paymentFlow";
import type { Order, RouteConfirmationStatus, RouteSelection } from "@/types";

const STEPS = [
  {
    id: 1,
    title: "Place order with PFF",
    hint: "Choose Payment Forwarded First when submitting. The producer must confirm.",
  },
  {
    id: 2,
    title: "Select route & send confirm path",
    hint: "Pick one route (up to 25 options), then confirm path with each transporter on the round trip.",
  },
  {
    id: 3,
    title: "Wait for transporter confirmations",
    hint: "Each transporter on the route must accept their segment before pickup can be scheduled.",
  },
  {
    id: 4,
    title: "Send pickup available",
    hint: "After all confirm, notify that payment package (cheque/cash) is ready for the delivering transporter.",
  },
] as const;

function activeStepIndex(
  order: Order,
  selection: RouteSelection | null,
  confirmation: RouteConfirmationStatus | null
): number {
  if (order.tracking_status === "AWAITING_CONNECT") return 1;
  if (!selection?.selected_route_id) return 2;
  if (confirmation?.selection_status !== "confirmed") return 3;
  if (!order.pickup_ready_at) return 4;
  return 5;
}

interface Props {
  order: Order;
  selection: RouteSelection | null;
  confirmation: RouteConfirmationStatus | null;
  onMarkPickupAvailable?: () => void;
  pickupUpdating?: boolean;
  className?: string;
}

export function PffOrderStepper({
  order,
  selection,
  confirmation,
  onMarkPickupAvailable,
  pickupUpdating = false,
  className,
}: Props) {
  if (!isPffPaymentMethod(order.payment_method)) return null;

  const active = activeStepIndex(order, selection, confirmation);
  const routeConfirmed = confirmation?.selection_status === "confirmed";
  const canPickup =
    routeConfirmed &&
    !order.pickup_ready_at &&
    (order.tracking_status === "CONFIRMED" || !order.tracking_status);

  return (
    <div
      className={cn(
        "rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-4",
        className
      )}
    >
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-violet-700 dark:text-violet-300">
          Advanced Payment (PFF) — your next steps
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Round-trip payment flow: route cost includes the return leg (payment package delivery).
        </p>
      </div>

      <div className="space-y-3">
        {STEPS.map((step) => {
          const isComplete = active > step.id;
          const isCurrent = active === step.id;
          const isUpcoming = active < step.id;

          return (
            <div
              key={step.id}
              className={cn(
                "flex gap-3 rounded-lg border px-3 py-2.5",
                isCurrent && "border-violet-500/50 bg-background ring-1 ring-violet-500/20",
                isComplete && "border-green-500/30 bg-green-500/5",
                isUpcoming && "border-border bg-muted/20 opacity-70"
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isComplete && "bg-green-500 text-white",
                  isCurrent && "bg-violet-600 text-white",
                  isUpcoming && "bg-muted text-muted-foreground"
                )}
              >
                {isComplete ? <Check className="h-3.5 w-3.5" /> : step.id}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    isCurrent && "text-violet-900 dark:text-violet-100"
                  )}
                >
                  {step.title}
                </p>
                <p className="text-xs text-muted-foreground">{step.hint}</p>
                {isCurrent && step.id === 1 && order.tracking_status === "AWAITING_CONNECT" && (
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    Waiting for {order.sender_name} to confirm this order…
                  </p>
                )}
                {isCurrent && step.id === 2 && (
                  <p className="text-xs font-medium text-violet-700 dark:text-violet-300">
                    Go to route comparison below → choose a route → Select route (sends confirm
                    path).
                  </p>
                )}
                {isCurrent && step.id === 3 && confirmation && (
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    {confirmation.progress_percent}% confirmed ·{" "}
                    {confirmation.segments.filter((s) => s.status === "accepted").length}/
                    {confirmation.segments.length} transporters accepted
                  </p>
                )}
                {isCurrent && step.id === 4 && canPickup && onMarkPickupAvailable && (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-1"
                    disabled={pickupUpdating}
                    onClick={onMarkPickupAvailable}
                  >
                    {pickupUpdating ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      "Send pickup available"
                    )}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {active >= 5 && (
        <p className="text-xs text-green-700 dark:text-green-300">
          Pickup available sent. Transporters will collect the payment package; the producer prepares
          goods for handoff when notified.
        </p>
      )}

      <Link href={`/orders/${order.id}/tracking`} className="text-xs text-primary hover:underline">
        View full tracking map →
      </Link>
    </div>
  );
}
