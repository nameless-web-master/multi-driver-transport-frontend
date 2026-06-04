"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { GitBranch, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AddressSearchInput } from "@/components/ui/AddressSearchInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  createOrder,
  listReceivers,
  previewZoneConnectionsByCoordinates,
} from "@/lib/api";
import type { Order, OrderDraftPreview, ReceiverSummary } from "@/types";
import { OrderDraftZonePreview } from "@/components/orders/OrderDraftZonePreview";

interface Props {
  onCreated: (order: Order) => void;
  onMessage: (text: string, type?: "success" | "error") => void;
}

export function NewOrderForm({ onCreated, onMessage }: Props) {
  const { user } = useAuth();
  const [receivers, setReceivers] = useState<ReceiverSummary[]>([]);
  const [receiverId, setReceiverId] = useState<string>("");
  const [senderAddress, setSenderAddress] = useState("");
  const [senderLat, setSenderLat] = useState("");
  const [senderLng, setSenderLng] = useState("");
  const [notes, setNotes] = useState("");
  // Milestone 1 (updated scope) — basic order form fields.
  const [sourceName, setSourceName] = useState("");
  const [sourceContact, setSourceContact] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [shippingMethod, setShippingMethod] = useState("");
  const [packageDescription, setPackageDescription] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [zonePreview, setZonePreview] = useState<OrderDraftPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const profilePrimed = useRef(false);

  // Prime defaults from the user's profile once it loads — but don't clobber
  // edits the user has made.
  useEffect(() => {
    if (profilePrimed.current || !user) return;
    profilePrimed.current = true;
    setSenderAddress(user.address ?? "");
    setSenderLat(user.lat != null ? String(user.lat) : "");
    setSenderLng(user.lng != null ? String(user.lng) : "");
    setSourceName(user.full_name ?? "");
    setSourceContact(user.phone ?? "");
  }, [user]);

  useEffect(() => {
    listReceivers()
      .then(setReceivers)
      .catch((err) =>
        onMessage(err instanceof Error ? err.message : "Failed to load receivers", "error")
      );
  }, [onMessage]);

  const selectedReceiver = useMemo(
    () => receivers.find((r) => String(r.id) === receiverId) ?? null,
    [receivers, receiverId]
  );

  // Coords valid enough to ask the backend for a preview.
  const draftReady = useMemo(() => {
    const sLat = Number(senderLat);
    const sLng = Number(senderLng);
    const dLat = selectedReceiver?.lat ?? null;
    const dLng = selectedReceiver?.lng ?? null;
    return (
      Number.isFinite(sLat) &&
      Number.isFinite(sLng) &&
      dLat != null &&
      dLng != null &&
      Number.isFinite(dLat) &&
      Number.isFinite(dLng)
    );
  }, [senderLat, senderLng, selectedReceiver]);

  // Stale previews are confusing — drop them whenever the inputs change so
  // the user can't accidentally submit relying on a preview from a different
  // pickup or receiver.
  useEffect(() => {
    setZonePreview(null);
    setPreviewError(null);
  }, [senderLat, senderLng, receiverId]);

  async function handleSeeConnections() {
    if (!draftReady || !selectedReceiver) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const preview = await previewZoneConnectionsByCoordinates({
        source_lat: Number(senderLat),
        source_lng: Number(senderLng),
        destination_lat: Number(selectedReceiver.lat),
        destination_lng: Number(selectedReceiver.lng),
        source_address: senderAddress.trim() || undefined,
        source_name: user?.full_name,
        destination_name: selectedReceiver.full_name,
        destination_address: selectedReceiver.address || undefined,
      });
      setZonePreview(preview);
    } catch (err) {
      setZonePreview(null);
      setPreviewError(
        err instanceof Error ? err.message : "Failed to load zone connection preview"
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!receiverId) {
      onMessage("Pick a receiver from the list.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const order = await createOrder({
        receiver_user_id: Number(receiverId),
        sender_address: senderAddress.trim() || undefined,
        sender_lat: senderLat.trim() ? Number(senderLat) : null,
        sender_lng: senderLng.trim() ? Number(senderLng) : null,
        notes: notes.trim() || undefined,
        source_name: sourceName.trim() || undefined,
        source_contact: sourceContact.trim() || undefined,
        payment_method: paymentMethod || undefined,
        shipping_method: shippingMethod || undefined,
        package_description: packageDescription.trim() || undefined,
        weight_kg: weightKg.trim() ? Number(weightKg) : null,
        dimensions: dimensions.trim() || undefined,
      });
      onCreated(order);
      setReceiverId("");
      setNotes("");
      setPackageDescription("");
      setWeightKg("");
      setDimensions("");
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to create order", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Destination receiver</Label>
          <Select value={receiverId} onChange={(e) => setReceiverId(e.target.value)} required>
            <option value="" disabled>
              Select a receiver…
            </option>
            {receivers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name} {r.phone ? `· ${r.phone}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Receiver phone (auto)</Label>
          <Input value={selectedReceiver?.phone ?? ""} readOnly placeholder="Pick a receiver above" />
        </div>
        <div className="md:col-span-2">
          <Label>Receiver address (auto)</Label>
          <Input
            value={selectedReceiver?.address ?? ""}
            readOnly
            placeholder="Pick a receiver above"
          />
        </div>
        <div>
          <Label>Receiver latitude (auto)</Label>
          <Input
            value={selectedReceiver?.lat != null ? String(selectedReceiver.lat) : ""}
            readOnly
            placeholder="—"
          />
        </div>
        <div>
          <Label>Receiver longitude (auto)</Label>
          <Input
            value={selectedReceiver?.lng != null ? String(selectedReceiver.lng) : ""}
            readOnly
            placeholder="—"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Label>Pickup address (search a shop, cafe, or place)</Label>
          <AddressSearchInput
            value={senderAddress}
            onChange={(text) => {
              setSenderAddress(text);
              if (senderLat || senderLng) {
                setSenderLat("");
                setSenderLng("");
              }
            }}
            onPick={(place) => {
              setSenderAddress(place.label);
              setSenderLat(String(place.lat));
              setSenderLng(String(place.lng));
            }}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Try names like &quot;Starbucks&quot;, a building name, or a full street address.
          </p>
        </div>
        <div>
          <Label>Sender latitude</Label>
          <Input
            inputMode="decimal"
            placeholder="Auto-filled from search"
            value={senderLat}
            onChange={(e) => setSenderLat(e.target.value)}
          />
        </div>
        <div>
          <Label>Sender longitude</Label>
          <Input
            inputMode="decimal"
            placeholder="Auto-filled from search"
            value={senderLng}
            onChange={(e) => setSenderLng(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Source / sender name</Label>
          <Input
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder="Who is sending this package"
          />
        </div>
        <div>
          <Label>Source contact</Label>
          <Input
            value={sourceContact}
            onChange={(e) => setSourceContact(e.target.value)}
            placeholder="Phone or email for the sender"
          />
        </div>
        <div>
          <Label>Payment method</Label>
          <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="">Select…</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="mobile_money">Mobile money</option>
            <option value="cod">Cash on delivery</option>
          </Select>
        </div>
        <div>
          <Label>Shipping method</Label>
          <Select value={shippingMethod} onChange={(e) => setShippingMethod(e.target.value)}>
            <option value="">Select…</option>
            <option value="standard">Standard</option>
            <option value="express">Express</option>
            <option value="economy">Economy</option>
            <option value="same_day">Same day</option>
          </Select>
        </div>
        <div>
          <Label>Weight (kg)</Label>
          <Input
            inputMode="decimal"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            placeholder="e.g. 2.5"
          />
        </div>
        <div>
          <Label>Dimensions (L × W × H)</Label>
          <Input
            value={dimensions}
            onChange={(e) => setDimensions(e.target.value)}
            placeholder="e.g. 30 × 20 × 15 cm"
          />
        </div>
        <div className="md:col-span-2">
          <Label>Package description</Label>
          <Input
            value={packageDescription}
            onChange={(e) => setPackageDescription(e.target.value)}
            placeholder="What's inside the package"
          />
        </div>
      </div>

      <div>
        <Label>Notes (optional)</Label>
        <textarea
          className="mt-1 flex min-h-[80px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Special instructions, package details, etc."
        />
      </div>

      {/*
        Milestone 2 — pre-submit zone connection preview. Senders can click
        "See zone connections" once they have a pickup coord and a receiver
        with valid coords, and the API answers "are pickup and drop-off
        linked through any transport zone graph?". Strictly preview-only.
      */}
      {(zonePreview || previewLoading || previewError) && (
        <OrderDraftZonePreview
          preview={zonePreview}
          loading={previewLoading}
          error={previewError}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleSeeConnections}
          disabled={!draftReady || previewLoading}
          title={
            draftReady
              ? "Preview which transport zones link this pickup to the receiver"
              : "Pick a receiver with coords and a pickup location first"
          }
        >
          {previewLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GitBranch className="h-4 w-4" />
          )}
          See zone connections
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Submit order
        </Button>
      </div>
    </form>
  );
}
