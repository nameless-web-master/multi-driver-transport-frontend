"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  Hexagon,
  Info,
  Layers,
  Link2,
  Loader2,
  Map as MapIcon,
  Plane,
  RefreshCw,
  Shapes,
  Workflow,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  deactivateZoneConnection,
  invalidateCache,
  listZoneConnections,
  recalculateZoneConnections,
} from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { formatCellCoords } from "@/lib/geo";
import { MAP_EMPTY_CELLS } from "@/lib/mapConstants";
import {
  connectionMode,
  isHubMode,
  normalizeTransportMode,
  TRANSPORT_MODE_META,
} from "@/lib/transportMode";
import type {
  ConnectionType,
  DriverZone,
  TransportMode,
  ZoneConnection,
  ZoneConnectionParty,
} from "@/types";

import { H3MapView } from "@/components/map/H3MapViewDynamic";

type Filter = "all" | ConnectionType;

const CONNECTION_BADGE: Record<
  ConnectionType,
  { label: string; className: string; icon: typeof Link2 }
> = {
  overlap: {
    label: "Overlap",
    className:
      "bg-amber-500/15 text-amber-700 dark:text-amber-200 border border-amber-500/30",
    icon: Layers,
  },
  adjacent: {
    label: "Adjacent",
    className:
      "bg-sky-500/15 text-sky-700 dark:text-sky-200 border border-sky-500/30",
    icon: Link2,
  },
  hub: {
    label: "Hub transfer",
    className:
      "bg-violet-500/15 text-violet-700 dark:text-violet-200 border border-violet-500/30",
    icon: Plane,
  },
};

