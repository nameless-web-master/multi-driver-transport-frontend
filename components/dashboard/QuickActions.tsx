"use client";

import Link from "next/link";
import {
  Boxes,
  Inbox,
  Map,
  Package,
  Plus,
  Send,
  Settings,
  Shapes,
  Truck,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UserRole } from "@/types/auth";

interface QuickAction {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

const ACTIONS_BY_ROLE: Record<UserRole, QuickAction[]> = {
  driver: [
    {
      label: "Add driver zone",
      description: "Define coverage with H3 cells or a polygon",
      href: "/driver-zones",
      icon: Plus,
    },
    {
      label: "Open map view",
      description: "Visualise every zone you own",
      href: "/map-view",
      icon: Map,
    },
    {
      label: "Browse H3 cells",
      description: "Inspect cell coverage across zones",
      href: "/h3-cells",
      icon: Boxes,
    },
    {
      label: "Zone connections",
      description: "See overlap and adjacency hand-offs",
      href: "/zone-connections",
      icon: Workflow,
    },
  ],
  sender: [
    {
      label: "Create an order",
      description: "Pick a receiver and ship a delivery",
      href: "/orders",
      icon: Send,
    },
    {
      label: "Find drivers",
      description: "Browse drivers near a location",
      href: "/drivers",
      icon: Truck,
    },
    {
      label: "Receiver directory",
      description: "Lookup people you can ship to",
      href: "/receivers",
      icon: Inbox,
    },
    {
      label: "Open map view",
      description: "See driver coverage on a map",
      href: "/map-view",
      icon: Map,
    },
  ],
  receiver: [
    {
      label: "View incoming orders",
      description: "Confirm deliveries you receive",
      href: "/orders",
      icon: Package,
    },
    {
      label: "Drivers in your area",
      description: "Browse and follow drivers nearby",
      href: "/drivers",
      icon: Truck,
    },
    {
      label: "Open map view",
      description: "See driver coverage on a map",
      href: "/map-view",
      icon: Map,
    },
    {
      label: "Account settings",
      description: "Update your profile and address",
      href: "/settings",
      icon: Settings,
    },
  ],
  admin: [
    {
      label: "Manage driver zones",
      description: "Full zone CRUD across all drivers",
      href: "/driver-zones",
      icon: Shapes,
    },
    {
      label: "Inspect orders",
      description: "Every order on the platform",
      href: "/orders",
      icon: Package,
    },
    {
      label: "Drivers directory",
      description: "All registered drivers",
      href: "/drivers",
      icon: Truck,
    },
    {
      label: "Zone connections",
      description: "Trigger system-wide recalculation",
      href: "/zone-connections",
      icon: Workflow,
    },
  ],
};

interface QuickActionsProps {
  role: UserRole;
}

export function QuickActions({ role }: QuickActionsProps) {
  const actions = ACTIONS_BY_ROLE[role] ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              href={action.href}
              className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 hover:border-primary/40 hover:bg-accent transition-colors"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{action.label}</p>
                <p className="text-xs text-muted-foreground">{action.description}</p>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
