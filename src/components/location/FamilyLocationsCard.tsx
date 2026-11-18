"use client";

import { ExternalLink, MapPinned, RefreshCcw } from "lucide-react";
import { Avatar, Badge, Button, Card, CardHeader, Notice } from "@/components/ui";
import { useFamilyLocations } from "@/hooks/useFamilyLocations";
import { formatAccuracy, googleMapsLink } from "@/lib/location/geo";
import { timeAgo } from "@/lib/utils";

/** Live list of members' shared locations for one family. */
export function FamilyLocationsCard({ familyId, myUid }: { familyId: string; myUid: string }) {
  const { members, serverNow, error, loading, reload: load } = useFamilyLocations(familyId);

  const sharingCount = members?.filter((m) => m.sharing).length ?? 0;

  return (
    <Card>
      <CardHeader
        icon={<MapPinned className="h-4 w-4" />}
        title="Live locations"
        description={members ? `${sharingCount} of ${members.length} sharing with this family` : "Loading…"}
        action={
          <Button size="sm" variant="ghost" onClick={load} loading={loading} aria-label="Refresh locations">
            {!loading && <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />}
          </Button>
        }
      />
      {error && <Notice tone="danger" className="mb-3">{error}</Notice>}
      <ul className="divide-y divide-white/5" aria-label="Member locations">
        {(members ?? []).map((m) => (
          <li key={m.uid} className="flex items-start gap-3 py-3" data-testid={`loc-${m.uid}`}>
            <Avatar
              name={m.displayName}
              color={m.color}
              status={!m.sharing ? "offline" : m.location?.presence === "online" ? "sharing" : "online"}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-white">
                  {m.displayName} {m.uid === myUid && <span className="text-slate-500">(you)</span>}
                </p>
                {m.location ? (
                  <Badge tone={m.location.presence === "online" ? "cyan" : "neutral"} dot className="shrink-0">
                    {m.location.presence === "online" ? "Online" : "Offline"}
                  </Badge>
                ) : (
                  <Badge className="shrink-0">Not sharing</Badge>
                )}
              </div>
              {m.location ? (
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                  <span className="text-slate-400">
                    {m.location.presence === "online" ? "Updated" : "Last seen"} {timeAgo(m.location.updatedAt, serverNow)} ·{" "}
                    {formatAccuracy(m.location.accuracy)}
                  </span>
                  <a
                    href={googleMapsLink(m.location.lat, m.location.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-neon-cyan hover:underline"
                  >
                    {m.location.lat.toFixed(4)}, {m.location.lng.toFixed(4)} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              ) : (
                <p className="mt-0.5 text-xs text-slate-500">Not sharing with this family</p>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-slate-500">
        “Offline” means no update in the last 2 minutes — web browsers pause location when FamilyGuard isn&apos;t open.
      </p>
    </Card>
  );
}
