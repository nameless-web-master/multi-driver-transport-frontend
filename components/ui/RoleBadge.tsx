import { Shield, Truck, Send, Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/auth";

/**
 * Consistent visual treatment of the four user roles. Reused by the sidebar
 * header, top-bar user chip, and the Settings profile card so the colour
 * cues stay consistent everywhere a role label is rendered.
 */
const ROLE_META: Record<
  UserRole,
  { label: string; tone: string; icon: LucideIcon; tooltip: string }
> = {
  driver: {
    label: "Driver",
    tone:
      "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20",
    icon: Truck,
    tooltip: "Operates driver zones and accepts deliveries.",
  },
  sender: {
    label: "Sender",
    tone:
      "bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/20",
    icon: Send,
    tooltip: "Creates orders and ships to receivers.",
  },
  receiver: {
    label: "Receiver",
    tone:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20",
    icon: Inbox,
    tooltip: "Accepts incoming deliveries.",
  },
  admin: {
    label: "Admin",
    tone:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20",
    icon: Shield,
    tooltip: "Full platform access.",
  },
};

interface RoleBadgeProps {
  role: UserRole;
  size?: "sm" | "md";
  withIcon?: boolean;
  className?: string;
}

export function RoleBadge({
  role,
  size = "sm",
  withIcon = true,
  className,
}: RoleBadgeProps) {
  const meta = ROLE_META[role];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      title={meta.tooltip}
      className={cn(
        "inline-flex items-center gap-1 font-medium rounded-full",
        size === "sm"
          ? "px-2 py-0.5 text-[11px]"
          : "px-2.5 py-1 text-xs",
        meta.tone,
        className
      )}
    >
      {withIcon && <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />}
      {meta.label}
    </span>
  );
}

export function roleLabel(role: UserRole): string {
  return ROLE_META[role]?.label ?? role;
}