export function ZoneConnectionsPage() {
  const { user } = useAuth();
  const canRecalc = user?.role === "admin" || user?.role === "driver";

  const [connections, setConnections] = useState<ZoneConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalcing, setRecalcing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

  // ---- Data loading -------------------------------------------------------

  const refresh = useCallback(async (opts: { bypassCache?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      // Each connection ships the full H3 cells for both zones, so we don't
      // need to call /api/driver-zones here — that endpoint hides other
      // drivers' zones from a driver and would block the map from rendering.
      if (opts.bypassCache) invalidateCache("/api/zone-connections");
      const conns = await listZoneConnections();
      setConnections(conns);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load zone connections",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Scroll the detail panel into view whenever a row is selected — the panel
  // renders below the table so users wouldn't always notice it otherwise.
  useEffect(() => {
    if (selectedId == null) return;
    const node = detailRef.current;
    if (!node) return;
    // requestAnimationFrame so the panel has actually rendered first.
    requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [selectedId, showMap]);

  function showMessage(text: string) {
    setSuccess(text);
    setTimeout(() => setSuccess(null), 4000);
  }

  async function handleRecalc() {
    setRecalcing(true);
    setError(null);
    try {
      const result = await recalculateZoneConnections();
      showMessage(
        `Recalculated. ${result.total_connections} connection${
          result.total_connections === 1 ? "" : "s"
        } detected · ${result.overlap_connections} overlap · ${result.adjacent_connections} adjacent · ${
          result.hub_connections ?? 0
        } hub across ${result.zones_compared} zones.`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recalculation failed");
    } finally {
      setRecalcing(false);
    }
  }

  async function handleDeactivate(c: ZoneConnection) {
    if (
      !window.confirm(
        "Deactivate this connection? It will reappear on the next recalculation if the zones still warrant it.",
      )
    ) {
      return;
    }
    setDeletingId(c.id);
    try {
      await deactivateZoneConnection(c.id);
      setConnections((prev) => prev.filter((x) => x.id !== c.id));
      if (selectedId === c.id) {
        setSelectedId(null);
        setShowMap(false);
      }
      showMessage("Connection deactivated.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not deactivate connection",
      );
    } finally {
      setDeletingId(null);
    }
  }

  // ---- Derived data -------------------------------------------------------

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return connections.filter((c) => {
      if (filter !== "all" && c.connection_type !== filter) return false;
      if (!q) return true;
      const hay = [
        c.zone_a.zone_name,
        c.zone_b.zone_name,
        c.zone_a.transport_name,
        c.zone_b.transport_name,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [connections, filter, query]);

  const stats = useMemo(() => {
    const overlap = connections.filter(
      (c) => c.connection_type === "overlap",
    ).length;
    const adjacent = connections.filter(
      (c) => c.connection_type === "adjacent",
    ).length;
    const hub = connections.filter((c) => c.connection_type === "hub").length;
    const transferCellSet = new Set<string>();
    connections.forEach((c) =>
      c.transfer_cells.forEach((cell) => transferCellSet.add(cell)),
    );
    return {
      total: connections.length,
      overlap,
      adjacent,
      hub,
      transferCells: transferCellSet.size,
    };
  }, [connections]);

  const selected = useMemo(
    () =>
      selectedId == null
        ? null
        : (connections.find((c) => c.id === selectedId) ?? null),
    [selectedId, connections],
  );

  /**
   * H3MapView expects DriverZone-shaped inputs. We build minimal display-only
   * zones from the connection payload itself so the map works for any viewer
   * — including a driver looking at a connection that involves another
   * driver's zone they can't access through /api/driver-zones.
   */
  const selectedZonePair = useMemo<DriverZone[]>(() => {
    if (!selected) return [];
    return [
      partyToDisplayZone(selected.zone_a),
      partyToDisplayZone(selected.zone_b),
    ];
  }, [selected]);

  // Use the finer of the two zone resolutions — H3MapView's `resolution` prop
  // is mostly used by drawing mode (disabled here) but a sensible value keeps
  // any internal hex math accurate.
  const mapResolution = selected
    ? Math.max(
        selected.zone_a.resolution || 0,
        selected.zone_b.resolution || 0,
      ) || 8
    : 8;

  // ---- Render -------------------------------------------------------------

  return (
    <div className="px-6 pb-8 space-y-6">
      {(error || success) && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm flex items-start gap-2",
            error
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
              : "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200",
          )}
        >
          {error ? (
            <Info className="h-4 w-4 mt-0.5" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mt-0.5" />
          )}
          <span>{error ?? success}</span>
        </div>
      )}

      {/* Summary cards */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatTile
          icon={<Workflow className="h-5 w-5" />}
          label="Total Connections"
          value={stats.total}
        />
        <StatTile
          icon={<Layers className="h-5 w-5" />}
          label="Overlap Connections"
          value={stats.overlap}
        />
        <StatTile
          icon={<Link2 className="h-5 w-5" />}
          label="Adjacent Connections"
          value={stats.adjacent}
        />
        <StatTile
          icon={<Plane className="h-5 w-5" />}
          label="Hub Transfers"
          value={stats.hub}
        />
        <StatTile
          icon={<Hexagon className="h-5 w-5" />}
          label="Transfer Cells Detected"
          value={stats.transferCells}
        />
      </section>

      {/* Action bar */}
      <Card>
        <CardContent className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleRecalc}
              disabled={recalcing || !canRecalc}
              title={
                canRecalc
                  ? "Wipe and rebuild the entire zone-connection graph"
                  : "Only admins and drivers can recalculate"
              }
            >
              {recalcing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {recalcing ? "Recalculating…" : "Recalculate Connections"}
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={() => refresh({ bypassCache: true })}
              disabled={loading || recalcing}
              title="Re-fetch from the server (bypass cache)"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              className="w-36"
            >
              <option value="all">All types</option>
              <option value="overlap">Overlap</option>
              <option value="adjacent">Adjacent</option>
              <option value="hub">Hub transfer</option>
            </Select>
            <Input
              placeholder="Search transport or zone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="md:w-72"
            />
          </div>
        </CardContent>
      </Card>
      {/* Detail drawer + map */}
      {selected && (
        <div ref={detailRef}>
          <ConnectionDetail
            connection={selected}
            zonePair={selectedZonePair}
            showMap={showMap}
            mapResolution={mapResolution}
            onToggleMap={() => setShowMap((v) => !v)}
            onClose={() => {
              setSelectedId(null);
              setShowMap(false);
            }}
          />
        </div>
      )}

      {/* Connections table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Workflow className="h-4 w-4" /> Zone Connections ({filtered.length}
            )
          </CardTitle>
          <p className="hidden md:block text-xs text-muted-foreground">
            Click a row for details, then View on Map to inspect the handoff
            cells.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : connections.length === 0 ? (
            <EmptyState canRecalc={canRecalc} />
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No connections match your filters.
            </div>
          ) : (
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-3 pr-4 font-medium">Transport A</th>
                  <th className="py-3 pr-4 font-medium">Zone A</th>
                  <th className="py-3 pr-4 font-medium">Transport B</th>
                  <th className="py-3 pr-4 font-medium">Zone B</th>
                  <th className="py-3 pr-4 font-medium">Type</th>
                  <th className="py-3 pr-4 font-medium text-right">
                    Transfer Cells
                  </th>
                  <th className="py-3 pr-4 font-medium">Recommended Cell</th>
                  <th className="py-3 pr-4 font-medium text-right">
                    Adjacent Pairs
                  </th>
                  <th className="py-3 pr-4 font-medium">Created</th>
                  <th className="py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const isSelected = selectedId === c.id;
                  const badge = CONNECTION_BADGE[c.connection_type];
                  const Badge = badge.icon;
                  const hubLabel = hubAnchorLabel(c);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => {
                        setSelectedId(c.id);
                      }}
                      className={cn(
                        "border-b border-border/70 last:border-0 cursor-pointer transition-colors",
                        isSelected ? "bg-primary/5" : "hover:bg-muted/50",
                      )}
                    >
                      <td className="py-3 pr-4 font-medium">
                        {c.zone_a.transport_name}
                      </td>
                      <td className="py-3 pr-4">{c.zone_a.zone_name}</td>
                      <td className="py-3 pr-4 font-medium">
                        {c.zone_b.transport_name}
                      </td>
                      <td className="py-3 pr-4">{c.zone_b.zone_name}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                            badge.className,
                          )}
                        >
                          <Badge className="h-3 w-3" />
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono">
                        {c.transfer_cell_count}
                      </td>
                      <td className="py-3 pr-4 text-xs">
                        {hubLabel ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/20 px-2 py-0.5">
                            <Plane className="h-3 w-3" />
                            {hubLabel}
                          </span>
                        ) : c.recommended_transfer_cell ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 px-2 py-0.5 font-mono">
                            <Hexagon className="h-3 w-3" />
                            {formatCellCoords(c.recommended_transfer_cell)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono">
                        {c.adjacent_pair_count}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                        {formatDate(c.created_at)}
                      </td>
                      <td
                        className="py-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedId(c.id);
                              setShowMap(true);
                            }}
                            title="View on map"
                          >
                            <MapIcon className="h-4 w-4" />
                            <span className="hidden xl:inline">Map</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedId(c.id);
                              setShowMap(false);
                            }}
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                            <span className="hidden xl:inline">Details</span>
                          </Button>
                          {canRecalc && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={deletingId === c.id}
                              onClick={() => handleDeactivate(c)}
                              title="Deactivate this connection"
                            >
                              <X className="h-4 w-4 text-danger" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            {icon}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tracking-tight">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ canRecalc }: { canRecalc: boolean }) {
  return (
    <div className="py-12 text-center space-y-3">
      <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
        <Workflow className="h-6 w-6" />
      </div>
      <div>
        <p className="font-medium">No zone connections found.</p>
        <p className="text-sm text-muted-foreground mt-1">
          Create overlapping or adjacent transport zones, then{" "}
          {canRecalc ? "recalculate" : "ask an admin to recalculate"}.
        </p>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Link href="/driver-zones">
          <Button variant="outline" size="sm">
            <Shapes className="h-4 w-4" />
            Go to Transport Zones
          </Button>
        </Link>
      </div>
    </div>
  );
}

interface ConnectionDetailProps {
  connection: ZoneConnection;
  zonePair: DriverZone[];
  showMap: boolean;
  mapResolution: number;
  onToggleMap: () => void;
  onClose: () => void;
}

function ConnectionDetail({
  connection,
  zonePair,
  showMap,
  mapResolution,
  onToggleMap,
  onClose,
}: ConnectionDetailProps) {
  const badge = CONNECTION_BADGE[connection.connection_type];
  const Badge = badge.icon;
  const hasFullZones =
    zonePair.length === 2 &&
    zonePair[0].h3_cells.length > 0 &&
    zonePair[1].h3_cells.length > 0;
  // Air/sea connections hand off at the hub/port, not at a shared map cell.
  // Suppress the misleading cell-level transfer/adjacency overlays for them.
  const linkMode = connectionMode(
    normalizeTransportMode(connection.transport_method_a),
    normalizeTransportMode(connection.transport_method_b),
  );
  const isHubConnection =
    connection.connection_type === "hub" || isHubMode(linkMode);
  const hubRole = connection.hub_role_a ?? connection.hub_role_b;
  const hubParty = connection.hub_role_a
    ? connection.zone_a
    : connection.zone_b;
  const anchoredHub =
    hubRole === "departure"
      ? hubParty.departure_hub
      : hubRole === "arrival"
        ? hubParty.arrival_hub
        : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="h-4 w-4" /> Connection #{connection.id}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span className="font-medium text-foreground">
              {connection.zone_a.transport_name}
            </span>
            <span>·</span>
            <span>{connection.zone_a.zone_name}</span>
            <ArrowRight className="h-3 w-3" />
            <span className="font-medium text-foreground">
              {connection.zone_b.transport_name}
            </span>
            <span>·</span>
            <span>{connection.zone_b.zone_name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
              badge.className,
            )}
          >
            <Badge className="h-3 w-3" />
            {badge.label}
          </span>
          <Button variant="outline" size="sm" onClick={onToggleMap}>
            <MapIcon className="h-4 w-4" />
            {showMap ? "Hide map" : "View on Map"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close details"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PartyCard
            color="#3b82f6"
            label="Zone A"
            transportName={connection.zone_a.transport_name}
            zoneName={connection.zone_a.zone_name}
            cellCount={connection.zone_a.cell_count}
            resolution={connection.zone_a.resolution}
            transportMethod={connection.transport_method_a}
          />
          <PartyCard
            color="#22c55e"
            label="Zone B"
            transportName={connection.zone_b.transport_name}
            zoneName={connection.zone_b.zone_name}
            cellCount={connection.zone_b.cell_count}
            resolution={connection.zone_b.resolution}
            transportMethod={connection.transport_method_b}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <Field
            label="Connection type"
            value={
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                  badge.className,
                )}
              >
                <Badge className="h-3 w-3" />
                {badge.label}
              </span>
            }
          />
          {isHubConnection ? (
            <Field
              label="Transfer point"
              value={
                anchoredHub
                  ? `${hubRole === "departure" ? "Departure" : "Arrival"} ${TRANSPORT_MODE_META[linkMode].hubNoun}: ${anchoredHub.name}`
                  : `${TRANSPORT_MODE_META[linkMode].label} ${TRANSPORT_MODE_META[linkMode].hubNoun} (endpoint)`
              }
            />
          ) : (
            <>
              <Field
                label="Transfer cells"
                value={`${connection.transfer_cell_count}`}
              />
              <Field
                label="Recommended transfer cell"
                value={
                  connection.recommended_transfer_cell ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 px-2 py-0.5 font-mono text-xs">
                      <Hexagon className="h-3 w-3" />
                      {formatCellCoords(connection.recommended_transfer_cell)}
                    </span>
                  ) : (
                    "—"
                  )
                }
              />
              <Field
                label="Adjacent pairs"
                value={`${connection.adjacent_pair_count}`}
              />
            </>
          )}
          <Field label="Created" value={formatDate(connection.created_at)} />
          <Field label="Updated" value={formatDate(connection.updated_at)} />
          <Field
            label="Status"
            value={connection.is_active ? "Active" : "Inactive"}
          />
        </div>

        {!isHubConnection && connection.transfer_cells.length > 0 && (
          <CellChipList
            title={
              connection.connection_type === "overlap"
                ? "Overlap (transfer) cells"
                : "Representative cells"
            }
            cells={connection.transfer_cells}
          />
        )}

        {!isHubConnection && connection.adjacent_cell_pairs.length > 0 && (
          <PairChipList pairs={connection.adjacent_cell_pairs} />
        )}

        {showMap && (
          <>
            <Legend type={connection.connection_type} linkMode={linkMode} />
            {hasFullZones ? (
              <div className="h-[460px] rounded-xl overflow-hidden border border-border">
                <H3MapView
                  key={`zone-conn-map-${connection.id}`}
                  height="100%"
                  resolution={mapResolution}
                  selectedCells={MAP_EMPTY_CELLS}
                  savedZones={zonePair}
                  /*
                    Land connections: for "overlap" paint the shared cells in
                    amber so the transfer region is obvious; "adjacent" relies
                    on the dashed adjacency lines alone (its stored transfer_cells
                    are just representative boundary cells of zone A).

                    Air/sea connections: no cell-level overlay at all — the
                    handoff is at the hub/port endpoint, not on the map surface.
                  */
                  transferCells={
                    !isHubConnection && connection.connection_type === "overlap"
                      ? connection.transfer_cells
                      : []
                  }
                  adjacentPairs={
                    isHubConnection ? [] : connection.adjacent_cell_pairs
                  }
                  interactive
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Cannot load full zone geometry for the map — the underlying
                zones may have been removed.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PartyCard({
  color,
  label,
  transportName,
  zoneName,
  cellCount,
  resolution,
  transportMethod,
}: {
  color: string;
  label: string;
  transportName: string;
  zoneName: string;
  cellCount: number;
  resolution: number;
  transportMethod: string | null;
}) {
  return (
    <div className="rounded-xl border border-border p-3 space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm"
          style={{ background: color }}
        />
        {label}
      </div>
      <p className="font-semibold">{transportName}</p>
      <p className="text-sm text-muted-foreground">{zoneName}</p>
      <p className="text-xs text-muted-foreground">
        {cellCount} cells · resolution r{resolution}
        {transportMethod ? ` · ${transportMethod}` : ""}
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function CellChipList({ title, cells }: { title: string; cells: string[] }) {
  const visible = cells.slice(0, 12);
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">
        {title} ({cells.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((cell) => (
          <span
            key={cell}
            className="rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 px-2.5 py-1 text-xs font-mono"
          >
            {formatCellCoords(cell)}
          </span>
        ))}
        {cells.length > visible.length && (
          <span className="text-xs text-muted-foreground self-center">
            +{cells.length - visible.length} more
          </span>
        )}
      </div>
    </div>
  );
}

function PairChipList({
  pairs,
}: {
  pairs: { from_cell: string; to_cell: string }[];
}) {
  const visible = pairs.slice(0, 10);
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">
        Adjacent cell pairs ({pairs.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((p, idx) => (
          <span
            key={`${p.from_cell}-${p.to_cell}-${idx}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 px-2.5 py-1 text-xs font-mono"
          >
            {formatCellCoords(p.from_cell)}
            <ArrowRight className="h-3 w-3" />
            {formatCellCoords(p.to_cell)}
          </span>
        ))}
        {pairs.length > visible.length && (
          <span className="text-xs text-muted-foreground self-center">
            +{pairs.length - visible.length} more
          </span>
        )}
      </div>
    </div>
  );
}

const VALID_TRANSPORT_MODES: readonly TransportMode[] = ["land", "air", "sea"];

function hubAnchorLabel(c: ZoneConnection): string | null {
  if (c.connection_type !== "hub") return null;
  const role = c.hub_role_a ?? c.hub_role_b;
  if (!role) return null;
  const party = c.hub_role_a ? c.zone_a : c.zone_b;
  const hub = role === "departure" ? party.departure_hub : party.arrival_hub;
  if (!hub?.name) return role === "departure" ? "Departure hub" : "Arrival hub";
  return `${role === "departure" ? "Departure" : "Arrival"}: ${hub.name}`;
}

/**
 * Build a minimal DriverZone-shaped object from a connection party so the
 * map can render. Most fields are placeholders — only the ones H3MapView
 * actually reads (h3_cells, resolution, names, transport_mode for the
 * tooltip, available for opacity) are meaningful.
 */
function partyToDisplayZone(p: ZoneConnectionParty): DriverZone {
  const mode = (p.transport_method ?? "land").toLowerCase() as TransportMode;
  const transport_mode: TransportMode = VALID_TRANSPORT_MODES.includes(mode)
    ? mode
    : "land";
  return {
    id: p.id,
    owner_user_id: p.transport_id,
    driver_name: p.transport_name,
    zone_name: p.zone_name,
    resolution: p.resolution,
    h3_cells: p.cells,
    cell_count: p.cell_count,
    transport_mode,
    boundary: null,
    departure_hub: p.departure_hub,
    arrival_hub: p.arrival_hub,
    departure_time: p.departure_time,
    arrival_time: p.arrival_time,
    base_fee: null,
    cost_per_h3_cell: null,
    cost_per_km: null,
    cost_per_kg: null,
    cost_per_volume_unit: null,
    time_of_day_factor: null,
    minimum_fee: null,
    currency: "USD",
    available: true,
    trust_payment_forwarder: false,
    driver_trustworthiness: 0,
    created_at: "",
    updated_at: "",
  };
}

function Legend({
  type,
  linkMode,
}: {
  type: ConnectionType;
  linkMode: ReturnType<typeof connectionMode>;
}) {
  const isHub = isHubMode(linkMode);
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-5 rounded bg-blue-500/30 border border-blue-500" />
        Zone A
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-5 rounded bg-green-500/30 border border-green-500" />
        Zone B
      </span>
      {isHub ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-full border-2 border-white"
            style={{ background: TRANSPORT_MODE_META[linkMode].color }}
          />
          {TRANSPORT_MODE_META[linkMode].label} hub/port — transfer at{" "}
          {TRANSPORT_MODE_META[linkMode].hubNoun}
        </span>
      ) : type === "overlap" ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-amber-500/40 border border-amber-700" />
          Overlap (shared transfer cell)
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0 w-5"
            style={{ borderTop: "2px dashed #b45309" }}
          />
          Adjacent — touching cell pair
        </span>
      )}
    </div>
  );
}
