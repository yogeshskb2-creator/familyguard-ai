"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Info, MapPin, MapPinOff, Radio, RefreshCcw, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, CardHeader, ConfirmDialog, Notice } from "@/components/ui";
import { formatAccuracy } from "@/lib/location/geo";
import { RETENTION_DAYS } from "@/lib/location/validation";
import { cn, timeAgo } from "@/lib/utils";
import { useSharing } from "./LocationSharingProvider";

interface FamilyOption {
  id: string;
  name: string;
}

function FamilyPicker({
  families,
  selected,
  onChange,
}: {
  families: FamilyOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium text-slate-300">Share with</legend>
      <div className="space-y-1.5">
        {families.map((f) => {
          const on = selected.includes(f.id);
          return (
            <label
              key={f.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                on ? "border-neon-cyan/40 bg-neon-cyan/[0.06] text-white" : "border-white/10 text-slate-300 hover:bg-white/[0.03]",
              )}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChange(on ? selected.filter((x) => x !== f.id) : [...selected, f.id])}
                className="h-4 w-4 accent-[#22e1ff]"
              />
              {f.name}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function HistoryOptions({
  keep,
  days,
  onKeep,
  onDays,
}: {
  keep: boolean;
  days: number;
  onKeep: (v: boolean) => void;
  onDays: (v: 1 | 7 | 30) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-start gap-3 text-sm text-slate-300">
        <input type="checkbox" checked={keep} onChange={(e) => onKeep(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#22e1ff]" />
        <span>
          Keep my location history <span className="text-slate-500">(only you can see it)</span>
        </span>
      </label>
      {keep && (
        <div className="ml-7 flex items-center gap-2 text-sm text-slate-400">
          <label htmlFor="retention">Delete automatically after</label>
          <select
            id="retention"
            value={days}
            onChange={(e) => onDays(Number(e.target.value) as 1 | 7 | 30)}
            className="h-9 rounded-lg border border-white/10 bg-ink-900/70 px-2 text-sm text-white"
          >
            {RETENTION_DAYS.map((d) => (
              <option key={d} value={d}>
                {d === 1 ? "1 day" : `${d} days`}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export function LocationSharingCard({ families }: { families: FamilyOption[] }) {
  const router = useRouter();
  const { consent, status, lastSent, error, start, stop, resume, update } = useSharing();
  const [selected, setSelected] = useState<string[]>(consent.active ? consent.familyIds : families.map((f) => f.id));
  const [keep, setKeep] = useState(consent.keepHistory);
  const [days, setDays] = useState<1 | 7 | 30>((consent.historyRetentionDays as 1 | 7 | 30) ?? 7);
  const [busy, setBusy] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const sharing = consent.active;
  const dirty =
    sharing &&
    (selected.slice().sort().join() !== consent.familyIds.slice().sort().join() ||
      keep !== consent.keepHistory ||
      days !== consent.historyRetentionDays);
  const familyName = (id: string) => families.find((f) => f.id === id)?.name ?? "a family you left";

  if (families.length === 0) {
    return (
      <Card id="location">
        <CardHeader icon={<MapPinOff className="h-4 w-4" />} title="Location sharing" />
        <p className="text-sm text-slate-400">
          You need to be in a family before you can share your location.{" "}
          <Link href="/family" className="text-neon-cyan hover:underline">
            Create or join a family →
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card id="location" className={cn(sharing && "gradient-border")}>
      <CardHeader
        icon={sharing ? <Radio className="h-4 w-4" /> : <MapPinOff className="h-4 w-4" />}
        title="Location sharing"
        description={sharing ? "You are sharing your location" : "You are not sharing your location"}
        action={
          sharing ? (
            <Badge tone={status === "live" ? "cyan" : status === "paused" ? "warn" : "danger"} dot>
              {status === "live" ? "Live" : status === "paused" ? "Paused on this device" : status === "starting" ? "Starting" : "Blocked"}
            </Badge>
          ) : (
            <Badge>Off</Badge>
          )
        }
      />

      {error && (
        <Notice tone={status === "blocked" || status === "unavailable" || !sharing ? "danger" : "warn"} className="mb-4">
          {error}
        </Notice>
      )}
      {saved && <Notice tone="safe" className="mb-4">{saved}</Notice>}

      {!sharing ? (
        <div className="space-y-5">
          <ul className="space-y-2 text-sm text-slate-400">
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-safe" aria-hidden="true" />
              Only members of the families you tick below can see where you are — with accuracy and time.
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-safe" aria-hidden="true" />
              Your browser will ask for permission. You can stop at any time; your live location is then deleted.
            </li>
            <li className="flex gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
              On the web, updates are sent only while FamilyGuard is open on this device. Browsers pause location when the
              page is closed or in the background — family will see your <em>last known</em> location and when it was taken.
            </li>
          </ul>
          <FamilyPicker families={families} selected={selected} onChange={setSelected} />
          <HistoryOptions keep={keep} days={days} onKeep={setKeep} onDays={setDays} />
          <Button
            className="w-full sm:w-auto"
            disabled={selected.length === 0 || busy || status === "starting"}
            loading={busy || status === "starting"}
            onClick={async () => {
              setBusy(true);
              setSaved(null);
              const ok = await start({ familyIds: selected, keepHistory: keep, historyRetentionDays: days });
              setBusy(false);
              if (ok) router.refresh(); // re-render server data (history, family views)
            }}
          >
            <MapPin className="h-4 w-4" aria-hidden="true" /> Share my location
          </Button>
          {selected.length === 0 && <p className="text-xs text-slate-500">Choose at least one family.</p>}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl bg-white/[0.03] p-4 text-sm">
            <p className="text-slate-300">
              Visible to: {consent.familyIds.map((id) => <Badge key={id} tone="cyan" className="mr-1">{familyName(id)}</Badge>)}
            </p>
            {lastSent ? (
              <p className="mt-2 text-slate-400" data-testid="last-sent">
                Last sent {timeAgo(lastSent.sentAt, now)} · {formatAccuracy(lastSent.accuracy)} · {lastSent.lat.toFixed(5)},{" "}
                {lastSent.lng.toFixed(5)}
              </p>
            ) : (
              <p className="mt-2 text-slate-500">No update sent from this device yet.</p>
            )}
            {(status === "paused" || status === "blocked") && (
              <Button size="sm" variant="secondary" className="mt-3" onClick={resume}>
                <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" /> Resume from this device
              </Button>
            )}
          </div>

          <FamilyPicker families={families} selected={selected} onChange={setSelected} />
          <HistoryOptions keep={keep} days={days} onKeep={setKeep} onDays={setDays} />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!dirty || selected.length === 0}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setSaved(null); // never leave a previous success message up while saving
                const ok = await update({ familyIds: selected, keepHistory: keep, historyRetentionDays: days });
                setBusy(false);
                if (ok) {
                  setSaved("Sharing settings updated.");
                  router.refresh();
                }
              }}
            >
              Save sharing settings
            </Button>
            <Button variant="danger" onClick={() => setConfirmStop(true)}>
              <MapPinOff className="h-4 w-4" aria-hidden="true" /> Stop sharing
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmStop}
        danger
        title="Stop sharing your location?"
        description="Your live location will be deleted right away and your family will see you as “not sharing”. Your history (if any) is kept until you delete it or it expires."
        confirmLabel="Stop sharing"
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          const ok = await stop();
          setBusy(false);
          if (ok) {
            setConfirmStop(false);
            setSaved("You stopped sharing. Your live location was deleted.");
            router.refresh();
          }
        }}
        onClose={() => setConfirmStop(false)}
      />
    </Card>
  );
}
