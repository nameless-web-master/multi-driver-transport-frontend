"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  Hexagon,
  Inbox,
  Package,
  Shapes,
  Star,
  Truck,
  Users,
  Workflow,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  getDashboardStats,
  listDriverZones,
  listDrivers,
  listOrders,
  listReceivers,
  listZoneConnections,
  updateOrderTrackingStatus,
} from "@/lib/api";
import { showToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { cn, formatDate } from "@/lib/utils";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { MapPreviewCard } from "./MapPreviewCard";
import { QuickActions } from "./QuickActions";
import { RecentZones } from "./RecentZones";
import { StatCard } from "./StatCard";
import { TransporterWorkSummary } from "./TransporterWorkSummary";
import type {
  DashboardStats,
  DriverDashboardStats,
  ReceiverDashboardStats,
  SenderDashboardStats,
} from "@/types/auth";
import type {
  DriverSummary,
  DriverZone,
  Order,
  ReceiverSummary,
  ZoneConnection,
} from "@/types";

/**
 * Single entry-point for the role-aware dashboard. Picks a sub-component
 * based on the authenticated user's role and provides a shared shell with
 * a personalised greeting + role badge in the header.
 */
export function DashboardPage() {
  const { user } = useAuth();

  if (!user) {
    return (
      <DashboardShell title="Dashboard">
        <DashboardLoading />
      </DashboardShell>
    );
  }

  const firstName = user.full_name.split(/\s+/)[0];
  const greeting = greetingForRole(user.role);

  return (
    <DashboardShell
      title={`${timeOfDayGreeting()}, ${firstName}`}
      subtitle={greeting}
    >
      <div className="px-4 sm:px-6 pb-10 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <RoleBadge role={user.role} size="md" />
          {user.company_name && (
            <span className="text-xs text-muted-foreground">
              · {user.company_name}
            </span>
          )}
        </div>

        {user.role === "driver" && <DriverDashboard />}
        {user.role === "sender" && <SenderDashboard />}
        {user.role === "receiver" && <ReceiverDashboard />}
        {user.role === "admin" && <AdminDashboard />}
      </div>
    </DashboardShell>
  );
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

function DriverDashboard() {
  const { data, error, loading } = useDashboardStats<DriverDashboardStats>("driver");

  if (loading) return <DashboardLoading />;
  if (error) return <DashboardError message={error} />;
  if (!data) return null;

  const trustPct = Math.max(0, Math.min(100, Math.round(data.trustworthiness)));

  return (
    <>
      <TransporterWorkSummary />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Driver zones"
          value={data.total_driver_zones}
          icon={Shapes}
          hint={`${data.available_zones} available`}
          accent="blue"
        />
        <StatCard
          label="H3 cells"
          value={data.total_h3_cells}
          icon={Hexagon}
          hint="Across all zones"
          accent="violet"
        />
        <StatCard
          label="Followers"
          value={data.followers}
          icon={Users}
          hint="Senders who follow you"
          accent="green"
        />
        <StatCard
          label="Trust score"
          value={trustPct}
          icon={Star}
          hint="Higher is better"
          accent="amber"
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <RecentZones zones={data.recent_zones ?? []} />
          <Card>
            <CardHeader>
              <CardTitle>Trustworthiness</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">Score</span>
                <span className="font-semibold tabular-nums">{trustPct}/100</span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${trustPct}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Senders raise your trust score each time they follow you. Keep
                zones available and respond quickly to orders to attract more
                followers.
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <QuickActions role="driver" />
          <MapPreviewCard zones={data.recent_zones ?? []} />
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sender
// ---------------------------------------------------------------------------

function SenderDashboard() {
  const { data, error, loading } = useDashboardStats<SenderDashboardStats>("sender");
  const [recent, setRecent] = useState<Order[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listOrders()
      .then((orders) => {
        if (cancelled) return;
        setRecent(orders.slice(0, 5));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <DashboardLoading />;
  if (error) return <DashboardError message={error} />;
  if (!data) return null;

  return (
    <>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="In flight"
          value={data.order_counts.delivering}
          icon={Truck}
          hint="Currently delivering"
          accent="blue"
        />
        <StatCard
          label="Submitted"
          value={data.order_counts.submitted}
          icon={Clock}
          hint="Awaiting pickup"
          accent="amber"
        />
        <StatCard
          label="Delivered"
          value={data.order_counts.received}
          icon={CheckCircle2}
          hint="Successfully received"
          accent="green"
        />
        <StatCard
          label="Transporters"
          value={data.available_drivers}
          icon={Truck}
          hint="Available to follow"
          accent="violet"
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2">
                <Package className="h-4 w-4" /> Recent orders
              </CardTitle>
              <Link
                href="/orders"
                className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {recentLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Loading…
                </div>
              ) : recent.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <p>You haven&apos;t submitted any orders yet.</p>
                  <Link
                    href="/orders"
                    className="text-primary hover:underline font-medium mt-2 inline-block"
                  >
                    Create your first order →
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-border/70">
                  {recent.map((order) => (
                    <RecentOrderRow
                      key={order.id}
                      order={order}
                      counterpartyLabel={order.receiver_name}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <QuickActions role="sender" />
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Receiver
// ---------------------------------------------------------------------------

function ReceiverDashboard() {
  const { user } = useAuth();
  const { data, error, loading } = useDashboardStats<ReceiverDashboardStats>("receiver");
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    listOrders()
      .then((list) => {
        if (cancelled) return;
        setOrders(list);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setOrdersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirmReceived(order: Order) {
    setUpdating(order.id);
    try {
      const result = await updateOrderTrackingStatus(order.id, "DELIVERED");
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, tracking_status: result.tracking_status, status: "received" }
            : o
        )
      );
      showToast(`Shipment #${order.id} marked as delivered.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update shipment", "error");
    } finally {
      setUpdating(null);
    }
  }

  if (loading) return <DashboardLoading />;
  if (error) return <DashboardError message={error} />;
  if (!data) return null;

  const pending = orders.filter(
    (o) => o.tracking_status === "IN_TRANSIT" && o.receiver_user_id === user?.id
  );
  const incoming = orders.filter(
    (o) => o.status === "submitted" && o.receiver_user_id === user?.id
  );

  return (
    <>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Awaiting confirmation"
          value={data.order_counts.delivering}
          icon={Truck}
          hint="Tap to confirm receipt"
          accent="blue"
        />
        <StatCard
          label="Incoming"
          value={data.order_counts.submitted}
          icon={Clock}
          hint="Pending pickup"
          accent="amber"
        />
        <StatCard
          label="Received"
          value={data.order_counts.received}
          icon={CheckCircle2}
          hint="Confirmed deliveries"
          accent="green"
        />
        <StatCard
          label="Total"
          value={data.total_orders}
          icon={Package}
          hint="All orders to you"
          accent="violet"
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-4 w-4" /> Ready to confirm ({pending.length})
              </CardTitle>
              <Link
                href="/orders"
                className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1"
              >
                All orders <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {ordersLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Loading…
                </div>
              ) : pending.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No orders waiting on you right now.
                </div>
              ) : (
                <ul className="space-y-3">
                  {pending.map((order) => (
                    <li
                      key={order.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          From {order.sender_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {order.sender_address || "No origin address"}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Submitted {formatDate(order.submitted_at)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        disabled={updating === order.id}
                        onClick={() => confirmReceived(order)}
                        className="shrink-0 self-stretch sm:self-auto"
                      >
                        {updating === order.id ? "Updating…" : "Mark delivered"}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4" /> Incoming ({incoming.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {incoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing on the way at the moment.
                </p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {incoming.slice(0, 5).map((order) => (
                    <RecentOrderRow
                      key={order.id}
                      order={order}
                      counterpartyLabel={order.sender_name}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <QuickActions role="receiver" />
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

interface AdminOverview {
  zones: DriverZone[];
  orders: Order[];
  drivers: DriverSummary[];
  receivers: ReceiverSummary[];
  connections: ZoneConnection[];
}

function AdminDashboard() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listDriverZones(),
      listOrders(),
      listDrivers(),
      listReceivers(),
      listZoneConnections(),
    ])
      .then(([zones, orders, drivers, receivers, connections]) => {
        if (cancelled) return;
        setData({ zones, orders, drivers, receivers, connections });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load admin overview");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <DashboardLoading />;
  if (error) return <DashboardError message={error} />;
  if (!data) return null;

  const orderCounts = data.orders.reduce(
    (acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    },
    { submitted: 0, delivering: 0, received: 0 } as Record<
      "submitted" | "delivering" | "received",
      number
    >
  );

  const totalCells = data.zones.reduce((sum, z) => sum + z.cell_count, 0);
  const availableZones = data.zones.filter((z) => z.available).length;
  const overlaps = data.connections.filter((c) => c.connection_type === "overlap").length;
  const adjacencies = data.connections.length - overlaps;

  return (
    <>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Transporters"
          value={data.drivers.length}
          icon={Truck}
          hint={`${data.zones.length} zones (${availableZones} available)`}
          accent="blue"
        />
        <StatCard
          label="Senders & receivers"
          value={data.receivers.length}
          icon={Users}
          hint="Active receivers on platform"
          accent="violet"
        />
        <StatCard
          label="Orders"
          value={data.orders.length}
          icon={Package}
          hint={`${orderCounts.delivering} in flight · ${orderCounts.submitted} pending`}
          accent="amber"
        />
        <StatCard
          label="Zone graph"
          value={data.connections.length}
          icon={Workflow}
          hint={`${overlaps} overlap · ${adjacencies} adjacent`}
          accent="green"
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Order pipeline</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <PipelineCell
                label="Submitted"
                value={orderCounts.submitted}
                tone="amber"
              />
              <PipelineCell
                label="Delivering"
                value={orderCounts.delivering}
                tone="blue"
              />
              <PipelineCell
                label="Received"
                value={orderCounts.received}
                tone="green"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Newest zones</CardTitle>
              <Link
                href="/driver-zones"
                className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {data.zones.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No driver zones registered yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {data.zones.slice(0, 5).map((zone) => (
                    <li
                      key={zone.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{zone.zone_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {zone.driver_name} · {zone.cell_count} cells · res{" "}
                          {zone.resolution}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatDate(zone.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>System totals</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <SystemStat label="H3 cells indexed" value={totalCells} icon={Hexagon} />
              <SystemStat label="Available zones" value={availableZones} icon={Shapes} />
              <SystemStat
                label="Followed pairs"
                value={data.drivers.filter((d) => d.followed).length}
                icon={Users}
              />
              <SystemStat label="Overlaps" value={overlaps} icon={Boxes} />
              <SystemStat label="Adjacencies" value={adjacencies} icon={Workflow} />
              <SystemStat label="Receivers" value={data.receivers.length} icon={Inbox} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <QuickActions role="admin" />
          <MapPreviewCard zones={data.zones} />
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function PipelineCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "blue" | "green";
}) {
  const toneClasses = {
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  }[tone];
  return (
    <div className={cn("rounded-xl border px-4 py-4 text-center", toneClasses)}>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      <p className="text-xs font-medium mt-1 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function SystemStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Hexagon;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 px-3 py-2.5">
      <div className="h-9 w-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-base font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function RecentOrderRow({
  order,
  counterpartyLabel,
}: {
  order: Order;
  counterpartyLabel: string;
}) {
  const StatusIcon =
    order.status === "received"
      ? CheckCircle2
      : order.status === "delivering"
        ? Truck
        : Clock;
  const tone =
    order.status === "received"
      ? "text-emerald-600 dark:text-emerald-300"
      : order.status === "delivering"
        ? "text-blue-600 dark:text-blue-300"
        : "text-amber-600 dark:text-amber-300";
  return (
    <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0", tone)}>
          <StatusIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{counterpartyLabel}</p>
          <p className="text-xs text-muted-foreground truncate">
            {order.destination_address || order.sender_address || "—"}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-medium capitalize">{order.status}</p>
        <p className="text-[11px] text-muted-foreground">{formatDate(order.submitted_at)}</p>
      </div>
    </li>
  );
}

function DashboardLoading() {
  return (
    <div className="px-4 sm:px-6 pb-10 space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-64 rounded-2xl bg-muted animate-pulse" />
        <div className="h-64 rounded-2xl bg-muted animate-pulse" />
      </div>
    </div>
  );
}

function DashboardError({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-danger/10 text-danger flex items-center justify-center shrink-0">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold">Couldn&apos;t load your dashboard</p>
            <p className="text-sm text-muted-foreground mt-1">{message}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Narrow `DashboardStats` to the variant for the caller's role. The backend
 * always returns the shape that matches the authenticated user, so this is
 * just a type assertion after a runtime sanity check.
 */
function useDashboardStats<T extends DashboardStats>(expectedRole: T["role"]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDashboardStats()
      .then((stats) => {
        if (cancelled) return;
        if (stats.role !== expectedRole) {
          setError("Dashboard stats payload didn't match the expected role.");
          return;
        }
        setData(stats as T);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load stats");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expectedRole]);

  return { data, error, loading };
}

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function greetingForRole(role: "admin" | "driver" | "sender" | "receiver"): string {
  switch (role) {
    case "driver":
      return "See what needs your attention, then manage zones and trust.";
    case "sender":
      return "Send new orders and see what your deliveries are doing.";
    case "receiver":
      return "Confirm incoming deliveries and keep tabs on what's on the way.";
    case "admin":
      return "System-wide overview across drivers, senders, receivers, and orders.";
  }
}
