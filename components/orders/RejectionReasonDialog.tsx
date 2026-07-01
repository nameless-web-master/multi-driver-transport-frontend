"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseOrderRejectionReason } from "@/lib/orderRejection";
import { shipmentRef } from "@/lib/entityLabels";
import type { Order } from "@/types";

interface Props {
  open: boolean;
  order: Order | null;
  onClose: () => void;
}

export function RejectionReasonDialog({ open, order, onClose }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !order || !mounted) return null;

  const reason = parseOrderRejectionReason(order.notes);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rejection-reason-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 id="rejection-reason-title" className="text-base font-semibold">
            Rejection reason · {shipmentRef(order.id)}
          </h2>
          <Button type="button" variant="outline" size="sm" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {reason ?? "No reason was provided."}
          </p>
        </div>
        <div className="flex justify-end border-t border-border px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
