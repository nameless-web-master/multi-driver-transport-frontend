"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AddressSearchInput } from "@/components/ui/AddressSearchInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/paymentFlow";
import { createReceiverOrder, listSenders } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Order, SenderSummary } from "@/types";
import {
  PackageListFields,
  packageFormEntryFromOrder,
  parsePackageFormEntries,
  type PackageFormEntry,
} from "@/components/orders/PackageListFields";
import { defaultOrderPackageEntry } from "@/lib/pricing";

interface Props {
  onCreated: (order: Order) => void;
  onMessage: (text: string, type?: "success" | "error") => void;
}

function senderDisplayLabel(sender: SenderSummary): string {
  return `${sender.full_name} · ${sender.email}`;
}

export function ReceiverNewOrderForm({ onCreated, onMessage }: Props) {
  const { user } = useAuth();
  const [senderInput, setSenderInput] = useState("");
  const [selectedSender, setSelectedSender] = useState<SenderSummary | null>(null);
  const [senders, setSenders] = useState<SenderSummary[]>([]);
  const [sendersLoading, setSendersLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const senderContainerRef = useRef<HTMLDivElement | null>(null);
  const skipNextSearch = useRef(false);
  const [deliveryAddress, setDeliveryAddress] = useState(() => user?.address ?? "");
  const [deliveryLat, setDeliveryLat] = useState(() =>
    user?.lat != null ? String(user.lat) : ""
  );
  const [deliveryLng, setDeliveryLng] = useState(() =>
    user?.lng != null ? String(user.lng) : ""
  );
  const [receiverBillingAddress, setReceiverBillingAddress] = useState(() => user?.address ?? "");
  const [notes, setNotes] = useState("");
  const [packageDescription, setPackageDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [packages, setPackages] = useState<PackageFormEntry[]>([
    packageFormEntryFromOrder(defaultOrderPackageEntry()),
  ]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.address) {
      setReceiverBillingAddress(user.address);
      setDeliveryAddress(user.address);
    }
    if (user?.lat != null && user?.lng != null) {
      setDeliveryLat(String(user.lat));
      setDeliveryLng(String(user.lng));
    }
  }, [user?.address, user?.lat, user?.lng]);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }

    const q = senderInput.trim();
    if (q.length < 2) {
      setSenders([]);
      setSendersLoading(false);
      return;
    }
    if (selectedSender && q === senderDisplayLabel(selectedSender)) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setSendersLoading(true);
      listSenders(q)
        .then((data) => {
          if (!cancelled) {
            setSenders(data);
            setDropdownOpen(true);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            onMessage(err instanceof Error ? err.message : "Failed to search senders", "error");
            setSenders([]);
          }
        })
        .finally(() => {
          if (!cancelled) setSendersLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [senderInput, selectedSender, onMessage]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!senderContainerRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function handleSenderInputChange(value: string) {
    setSenderInput(value);
    if (selectedSender && value !== senderDisplayLabel(selectedSender)) {
      setSelectedSender(null);
    }
    if (value.trim().length >= 2) {
      setDropdownOpen(true);
    } else {
      setSenders([]);
      setDropdownOpen(false);
    }
  }

  function handleSelectSender(sender: SenderSummary) {
    setSelectedSender(sender);
    skipNextSearch.current = true;
    setSenderInput(senderDisplayLabel(sender));
    setSenders([]);
    setDropdownOpen(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedSender) {
      onMessage("Search and select a sender to ship with.", "error");
      return;
    }
    const dLat = Number(deliveryLat);
    const dLng = Number(deliveryLng);
    if (!deliveryAddress.trim() || !Number.isFinite(dLat) || !Number.isFinite(dLng)) {
      onMessage("Enter a ship-to address with valid coordinates.", "error");
      return;
    }

    const parsedPackages = parsePackageFormEntries(packages);
    if (!parsedPackages.ok) {
      onMessage(parsedPackages.message, "error");
      return;
    }

    setSubmitting(true);
    try {
      const order = await createReceiverOrder({
        sender_user_id: selectedSender.id,
        destination_address: deliveryAddress.trim(),
        destination_lat: dLat,
        destination_lng: dLng,
        receiver_billing_address: receiverBillingAddress.trim() || undefined,
        notes: notes.trim() || undefined,
        payment_method: paymentMethod || undefined,
        package_description: packageDescription.trim() || undefined,
        packages: parsedPackages.packages,
      });
      onMessage("Shipment request submitted.", "success");
      onCreated(order);
      setSelectedSender(null);
      setSenderInput("");
      setSenders([]);
      setNotes("");
      setPackageDescription("");
      setPackages([packageFormEntryFromOrder(defaultOrderPackageEntry())]);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to submit shipment request", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3">
        <div ref={senderContainerRef} className="relative">
          <Label htmlFor="sender-search">Search sender</Label>
          <Input
            id="sender-search"
            placeholder="Type name or email (min. 2 characters)…"
            value={senderInput}
            onChange={(e) => handleSenderInputChange(e.target.value)}
            onFocus={() => {
              if (senderInput.trim().length >= 2 && !selectedSender) {
                setDropdownOpen(true);
              }
            }}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Pick the sender who will fulfill this shipment. Pickup uses their address on file.
          </p>

          {dropdownOpen && senderInput.trim().length >= 2 && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-background shadow-md overflow-hidden">
              {sendersLoading ? (
                <p className="px-3 py-3 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                </p>
              ) : senders.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">No senders match your search.</p>
              ) : (
                <ul className="max-h-48 overflow-y-auto divide-y divide-border">
                  {senders.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectSender(s)}
                        className={cn(
                          "w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-muted/50",
                          selectedSender?.id === s.id && "bg-primary/10"
                        )}
                      >
                        <p className="font-medium">{s.full_name}</p>
                        <p className="text-xs text-muted-foreground">{s.email}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Label>Ship-to address</Label>
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
          />
        </div>
        <div>
          <Label>Delivery latitude</Label>
          <Input inputMode="decimal" value={deliveryLat} onChange={(e) => setDeliveryLat(e.target.value)} />
        </div>
        <div>
          <Label>Delivery longitude</Label>
          <Input inputMode="decimal" value={deliveryLng} onChange={(e) => setDeliveryLng(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>Billing address (optional)</Label>
          <Input
            value={receiverBillingAddress}
            onChange={(e) => setReceiverBillingAddress(e.target.value)}
          />
        </div>
      </div>

      <PackageListFields packages={packages} onChange={setPackages} />

      <div>
        <Label>Order description</Label>
        <textarea
          className="mt-1 flex min-h-[80px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          value={packageDescription}
          onChange={(e) => setPackageDescription(e.target.value)}
          placeholder="What are you ordering? Include product details the sender needs to review."
        />
        <p className="text-xs text-muted-foreground mt-1">
          The sender uses this to decide whether to accept your shipment request.
        </p>
      </div>

      <div>
        <Label>Payment method</Label>
        <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
          {PAYMENT_METHOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          Choose PFF (Advanced Payment) if a transporter delivers payment to the producer before
          goods ship.
        </p>
      </div>

      <div>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery instructions, timing, etc." />
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Submit shipment request
      </Button>
    </form>
  );
}
