import type { UserRole } from "@/types/auth";
import {
  Boxes,
  CheckCircle2,
  DollarSign,
  Home,
  Inbox,
  Map,
  Network,
  Package,
  Route,
  Settings,
  Shapes,
  Truck,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: UserRole[];
  activePrefixes?: string[];
}

export interface NavSection {
  heading?: string;
  roles?: UserRole[];
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: Home,
        roles: ["driver", "sender", "receiver", "admin"],
      },
    ],
  },
  {
    heading: "Shipments",
    roles: ["driver"],
    items: [
      {
        label: "My shipments",
        href: "/transporter/confirmations",
        icon: CheckCircle2,
        roles: ["driver"],
        activePrefixes: ["/confirmations/order/"],
      },
      {
        label: "Set prices",
        href: "/quote-requests",
        icon: DollarSign,
        roles: ["driver"],
      },
    ],
  },
  {
    heading: "Workspace",
    roles: ["sender", "receiver", "admin"],
    items: [
      { label: "Orders", href: "/orders", icon: Package, roles: ["sender", "receiver", "admin"] },
      { label: "Transporters", href: "/drivers", icon: Truck, roles: ["sender", "receiver", "admin"] },
      { label: "Receivers", href: "/receivers", icon: Inbox, roles: ["admin"] },
    ],
  },
  {
    heading: "Operations",
    roles: ["admin"],
    items: [
      {
        label: "Confirmations",
        href: "/transporter/confirmations",
        icon: CheckCircle2,
        roles: ["admin"],
        activePrefixes: ["/confirmations/order/"],
      },
      { label: "Quote requests", href: "/quote-requests", icon: DollarSign, roles: ["admin"] },
      { label: "Routes", href: "/routes", icon: Route, roles: ["admin"] },
    ],
  },
  {
    heading: "Zone setup",
    roles: ["driver"],
    items: [
      { label: "Driver zones", href: "/driver-zones", icon: Shapes, roles: ["driver"] },
      { label: "Map view", href: "/map-view", icon: Map, roles: ["driver"] },
      { label: "Zone connections", href: "/zone-connections", icon: Workflow, roles: ["driver"] },
      { label: "Zone graph", href: "/driver-zone-graph", icon: Network, roles: ["driver"] },
      { label: "Cells", href: "/h3-cells", icon: Boxes, roles: ["driver"] },
    ],
  },
  {
    heading: "Geospatial",
    roles: ["sender", "receiver"],
    items: [
      { label: "Map view", href: "/map-view", icon: Map, roles: ["sender", "receiver"] },
      { label: "Routes", href: "/routes", icon: Route, roles: ["sender", "receiver"] },
    ],
  },
  {
    heading: "Zone tools",
    roles: ["admin"],
    items: [
      { label: "Driver zones", href: "/driver-zones", icon: Shapes, roles: ["admin"] },
      { label: "Map view", href: "/map-view", icon: Map, roles: ["admin"] },
      { label: "Zone connections", href: "/zone-connections", icon: Workflow, roles: ["admin"] },
      { label: "Zone graph", href: "/driver-zone-graph", icon: Network, roles: ["admin"] },
      { label: "Cells", href: "/h3-cells", icon: Boxes, roles: ["admin"] },
    ],
  },
  {
    heading: "Account",
    items: [
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
        roles: ["driver", "sender", "receiver", "admin"],
      },
    ],
  },
];

export function getNavSectionsForRole(role: UserRole): NavSection[] {
  const sections: NavSection[] = [];
  for (const section of NAV_SECTIONS) {
    if (section.roles && !section.roles.includes(role)) {
      continue;
    }
    const items = section.items.filter((item) => item.roles.includes(role));
    if (items.length === 0) continue;
    sections.push({ heading: section.heading, items });
  }
  return sections;
}

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
    return true;
  }
  return (item.activePrefixes ?? []).some((prefix) => pathname.startsWith(prefix));
}
