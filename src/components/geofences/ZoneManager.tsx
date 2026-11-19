"use client";

import { useEffect, useState } from "react";
import { Briefcase, Building2, CircleCheck, GraduationCap, Home, LocateFixed, MapPin, Plus, Radar, Siren, Trash2, TriangleAlert, UserRound, Users } from "lucide-react";
import { LiveMap } from "@/components/map/LiveMap";
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Input, Notice } from "@/components/ui";
import { useFamilyLocations } from "@/hooks/useFamilyLocations";
import { useFamilyZones } from "@/hooks/useFamilyZones";
import { api } from "@/lib/api/client";
import { canManageInvites } from "@/lib/families/permissions";
import { createZoneSchema } from "@/lib/geofences/validation";
import { RADIUS_PRESETS, ZONE_KINDS, ZONE_LIMITS, formatRadius, watches } from "@/lib/geofences/zones";
import { distanceMeters } from "@/lib/location/geo";
import { placedMembers, type MemberLocationView } from "@/lib/location/map";
import { fieldErrors } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";
import type { FamilyRole, Geofence, ZoneKind } from "@/types/models";

const KIND: Record<ZoneKind, { label: string; Icon: typeof Home }> = {
  home: { label: "Home", Icon: Home },
  school: { label: "School", Icon: GraduationCap },
  office: { label: "Office", Icon: Briefcase },
  college: { label: "College", Icon: Building2 },
  custom: { label: "Other", Icon: MapPin },
};

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={cn("inline-flex items-center gap-1.5 text-xs", disabled ? "text-slate-500" : "text-slate-300")}>
      <input type="checkbox" className="h-3.5 w-3.5 accent-[#9b5cff]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Who is inside / outside this zone right now, from locations shared with the family. */
function ZoneStatus({ zone, members }: { zone: Geofence; members: MemberLocationView[] }) {
  const placed = placedMembers(members).filter((m) => watches(zone, m.uid));
  if (placed.length === 0) return <p className="text-xs text-slate-500">Nobody watched here is sharing their location right now.</p>;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={`Who is in ${zone.name}`}>
      {placed.map((m) => {
        const d = distanceMeters(zone, m.location);
        const inside = d <= zone.radius;
        return (
          <li
            key={m.uid}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
              inside ? "bg-safe/15 text-[#a8f5d8]" : "bg-danger/15 text-[#ffb3c0]",
            )}
          >
            {inside ? <CircleCheck className="h-3 w-3" aria-hidden="true" /> : <TriangleAlert className="h-3 w-3" aria-hidden="true" />}
            {m.displayName.split(" ")[0]} {inside ? "inside" : `outside · ${formatRadius(Math.round(d))} away`}
          </li>
        );
      })}
    </ul>
  );
}

