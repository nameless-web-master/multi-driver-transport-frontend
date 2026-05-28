"use client";

import Link from "next/link";
import {
  Building2,
  Calendar,
  ExternalLink,
  LogOut,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { formatDate, userInitials } from "@/lib/utils";

export function SettingsPage() {
  const { user, logout } = useAuth();

  return (
    <DashboardShell title="Settings" subtitle="Manage your account, location, and session.">
      <div className="px-4 sm:px-6 pb-10 max-w-4xl space-y-6">
        {user && (
          <>
            <Card>
              <CardContent className="p-6 sm:p-7">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                  <div className="h-20 w-20 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold shadow-card">
                    {userInitials(user.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-semibold truncate">{user.full_name}</h2>
                    <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <RoleBadge role={user.role} size="md" />
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          user.is_active
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                        }`}
                      >
                        <ShieldCheck className="h-3 w-3" />
                        {user.is_active ? "Active" : "Disabled"}
                      </span>
                      {user.role === "driver" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                          <Star className="h-3 w-3" />
                          Trust {user.trustworthiness}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Contact</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <SettingsRow icon={Mail} label="Email" value={user.email} />
                  <SettingsRow icon={Phone} label="Phone" value={user.phone || "—"} />
                  {user.company_name && (
                    <SettingsRow
                      icon={Building2}
                      label="Company"
                      value={user.company_name}
                    />
                  )}
                  <SettingsRow
                    icon={Calendar}
                    label="Member since"
                    value={formatDate(user.created_at)}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Location</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <SettingsRow
                    icon={MapPin}
                    label="Address"
                    value={user.address || "No address on file"}
                  />
                  {user.lat != null && user.lng != null ? (
                    <SettingsRow
                      icon={MapPin}
                      label="Coordinates"
                      value={
                        <span className="font-mono">
                          {user.lat.toFixed(5)}, {user.lng.toFixed(5)}
                        </span>
                      }
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No coordinates are stored — distance-based filters will fall back
                      to a custom location.
                    </p>
                  )}
                  <Link
                    href="/map-view"
                    className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                  >
                    Open map view <ExternalLink className="h-3 w-3" />
                  </Link>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Session</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  Sign out on this device. Your refresh token will be revoked.
                </p>
                <Button variant="outline" onClick={() => logout()} className="self-start sm:self-auto">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function SettingsRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-9 w-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-sm font-medium break-words">{value}</p>
      </div>
    </div>
  );
}
