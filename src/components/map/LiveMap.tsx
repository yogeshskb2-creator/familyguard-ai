"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Crosshair, Expand, Info, LocateFixed, MapPinned, RefreshCcw } from "lucide-react";
import { useSharing } from "@/components/location/LocationSharingProvider";
import { Avatar, Badge, Button, Card, Notice } from "@/components/ui";
import { useFamilyLocations } from "@/hooks/useFamilyLocations";
import { useFamilyZones } from "@/hooks/useFamilyZones";
import { publicEnv } from "@/lib/env";
import { formatAccuracy } from "@/lib/location/geo";
import { placedMembers } from "@/lib/location/map";
import { cn, timeAgo } from "@/lib/utils";
import { GoogleFamilyMap } from "./GoogleFamilyMap";
import { MapErrorBoundary } from "./MapErrorBoundary";
import { SchematicMap } from "./SchematicMap";
import type { MyPosition } from "./types";

/** Google's documented demo Map ID — enough for Advanced Markers in development. */
const DEMO_MAP_ID = "DEMO_MAP_ID";

type MapMode = { kind: "google" } | { kind: "schematic"; reason: "no_key" | "auth" | "load" };

const FALLBACK_COPY: Record<"no_key" | "auth" | "load", string> = {
  no_key: "Google Maps isn't configured (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set).",
  auth: "Google Maps rejected the API key — check that it's valid, the Maps JavaScript API is enabled, billing is on, and this domain is allowed.",
  load: "Google Maps couldn't be loaded (network or browser blocked it).",
};

