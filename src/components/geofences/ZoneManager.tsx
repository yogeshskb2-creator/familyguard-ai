"use client";

import { useEffect, useState } from "react";
import { Briefcase, Building2, GraduationCap, Home, LocateFixed, MapPin, Plus, Radar, Trash2, UserRound } from "lucide-react";
import { LiveMap } from "@/components/map/LiveMap";
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Input, Notice } from "@/components/ui";
import { useFamilyLocations } from "@/hooks/useFamilyLocations";
import { useFamilyZones } from "@/hooks/useFamilyZones";
import { api } from "@/lib/api/client";
import { canManageInvites } from "@/lib/families/permissions";
import { createZoneSchema } from "@/lib/geofences/validation";
import { ZONE_KINDS, ZONE_LIMITS } from "@/lib/geofences/zones";
import { placedMembers } from "@/lib/location/map";
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

function ZoneRow({ zone: serverZone, canManage, familyId, onChanged }: { zone: Geofence; canManage: boolean; familyId: string; onChanged: () => void }) {
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
            {label} · {zone.radius >= 1000 ? `${zone.radius / 1000} km` : `${zone.radius} m`} radius
          </p>
        </div>
        <Badge tone={zone.alertsEnabled ? "purple" : "neutral"}>{zone.alertsEnabled ? "Alerts on" : "Alerts off"}</Badge>
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
      </div>
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

function CreateZoneForm({ familyId, onCreated }: { familyId: string; onCreated: () => void }) {
  const { members } = useFamilyLocations(familyId);
  const sharing = placedMembers(members ?? []);
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
        <input
          id="zone-radius"
          type="range"
          min={ZONE_LIMITS.minRadius}
          max={2000}
          step={10}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="w-full accent-[#9b5cff]"
        />
      </div>
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
            <CardHeader icon={<Radar className="h-4 w-4" />} title={`Safe zones · ${family.name}`} description="Members see these places; alerts go to everyone else in the family." />
            {zones.length === 0 ? (
              <EmptyState icon={<Radar className="h-6 w-6" />} title="No safe zones yet" description={canManage ? "Create one on the right — e.g. Home or School." : "An owner or guardian can create safe zones."} />
            ) : (
              <ul className="space-y-2" aria-label="Safe zones">
                {zones.map((z) => (
                  <ZoneRow key={z.id} zone={z} canManage={canManage} familyId={familyId} onChanged={bump} />
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
              <CreateZoneForm key={familyId} familyId={familyId} onCreated={bump} />
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
