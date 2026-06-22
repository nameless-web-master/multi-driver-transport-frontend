"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  Boxes,
  DollarSign,
  CheckCircle2,
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
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { RoleBadge } from "@/components/ui/RoleBadge";
import type { UserRole } from "@/types/auth";
import { UserMenu } from "./UserMenu";

interface NavItem {
  label: string;
  href: string;
  icon: typeof Shapes;
  roles: UserRole[];
}

interface NavSection {
  heading?: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: Home, roles: ["driver", "sender", "receiver", "admin"] },
    ],
  },
  {
    heading: "Workspace",
    items: [
      { label: "Driver Zones", href: "/driver-zones", icon: Shapes, roles: ["driver", "admin"] },
      { label: "Quote requests", href: "/quote-requests", icon: DollarSign, roles: ["driver", "admin"] },
      { label: "Confirmations", href: "/transporter/confirmations", icon: CheckCircle2, roles: ["driver", "admin"] },
      { label: "Orders", href: "/orders", icon: Package, roles: ["sender", "receiver", "admin"] },
      { label: "Transporters", href: "/drivers", icon: Truck, roles: ["sender", "receiver", "admin"] },
      { label: "Receivers", href: "/receivers", icon: Inbox, roles: ["sender", "admin"] },
    ],
  },
  {
    heading: "Geospatial",
    items: [
      { label: "Map View", href: "/map-view", icon: Map, roles: ["driver", "sender", "receiver", "admin"] },
      { label: "Zone Connections", href: "/zone-connections", icon: Workflow, roles: ["driver", "admin"] },
      { label: "Driver-Zone Graph", href: "/driver-zone-graph", icon: Network, roles: ["driver", "admin"] },
      { label: "Cells", href: "/h3-cells", icon: Boxes, roles: ["driver", "admin"] },
      { label: "Routes", href: "/routes", icon: Route, roles: ["sender", "receiver", "admin", "driver"] },
    ],
  },
  {
    heading: "Account",
    items: [
      { label: "Settings", href: "/settings", icon: Settings, roles: ["driver", "sender", "receiver", "admin"] },
    ],
  },
];

interface SidebarProps {
  /**
   * Mobile drawer open state. The desktop sidebar (>= lg) is always visible
   * regardless of this prop; this only controls the slide-in drawer used on
   * narrow viewports.
   */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role;

  const sections = role
    ? NAV_SECTIONS.map((section) => ({
        heading: section.heading,
        items: section.items.filter((i) => i.roles.includes(role)),
      })).filter((section) => section.items.length > 0)
    : [];

  // Auto-close the drawer when the user navigates to a new route. Tracking
  // the previous pathname via ref keeps this from firing on the initial mount.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      onMobileClose?.();
    }
  }, [pathname, onMobileClose]);

  // Lock body scroll + dismiss on Escape while the drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMobileClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen, onMobileClose]);

  const navContent = (
    <>
      <div className="h-20 flex items-center gap-3 px-5 border-b border-border">
        <Image
          src="/logo.png"
          alt="Multi-Driver Transport"
          width={40}
          height={40}
          className="rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-tight">Multi-Driver</p>
          {role ? (
            <RoleBadge role={role} className="mt-1" />
          ) : (
            <p className="text-xs text-muted-foreground">Transport</p>
          )}
        </div>
        {/*
          Close button only shows inside the mobile drawer — `lg:hidden`
          keeps it out of the desktop sidebar layout.
        */}
        <button
          type="button"
          onClick={onMobileClose}
          aria-label="Close navigation"
          className="lg:hidden h-9 w-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {sections.map((section, idx) => (
          <div key={section.heading ?? `section-${idx}`} className="space-y-1">
            {section.heading && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {section.heading}
              </p>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-active text-primary"
                      : "text-sidebar-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <UserMenu compact />
    </>
  );

  return (
    <>
      {/* Desktop: sticky vertical sidebar (>= lg). */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-sidebar sticky top-0 h-screen z-30">
        {navContent}
      </aside>

      {/*
        Mobile: full-screen overlay containing a slide-in drawer. Hidden on
        desktop. We keep the markup mounted (rather than conditional) and use
        opacity/translate transitions so opening + closing animates smoothly.

        z-[1100] is high enough to sit above Leaflet's panes (400) and controls
        (~1000) — otherwise the map's +/- zoom buttons bleed over the drawer.
      */}
      <div
        className={cn(
          "lg:hidden fixed inset-0 z-[1100] transition-opacity duration-200",
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          aria-label="Close navigation overlay"
          tabIndex={mobileOpen ? 0 : -1}
          onClick={onMobileClose}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Main navigation"
          className={cn(
            "absolute left-0 top-0 h-full w-72 max-w-[85vw] flex flex-col border-r border-border bg-sidebar shadow-2xl transition-transform duration-200",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {navContent}
        </aside>
      </div>
    </>
  );
}