export function LiveMap({
  families,
  myUid,
  initialFamilyId,
  compact = false,
  zonesVersion = 0,
}: {
  families: { id: string; name: string }[];
  myUid: string;
  initialFamilyId?: string;
  compact?: boolean;
  /** Bump to reload safe zones after they've been edited. */
  zonesVersion?: number;
}) {
  const [familyId, setFamilyId] = useState(initialFamilyId ?? families[0]?.id ?? null);
  const { members, serverNow, error, loading, reload } = useFamilyLocations(familyId);
  const { zones } = useFamilyZones(familyId, zonesVersion);
  const sharing = useSharing();
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [fitToken, setFitToken] = useState(0);
  const [meToken, setMeToken] = useState(0);
  const [localMe, setLocalMe] = useState<MyPosition | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [mode, setMode] = useState<MapMode>(
    publicEnv.mapsApiKey ? { kind: "google" } : { kind: "schematic", reason: "no_key" },
  );

  const placed = useMemo(() => placedMembers(members ?? []), [members]);

  // Your own position: what you're sharing (if live), else a local-only fix you asked for.
  const me: MyPosition | null =
    sharing.status === "live" && sharing.lastSent
      ? { lat: sharing.lastSent.lat, lng: sharing.lastSent.lng, accuracy: sharing.lastSent.accuracy, kind: "shared" }
      : localMe;

  // Keep the first reason we learn (an auth rejection is more useful than the crash it can cause).
  const onFailure = useCallback(
    (reason: "auth" | "load") => setMode((m) => (m.kind === "schematic" ? m : { kind: "schematic", reason })),
    [],
  );
  const onCrash = useCallback(() => onFailure("load"), [onFailure]);

  /**
   * "My location" only ever shows your position on THIS screen. It does not
   * send anything to the server — sharing is a separate, explicit choice.
   */
  async function locateMe() {
    setMeError(null);
    if (me) return setMeToken((t) => t + 1);
    if (!("geolocation" in navigator) || !window.isSecureContext) return setMeError("Location isn't available in this browser.");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocalMe({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.max(1, p.coords.accuracy), kind: "local" });
        setMeToken((t) => t + 1);
      },
      (e) => setMeError(e.code === 1 ? "Location permission was denied." : "Couldn't get your location."),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
    );
  }

  if (!familyId) return null;
  const familyName = families.find((f) => f.id === familyId)?.name ?? "";
  const onlineCount = placed.filter((m) => m.location.presence === "online").length;

  const viewProps = {
    familyId,
    members: placed,
    zones,
    myUid,
    me,
    selectedUid,
    onSelect: setSelectedUid,
    now: serverNow,
    fitToken,
    meToken,
    compact,
  };

  const map = (
    <div className={cn("relative overflow-hidden rounded-xl ring-1 ring-white/10", compact ? "h-64" : "h-[58vh] min-h-[380px]")}>
      <MapErrorBoundary onError={onCrash} fallback={<SchematicMap {...viewProps} />}>
        {mode.kind === "google" ? (
          <GoogleFamilyMap
            {...viewProps}
            apiKey={publicEnv.mapsApiKey}
            mapId={publicEnv.mapsMapId || DEMO_MAP_ID}
            onFailure={onFailure}
          />
        ) : (
          <SchematicMap {...viewProps} />
        )}
      </MapErrorBoundary>
      {members && placed.length === 0 && !me && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
          <div className="glass-strong pointer-events-auto max-w-xs rounded-xl p-4">
            <MapPinned className="mx-auto h-6 w-6 text-neon-cyan" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-white">Nobody is sharing with {familyName} right now</p>
            <p className="mt-1 text-xs text-slate-400">Each member chooses if and when to share their location.</p>
          </div>
        </div>
      )}
      {!compact && (
        <div className="absolute right-3 top-3 flex flex-col gap-2">
          <Button size="sm" variant="secondary" onClick={() => setFitToken((t) => t + 1)} disabled={placed.length === 0 && zones.length === 0} aria-label="Fit everyone on the map">
            <Expand className="h-3.5 w-3.5" aria-hidden="true" /> Fit everyone
          </Button>
          <Button size="sm" variant="secondary" onClick={locateMe} aria-label="Show my location">
            <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" /> My location
          </Button>
        </div>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className="space-y-2">
        {map}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            {placed.length} sharing · {onlineCount} online
          </span>
          <Link href={`/map?family=${familyId}`} className="font-medium text-neon-cyan hover:underline">
            Open full map →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {families.length > 1 ? (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            Family
            <select
              value={familyId}
              onChange={(e) => {
                setFamilyId(e.target.value);
                setSelectedUid(null);
                setFitToken((t) => t + 1);
              }}
              className="h-9 rounded-lg border border-white/10 bg-ink-900/70 px-2 text-sm text-white"
            >
              {families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="font-medium text-white">{familyName}</span>
        )}
        <Badge tone="cyan" dot data-testid="sharing-count">
          {placed.length} of {members?.length ?? "…"} sharing
        </Badge>
        <Badge>{onlineCount} online</Badge>
        <Button size="sm" variant="ghost" onClick={reload} loading={loading} aria-label="Refresh locations" className="ml-auto">
          {!loading && <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />} Refresh
        </Button>
      </div>

      {mode.kind === "schematic" && (
        <Notice tone="warn" title="Schematic view — no map tiles">
          {FALLBACK_COPY[mode.reason]} Positions and distances below are real and to scale, but streets aren&apos;t shown. Use
          “Directions” on a member to open their location in Google Maps.
        </Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      {meError && <Notice tone="danger">{meError}</Notice>}
      {me?.kind === "local" && (
        <Notice tone="info">
          Your blue dot is shown only on this screen. It is <strong>not</strong> shared —{" "}
          <Link href="/settings#location" className="underline">
            turn on location sharing
          </Link>{" "}
          if you want your family to see you.
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {map}
        <Card className="p-3">
          <ul aria-label="Members" className="space-y-1">
            {(members ?? []).map((m) => {
              const l = m.sharing ? m.location : null;
              return (
                <li key={m.uid}>
                  <button
                    type="button"
                    disabled={!l}
                    onClick={() => setSelectedUid(m.uid)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                      l ? "hover:bg-white/[0.05]" : "cursor-default opacity-60",
                      selectedUid === m.uid && "bg-white/[0.07]",
                    )}
                    aria-label={l ? `Locate ${m.displayName}` : `${m.displayName} is not sharing`}
                  >
                    <Avatar name={m.displayName} color={m.color} size={32} status={!l ? "offline" : l.presence === "online" ? "sharing" : "online"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">
                        {m.displayName} {m.uid === myUid && <span className="text-slate-500">(you)</span>}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {l
                          ? `${l.presence === "online" ? "Updated" : "Last seen"} ${timeAgo(l.updatedAt, serverNow)} · ${formatAccuracy(l.accuracy)}`
                          : "Not sharing"}
                      </span>
                    </span>
                    {l && <Crosshair className="h-4 w-4 text-slate-500" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 flex gap-1.5 border-t border-white/5 px-2 pt-3 text-[11px] leading-relaxed text-slate-500">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            Updates every 20 s. Web browsers pause location when FamilyGuard isn&apos;t open, so some members show their last
            known location.
          </p>
        </Card>
      </div>
    </div>
  );
}
