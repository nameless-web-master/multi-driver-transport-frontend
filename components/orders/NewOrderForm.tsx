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
import {
  PackageListFields,
  packageFormEntryFromOrder,
  parsePackageFormEntries,
  type PackageFormEntry,
} from "@/components/orders/PackageListFields";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/paymentFlow";
import { defaultOrderPackageEntry } from "@/lib/pricing";

interface Props {
  onCreated: (order: Order) => void;
  onMessage: (text: string, type?: "success" | "error") => void;
}

export function NewOrderForm({ onCreated, onMessage }: Props) {
  const { user } = useAuth();
  const [receivers, setReceivers] = useState<ReceiverSummary[]>([]);
  const [receiverId, setReceiverId] = useState<string>("");
  const [senderBillingAddress, setSenderBillingAddress] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [senderLat, setSenderLat] = useState("");
  const [senderLng, setSenderLng] = useState("");
  const [receiverBillingAddress, setReceiverBillingAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryLat, setDeliveryLat] = useState("");
  const [deliveryLng, setDeliveryLng] = useState("");
  const [deliveryPrimedForReceiver, setDeliveryPrimedForReceiver] =
    useState<string>("");
  const [notes, setNotes] = useState("");
  // Milestone 1 (updated scope) — basic order form fields.
  const [sourceName, setSourceName] = useState("");
  const [sourceContact, setSourceContact] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [shippingMethod, setShippingMethod] = useState("");
  const [packageDescription, setPackageDescription] = useState("");
  const [packages, setPackages] = useState<PackageFormEntry[]>([
    packageFormEntryFromOrder(defaultOrderPackageEntry()),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [zonePreview, setZonePreview] = useState<OrderDraftPreview | null>(
    null,
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const profilePrimed = useRef(false);

  // Prime defaults from the user's profile once it loads — but don't clobber
  // edits the user has made.
  useEffect(() => {
    if (profilePrimed.current || !user) return;
    profilePrimed.current = true;
    setSenderBillingAddress(user.address ?? "");
    setSourceName(user.full_name ?? "");
    setSourceContact(user.phone ?? "");
  }, [user]);

  useEffect(() => {
    listReceivers()
      .then(setReceivers)
      .catch((err) =>
        onMessage(
          err instanceof Error ? err.message : "Failed to load receivers",
          "error",
        ),
      );
  }, [onMessage]);

  const selectedReceiver = useMemo(
    () => receivers.find((r) => String(r.id) === receiverId) ?? null,
    [receivers, receiverId],
  );

  useEffect(() => {
    if (!selectedReceiver) {
      setReceiverBillingAddress("");
      setDeliveryAddress("");
      setDeliveryLat("");
      setDeliveryLng("");
      setDeliveryPrimedForReceiver("");
      return;
    }
    setReceiverBillingAddress(selectedReceiver.address ?? "");
    if (deliveryPrimedForReceiver !== receiverId) {
      setDeliveryAddress(selectedReceiver.address ?? "");
      setDeliveryLat(
        selectedReceiver.lat != null ? String(selectedReceiver.lat) : "",
      );
      setDeliveryLng(
        selectedReceiver.lng != null ? String(selectedReceiver.lng) : "",
      );
      setDeliveryPrimedForReceiver(receiverId);
    }
  }, [selectedReceiver, receiverId, deliveryPrimedForReceiver]);

  // Coords valid enough to ask the backend for a preview.
  const draftReady = useMemo(() => {
    const sLat = Number(senderLat);
    const sLng = Number(senderLng);
    const dLat = deliveryLat.trim() ? Number(deliveryLat) : null;
    const dLng = deliveryLng.trim() ? Number(deliveryLng) : null;
    return (
      Number.isFinite(sLat) &&
      Number.isFinite(sLng) &&
      dLat != null &&
      dLng != null &&
      Number.isFinite(dLat) &&
      Number.isFinite(dLng)
    );
  }, [senderLat, senderLng, deliveryLat, deliveryLng]);

  // Stale previews are confusing — drop them whenever the inputs change so
  // the user can't accidentally submit relying on a preview from a different
  // pickup or receiver.
  useEffect(() => {
    setZonePreview(null);
    setPreviewError(null);
  }, [senderLat, senderLng, deliveryLat, deliveryLng, receiverId]);

  async function handleSeeConnections() {
    if (!draftReady || !selectedReceiver) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const preview = await previewZoneConnectionsByCoordinates({
        source_lat: Number(senderLat),
        source_lng: Number(senderLng),
        destination_lat: Number(deliveryLat),
        destination_lng: Number(deliveryLng),
        source_address: pickupAddress.trim() || undefined,
        source_name: user?.full_name,
        destination_name: selectedReceiver.full_name,
        destination_address: deliveryAddress.trim() || undefined,
      });
      setZonePreview(preview);
    } catch (err) {
      setZonePreview(null);
      setPreviewError(
        err instanceof Error
          ? err.message
          : "Failed to load zone connection preview",
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
    const parsedPackages = parsePackageFormEntries(packages);
    if (!parsedPackages.ok) {
      onMessage(parsedPackages.message, "error");
      return;
    }
    setSubmitting(true);
    try {
      const order = await createOrder({
        receiver_user_id: Number(receiverId),
        sender_address: pickupAddress.trim() || undefined,
        sender_billing_address: senderBillingAddress.trim() || undefined,
        sender_lat: senderLat.trim() ? Number(senderLat) : null,
        sender_lng: senderLng.trim() ? Number(senderLng) : null,
        destination_address: deliveryAddress.trim() || undefined,
        destination_lat: deliveryLat.trim() ? Number(deliveryLat) : null,
        destination_lng: deliveryLng.trim() ? Number(deliveryLng) : null,
        receiver_billing_address: receiverBillingAddress.trim() || undefined,
        notes: notes.trim() || undefined,
        source_name: sourceName.trim() || undefined,
        source_contact: sourceContact.trim() || undefined,
        payment_method: paymentMethod || undefined,
        shipping_method: shippingMethod || undefined,
        package_description: packageDescription.trim() || undefined,
        packages: parsedPackages.packages,
      });
      onCreated(order);
      setReceiverId("");
      setNotes("");
      setPackageDescription("");
      setPackages([packageFormEntryFromOrder(defaultOrderPackageEntry())]);
    } catch (err) {
      onMessage(
        err instanceof Error ? err.message : "Failed to create order",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Destination receiver</Label>
          <Select
            value={receiverId}
            onChange={(e) => setReceiverId(e.target.value)}
            required
          >
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
          <Input
            value={selectedReceiver?.phone ?? ""}
            readOnly
            placeholder="Pick a receiver above"
          />
        </div>
        <div className="md:col-span-2">
          <Label>Receiver billing address</Label>
          <Input
            value={receiverBillingAddress}
            onChange={(e) => setReceiverBillingAddress(e.target.value)}
            placeholder="Billing address on file for this receiver"
            readOnly={!selectedReceiver}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Used for invoicing. Can differ from where the package is delivered.
          </p>
        </div>
        <div className="md:col-span-2">
          <Label>Delivery address (used for routing)</Label>
          <AddressSearchInput
            value={deliveryAddress}
            onChange={(text) => {
              setDeliveryAddress(text);
              if (deliveryLat || deliveryLng) {
                setDeliveryLat("");
                setDeliveryLng("");
              }
            }}
            onPick={(place) => {
              setDeliveryAddress(place.label);
              setDeliveryLat(String(place.lat));
              setDeliveryLng(String(place.lng));
            }}
            disabled={!selectedReceiver}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Where the package is actually dropped off — may differ from billing.
          </p>
        </div>
        <div>
          <Label>Delivery latitude</Label>
          <Input
            inputMode="decimal"
            placeholder="Auto-filled from delivery search"
            value={deliveryLat}
            onChange={(e) => setDeliveryLat(e.target.value)}
          />
        </div>
        <div>
          <Label>Delivery longitude</Label>
          <Input
            inputMode="decimal"
            placeholder="Auto-filled from delivery search"
            value={deliveryLng}
            onChange={(e) => setDeliveryLng(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Label>Sender billing address</Label>
          <Input
            value={senderBillingAddress}
            onChange={(e) => setSenderBillingAddress(e.target.value)}
            placeholder="Your billing address on file"
          />
        </div>
        <div className="md:col-span-2">
          <Label>Pickup address (used for routing)</Label>
          <AddressSearchInput
            value={pickupAddress}
            onChange={(text) => {
              setPickupAddress(text);
              if (senderLat || senderLng) {
                setSenderLat("");
                setSenderLng("");
              }
            }}
            onPick={(place) => {
              setPickupAddress(place.label);
              setSenderLat(String(place.lat));
              setSenderLng(String(place.lng));
            }}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Where the package is picked up — can differ from your billing
            address.
          </p>
        </div>
        <div>
          <Label>Pickup latitude</Label>
          <Input
            inputMode="decimal"
            placeholder="Auto-filled from search"
            value={senderLat}
            onChange={(e) => setSenderLat(e.target.value)}
          />
        </div>
        <div>
          <Label>Pickup longitude</Label>
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
          <Select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            <option value="">Select…</option>
            {PAYMENT_METHOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Shipping method</Label>
          <Select
            value={shippingMethod}
            onChange={(e) => setShippingMethod(e.target.value)}
          >
            <option value="">Select…</option>
            <option value="standard">Standard</option>
            <option value="express">Express</option>
            <option value="economy">Economy</option>
            <option value="same_day">Same day</option>
          </Select>
        </div>
        <div>
          <Label>Package description</Label>
          <Input
            value={packageDescription}
            onChange={(e) => setPackageDescription(e.target.value)}
            placeholder="e.g. Box"
          />
        </div>
        <div className="md:col-span-2">
          <PackageListFields packages={packages} onChange={setPackages} />
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
