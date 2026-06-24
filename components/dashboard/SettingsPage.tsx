"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  LogOut,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMapDefaultLocation } from "@/hooks/useMapDefaultLocation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { PricingSettingsCard } from "@/components/dashboard/PricingSettingsCard";
import { RegionalPricingCard } from "@/components/dashboard/RegionalPricingCard";
import { formatDate, userInitials } from "@/lib/utils";

const UserLocationMap = dynamic(
  () =>
    import("@/components/map/UserLocationMap").then((m) => m.UserLocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[520px] w-full rounded-xl bg-muted animate-pulse flex items-center justify-center text-sm text-muted-foreground">
        Loading map…
      </div>
    ),
  },
);

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [showLocationMap, setShowLocationMap] = useState(false);
  const fallbackLocation = useMapDefaultLocation();

  const mapLocation = useMemo(() => {
    if (user?.lat != null && user?.lng != null) {
      return { lat: user.lat, lng: user.lng };
    }
    return fallbackLocation;
  }, [user?.lat, user?.lng, fallbackLocation]);

  return (
    <DashboardShell
      title="Settings"
      subtitle="Manage your account, location, and session."
    >
      <div className="px-4 sm:px-6 pb-10 space-y-6">
        {user && (
          <>
            <div
              className={
                user.role === "admin"
                  ? "grid grid-cols-1 lg:grid-cols-2 gap-6"
                  : "grid grid-cols-1 gap-6"
              }
            >
              <div className="flex flex-col gap-6 w-full">
                <Card>
                  <CardContent className="flex justify-between p-6 sm:p-7">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                      <div className="h-20 w-20 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold shadow-card">
                        {userInitials(user.full_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-xl font-semibold truncate">
                          {user.full_name}
                        </h2>
                        <p className="text-sm text-muted-foreground truncate">
                          {user.email}
                        </p>
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
                    <Button
                      variant="danger"
                      onClick={() => logout()}
                      className="self-start sm:self-auto"
                    >
                      <LogOut className="h-4 w-4" /> Log out
                    </Button>
                  </CardContent>
                </Card>

                <div className="grid gap-2">
                  <div
                    className={
                      user.role === "admin"
                        ? "flex flex-col gap-2"
                        : "grid grid-cols-1 lg:grid-cols-2 gap-2"
                    }
                  >
                    <Card>
                      <CardHeader>
                        <CardTitle>Contact</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <SettingsRow
                          icon={Mail}
                          label="Email"
                          value={user.email}
                        />
                        <SettingsRow
                          icon={Phone}
                          label="Phone"
                          value={user.phone || "—"}
                        />
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
                            No coordinates are stored — distance-based filters
                            will fall back to a custom location.
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowLocationMap((open) => !open)}
                          className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                        >
                          {showLocationMap ? "Hide map" : "Show on map"}
                          {user.role === "admin" &&
                            (showLocationMap ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            ))}
                        </button>
                        {user.role === "admin" &&
                          showLocationMap &&
                          (mapLocation ? (
                            <UserLocationMap
                              lat={mapLocation.lat}
                              lng={mapLocation.lng}
                              label={user.address || user.full_name}
                            />
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No location is available to show on the map. Add
                              an address with coordinates to your profile, or
                              allow browser location access.
                            </p>
                          ))}
                      </CardContent>
                    </Card>
                  </div>
                  {user.role !== "admin" && showLocationMap && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Map View</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {mapLocation ? (
                          <UserLocationMap
                            lat={mapLocation.lat}
                            lng={mapLocation.lng}
                            label={user.address || user.full_name}
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            No location is available to show on the map. Add an
                            address with coordinates to your profile, or allow
                            browser location access.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
              {user.role === "admin" && (
                <div className="grid gap-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Pricing engine</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <PricingSettingsCard />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Regional pricing defaults</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <RegionalPricingCard />
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
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