function WatchPicker({
  members,
  value,
  disabled,
  onChange,
}: {
  members: { uid: string; displayName: string }[];
  value: string[];
  disabled?: boolean;
  onChange: (v: string[]) => void;
}) {
  return (
    <fieldset className="space-y-1.5" disabled={disabled}>
      <legend className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-300">
        <Users className="h-3.5 w-3.5" aria-hidden="true" /> Applies to
      </legend>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange([])}
          className={cn(
            "rounded-lg border px-2.5 py-1 text-xs",
            value.length === 0 ? "border-[#9B5CFF]/60 bg-[#9B5CFF]/15 text-white" : "border-white/10 text-slate-400 hover:text-white",
          )}
        >
          Everyone
        </button>
        {members.map((m) => {
          const on = value.includes(m.uid);
          return (
            <button
              key={m.uid}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((u) => u !== m.uid) : [...value, m.uid])}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-xs",
                on ? "border-[#9B5CFF]/60 bg-[#9B5CFF]/15 text-white" : "border-white/10 text-slate-400 hover:text-white",
              )}
            >
              {m.displayName}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ZoneRow({
  zone: serverZone,
  canManage,
  familyId,
  members,
  onChanged,
}: {
  zone: Geofence;
  canManage: boolean;
  familyId: string;
  members: MemberLocationView[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Optimistic copy so toggles respond instantly; re-synced whenever the server data changes.
  const [zone, setZone] = useState(serverZone);
  useEffect(() => {
    setZone(serverZone);
  }, [serverZone]);
  const { Icon, label } = KIND[zone.kind];

  async function patch(update: Partial<Geofence>) {
    const previous = zone;
    setZone({ ...zone, ...update });
    setBusy(true);
    setError(null);
    const res = await api(`/api/families/${familyId}/geofences/${zone.id}`, { method: "PATCH", body: update });
    setBusy(false);
    if (!res.ok) {
      setZone(previous); // roll back
      setError(res.message);
    }
    onChanged();
  }

  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.02] p-3" data-testid={`zone-row-${zone.id}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#9B5CFF]/15 text-[#c7a6ff]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-white">{zone.name}</p>
          <p className="text-xs text-slate-500">
            {label} · {formatRadius(zone.radius)} radius ·{" "}
            {zone.watchUids.length === 0
              ? "everyone"
              : members
                  .filter((m) => zone.watchUids.includes(m.uid))
                  .map((m) => m.displayName.split(" ")[0])
                  .join(", ") || `${zone.watchUids.length} people`}
          </p>
        </div>
        {zone.alertsEnabled && zone.alarmOnExit ? (
          <Badge tone="danger">Alarm on</Badge>
        ) : (
          <Badge tone={zone.alertsEnabled ? "purple" : "neutral"}>{zone.alertsEnabled ? "Alerts on" : "Alerts off"}</Badge>
        )}
        {canManage && (
          <Button size="sm" variant="ghost" aria-label={`Delete ${zone.name}`} onClick={() => setConfirm(true)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 pl-12">
        <Toggle label="Alerts" checked={zone.alertsEnabled} disabled={!canManage || busy} onChange={(v) => patch({ alertsEnabled: v })} />
        <Toggle label="On arrival" checked={zone.notifyOnEnter} disabled={!canManage || busy || !zone.alertsEnabled} onChange={(v) => patch({ notifyOnEnter: v })} />
        <Toggle label="On leaving" checked={zone.notifyOnExit} disabled={!canManage || busy || !zone.alertsEnabled} onChange={(v) => patch({ notifyOnExit: v })} />
        <Toggle label="🚨 Alarm when leaving" checked={zone.alarmOnExit} disabled={!canManage || busy || !zone.alertsEnabled} onChange={(v) => patch({ alarmOnExit: v })} />
      </div>
      <div className="mt-2 pl-12">
        <ZoneStatus zone={zone} members={members} />
      </div>
      {canManage && (
        <details className="mt-2 pl-12">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-white">Change who this zone applies to</summary>
          <div className="mt-2">
            <WatchPicker members={members} value={zone.watchUids} disabled={busy} onChange={(v) => patch({ watchUids: v })} />
          </div>
        </details>
      )}
      {error && <Notice tone="danger" className="mt-2">{error}</Notice>}
      <ConfirmDialog
        open={confirm}
        danger
        title={`Delete "${zone.name}"?`}
        description="Arrival and departure alerts for this place stop immediately."
        confirmLabel="Delete zone"
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          const res = await api(`/api/families/${familyId}/geofences/${zone.id}`, { method: "DELETE" });
          setBusy(false);
          setConfirm(false);
          if (!res.ok) setError(res.message);
          onChanged();
        }}
        onClose={() => setConfirm(false)}
      />
    </li>
  );
}

function CreateZoneForm({ familyId, members, onCreated }: { familyId: string; members: MemberLocationView[]; onCreated: () => void }) {
  const sharing = placedMembers(members);
  const [alarmOnExit, setAlarmOnExit] = useState(true);
  const [watchUids, setWatchUids] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ZoneKind>("home");
  const [radius, setRadius] = useState(150);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "safe" | "danger" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function useMyLocation() {
    setMsg(null);
    if (!("geolocation" in navigator) || !window.isSecureContext) return setMsg({ tone: "danger", text: "Location isn't available in this browser." });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(6));
        setLng(p.coords.longitude.toFixed(6));
        setMsg({ tone: "info", text: "Centre set to where you are now. (Used only to fill this form — nothing was shared.)" });
      },
      (e) => setMsg({ tone: "danger", text: e.code === 1 ? "Location permission was denied." : "Couldn't get your location." }),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const parsed = createZoneSchema.safeParse({
      name,
      kind,
      radius,
      lat: lat === "" ? NaN : Number(lat),
      lng: lng === "" ? NaN : Number(lng),
      alertsEnabled: true,
      notifyOnEnter: true,
      notifyOnExit: true,
      alarmOnExit,
      watchUids,
    });
    if (!parsed.success) {
      const f = fieldErrors(parsed.error);
      if ((f.lat || f.lng) && (lat === "" || lng === "")) f.lat = "Choose a centre: your location, a member's, or coordinates";
      return setErrors(f);
    }
    setErrors({});
    setBusy(true);
    const res = await api(`/api/families/${familyId}/geofences`, { method: "POST", body: parsed.data });
    setBusy(false);
    if (!res.ok) return setMsg({ tone: "danger", text: res.message });
    setName("");
    setLat("");
    setLng("");
    setMsg({ tone: "safe", text: `Safe zone “${parsed.data.name}” created.` });
    onCreated();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Create safe zone">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Input label="Name" placeholder="e.g. Home, Ria's school" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={40} />
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-300">Type</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Zone type">
          {ZONE_KINDS.map((k) => {
            const { Icon, label } = KIND[k];
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => {
                  setKind(k);
                  if (!name || Object.values(KIND).some((x) => x.label === name)) setName(k === "custom" ? "" : label);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs",
                  kind === k ? "border-[#9B5CFF]/60 bg-[#9B5CFF]/15 text-white" : "border-white/10 text-slate-400 hover:text-white",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label htmlFor="zone-radius" className="mb-1.5 flex justify-between text-xs font-medium text-slate-300">
          Radius <span className="text-white">{radius >= 1000 ? `${(radius / 1000).toFixed(1)} km` : `${radius} m`}</span>
        </label>
        <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Radius presets">
          {RADIUS_PRESETS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRadius(r)}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-xs",
                radius === r ? "border-[#9B5CFF]/60 bg-[#9B5CFF]/15 text-white" : "border-white/10 text-slate-400 hover:text-white",
              )}
            >
              {formatRadius(r)}
            </button>
          ))}
        </div>
        <input
          id="zone-radius"
          type="range"
          min={ZONE_LIMITS.minRadius}
          max={radius > 5000 ? ZONE_LIMITS.maxRadius : 5000}
          step={radius >= 5000 ? 500 : 50}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="w-full accent-[#9b5cff]"
        />
        {errors.radius && <p className="mt-1 text-xs text-[#ff8399]">{errors.radius}</p>}
      </div>
      <WatchPicker members={members} value={watchUids} onChange={setWatchUids} />
      <label className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/[0.06] p-3 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={alarmOnExit}
          onChange={(e) => setAlarmOnExit(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#ff4d6d]"
        />
        <span>
          <span className="inline-flex items-center gap-1 font-medium text-white">
            <Siren className="h-4 w-4 text-danger" aria-hidden="true" /> Alarm when someone leaves
          </span>
          <span className="block text-xs text-slate-400">
            Owners and guardians get a loud alarm with a siren on every page, plus an urgent phone notification, until they
            press &quot;I&apos;ve seen this&quot; or the person is back inside.
          </span>
        </span>
      </label>
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-300">Centre</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={useMyLocation}>
            <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" /> Where I am now
          </Button>
          {sharing.map((m) => (
            <Button
              key={m.uid}
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setLat(m.location.lat.toFixed(6));
                setLng(m.location.lng.toFixed(6));
                setMsg({ tone: "info", text: `Centre set to ${m.displayName}'s current shared location.` });
              }}
            >
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" /> {m.displayName.split(" ")[0]}&apos;s location
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Latitude" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} error={errors.lat} />
          <Input label="Longitude" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} error={errors.lng} />
        </div>
      </div>
      <Button type="submit" loading={busy}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Create safe zone
      </Button>
    </form>
  );
}

export function ZoneManager({
  families,
  myUid,
}: {
  families: { id: string; name: string; myRole: FamilyRole }[];
  myUid: string;
}) {
  const [familyId, setFamilyId] = useState(families[0]!.id);
  const [version, setVersion] = useState(0);
  const { zones } = useFamilyZones(familyId, version);
  const { members } = useFamilyLocations(familyId);
  const family = families.find((f) => f.id === familyId)!;
  const canManage = canManageInvites(family.myRole);
  const bump = () => setVersion((v) => v + 1);

  return (
    <div className="space-y-4">
      {families.length > 1 && (
        <label className="flex items-center gap-2 text-sm text-slate-300">
          Family
          <select
            value={familyId}
            onChange={(e) => setFamilyId(e.target.value)}
            className="h-9 rounded-lg border border-white/10 bg-ink-900/70 px-2 text-sm text-white"
          >
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader icon={<Radar className="h-4 w-4" />} title={`Safe zones · ${family.name}`} description="Members see these places. Alerts go to the rest of the family; alarms go to owners and guardians." />
            {zones.length === 0 ? (
              <EmptyState icon={<Radar className="h-6 w-6" />} title="No safe zones yet" description={canManage ? "Create one on the right — e.g. Home or School." : "An owner or guardian can create safe zones."} />
            ) : (
              <ul className="space-y-2" aria-label="Safe zones">
                {zones.map((z) => (
                  <ZoneRow key={z.id} zone={z} canManage={canManage} familyId={familyId} members={members ?? []} onChanged={bump} />
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <LiveMap key={familyId} compact families={[{ id: family.id, name: family.name }]} myUid={myUid} zonesVersion={version} />
          </Card>
        </div>
        <div className="space-y-4">
          {canManage ? (
            <Card>
              <CardHeader icon={<Plus className="h-4 w-4" />} title="New safe zone" />
              <CreateZoneForm key={familyId} familyId={familyId} members={members ?? []} onCreated={bump} />
            </Card>
          ) : (
            <Notice tone="info">Only family owners and guardians can create or change safe zones.</Notice>
          )}
          <Notice tone="info" title="How alerts work">
            Arrivals and departures are detected from location updates a person is <strong>already sharing with this family</strong>.
            Nobody is tracked for a zone without that consent. On the web, updates pause when FamilyGuard isn&apos;t open, so an
            arrival may be reported late or missed — the Android app (planned) will make this reliable.
          </Notice>
        </div>
      </div>
    </div>
  );
}
