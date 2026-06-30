/** Payment Forwarded First — Advanced Payment flow. */
export function isPffPaymentMethod(paymentMethod: string | null | undefined): boolean {
  const normalized = String(paymentMethod ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return (
    normalized === "pff" ||
    normalized === "payment_forwarded_first" ||
    normalized === "advanced_payment" ||
    normalized === "advanced_payment_flow"
  );
}

export const PAYMENT_METHOD_OPTIONS = [
  { value: "online", label: "Online payment" },
  { value: "cod", label: "Cash on delivery (COD)" },
  { value: "pff", label: "PFF — Payment Forwarded First (Advanced Payment)" },
] as const;

export function paymentMethodLabel(method: string | null | undefined): string {
  const normalized = String(method ?? "").trim().toLowerCase();
  const match = PAYMENT_METHOD_OPTIONS.find((o) => o.value === normalized);
  if (match) return match.label;
  if (isPffPaymentMethod(method)) return "PFF — Advanced Payment";
  return method?.trim() || "Not set";
}
