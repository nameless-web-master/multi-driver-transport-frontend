"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CreditCard, FileText, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { paymentMethodLabel } from "@/lib/paymentFlow";
import { formatDate } from "@/lib/utils";
import type { Order } from "@/types";
import { RejectInquiryDialog } from "@/components/orders/RejectInquiryDialog";

export function inquiryDescription(order: Pick<Order, "package_description" | "notes">): string {
  return order.package_description?.trim() || order.notes?.trim() || "";
}

interface Props {
  open: boolean;
  order: Order | null;
  canAct: boolean;
  accepting?: boolean;
  rejecting?: boolean;
  onClose: () => void;
  onAccept: () => void;
  onReject: (reason: string) => Promise<void>;
}

export function InquiryReviewPanel({
  open,
  order,
  canAct,
  accepting = false,
  rejecting = false,
  onClose,
  onAccept,
  onReject,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setRejectOpen(false);
      return;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !accepting && !rejecting && !rejectOpen) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, accepting, rejecting, rejectOpen, onClose]);

  if (!open || !order || !mounted) return null;

  const description = inquiryDescription(order);
  const busy = accepting || rejecting;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inquiry-review-title"
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
          aria-label="Close"
          disabled={busy}
          onClick={onClose}
        />
        <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-violet-500/30 bg-card shadow-xl">
          <div className="flex items-start justify-between gap-3 border-b border-border bg-violet-500/5 px-5 py-4">
            <div className="min-w-0 space-y-1">
              <h2 id="inquiry-review-title" className="text-base font-semibold">
                Shipment request from {order.receiver_name}
              </h2>
              <p className="text-xs text-muted-foreground">
                Submitted {formatDate(order.submitted_at)} · Review payment and description before
                accepting.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Close"
              disabled={busy}
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CreditCard className="h-3.5 w-3.5" />
                  Payment method
                </p>
                <p className="mt-1 text-sm font-medium">
                  {paymentMethodLabel(order.payment_method)}
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  Order description
                </p>
                <p className="mt-1 text-sm font-medium whitespace-pre-wrap">
                  {description || "No description provided"}
                </p>
              </div>
            </div>

            {!canAct && (
              <p className="text-xs text-muted-foreground">
                Waiting for the sender to review this shipment request.
              </p>
            )}
          </div>

          {canAct && (
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <Button variant="outline" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setRejectOpen(true)}
              >
                Reject
              </Button>
              <Button disabled={busy} onClick={onAccept}>
                {accepting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Accepting…
                  </>
                ) : (
                  "Accept"
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      <RejectInquiryDialog
        open={rejectOpen}
        orderLabel={`shipment #${order.id}`}
        submitting={rejecting}
        onClose={() => {
          if (!rejecting) setRejectOpen(false);
        }}
        onConfirm={async (reason) => {
          try {
            await onReject(reason);
            setRejectOpen(false);
          } catch {
            // Keep dialog open so the sender can retry or edit the reason.
          }
        }}
      />
    </>,
    document.body
  );
}
