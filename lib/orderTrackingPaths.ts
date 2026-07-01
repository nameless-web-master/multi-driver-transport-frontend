import type { UserRole } from "@/types/auth";

export function orderTrackingPath(orderId: number, role?: UserRole | string | null): string {
  if (role === "driver") {
    return `/confirmations/order/${orderId}/tracking`;
  }
  return `/orders/${orderId}/tracking`;
}

export function orderTrackingBackLink(role?: UserRole | string | null): {
  href: string;
  label: string;
} {
  if (role === "driver") {
    return { href: "/transporter/confirmations", label: "Back to confirmations" };
  }
  return { href: "/orders", label: "Back to orders" };
}
