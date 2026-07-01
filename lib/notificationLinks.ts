import type { UserRole } from "@/types/auth";
import type { NotificationType } from "@/types";

export function notificationHref(
  notification: { order_id: number | null; type: NotificationType },
  role: UserRole | undefined
): string | null {
  if (notification.type === "confirmation_request" && role === "driver") {
    return "/transporter/confirmations";
  }
  if (notification.type === "quote_request" && role === "driver") {
    return "/quote-requests";
  }

  if (notification.order_id == null) return null;
  const orderId = notification.order_id;

  if (role === "driver") {
    return `/confirmations/order/${orderId}/tracking`;
  }
  return `/orders?orderId=${orderId}`;
}
