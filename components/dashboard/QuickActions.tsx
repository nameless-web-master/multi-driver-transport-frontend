"use client";

import Link from "next/link";
import {
  Boxes,
  CheckCircle2,
  DollarSign,
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
      label: "Shipment requests",
      description: "Accept, reject, and update delivery status",
      href: "/transporter/confirmations",
      icon: CheckCircle2,
    },
    {
      label: "Set prices",
      description: "Enter costs for segments that need a quote",
      href: "/quote-requests",
      icon: DollarSign,
    },
    {
      label: "Driver zones",
      description: "Define coverage with H3 cells or a polygon",
      href: "/driver-zones",
      icon: Plus,
    },
    {
      label: "Map view",
      description: "Visualise every zone you own",
      href: "/map-view",
      icon: Map,
    },
    {
      label: "Zone connections",
      description: "See overlap and adjacency hand-offs",
      href: "/zone-connections",
      icon: Workflow,
    },
    {
      label: "Browse cells",
      description: "Inspect cell coverage across zones",
      href: "/h3-cells",
      icon: Boxes,
    },
  ],
  sender: [
    {
      label: "Incoming orders",
      description: "Review shipment requests and connect routes",
      href: "/orders",
      icon: Send,
    },
    {
      label: "Find transporters",
      description: "Browse transporters near a location",
      href: "/drivers",
      icon: Truck,
    },
    {
      label: "Open map view",
      description: "See transporter coverage on a map",
      href: "/map-view",
      icon: Map,
    },
  ],
  receiver: [
    {
      label: "Request shipment",
      description: "Submit a shipment request to a sender",
      href: "/orders",
      icon: Send,
    },
    {
      label: "View incoming orders",
      description: "Confirm deliveries you receive",
      href: "/orders",
      icon: Package,
    },
    {
      label: "Transporters in your area",
      description: "Browse and follow transporters nearby",
      href: "/drivers",
      icon: Truck,
    },
    {
      label: "Open map view",
      description: "See transporter coverage on a map",
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
      label: "Transporters directory",
      description: "All registered transporters",
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
