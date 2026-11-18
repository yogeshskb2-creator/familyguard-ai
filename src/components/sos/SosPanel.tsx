"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, MapPin, MapPinOff, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { Badge, Button, Card, CardHeader, Notice } from "@/components/ui";
import { api } from "@/lib/api/client";
import { formatAccuracy, googleMapsLink } from "@/lib/location/geo";
import { cn, timeAgo } from "@/lib/utils";

export interface SosAlertView {
  id: string;
  uid: string;
  displayName: string;
  familyIds: string[];
  familyNames: string[];
  location: { lat: number; lng: number; accuracy: number } | null;
  message: string;
  status: "active" | "acknowledged" | "resolved" | "cancelled";
  acknowledgedBy: { uid: string; displayName: string; at: number }[];
  recipientCount: number;
  createdAt: number;
  resolvedAt: number | null;
  resolvedByName: string | null;
}

/** One-time position for an SOS. Never throws: an SOS must go out even without location. */
function getPositionOnce(timeoutMs = 8000): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  if (typeof window === "undefined" || !("geolocation" in navigator) || !window.isSecureContext) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(timer);
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.max(1, p.coords.accuracy) });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15_000 },
    );
  });
}

function SendDialog({
  families,
  onClose,
  onSent,
}: {
  families: { id: string; name: string; members: number }[];
  onClose: () => void;
  onSent: (alert: SosAlertView, note: string | null) => void;
}) {
  const [selected, setSelected] = useState(families.map((f) => f.id));
  const [withLocation, setWithLocation] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState<null | "locating" | "sending">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !sending && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sending, onClose]);

  const recipients = families.filter((f) => selected.includes(f.id)).reduce((n, f) => n + Math.max(0, f.members - 1), 0);

  async function send() {
    setError(null);
    let location = null;
    if (withLocation) {
      setSending("locating");
      location = await getPositionOnce();
    }
    setSending("sending");
    const res = await api<{ alert: SosAlertView; duplicate: boolean }>("/api/sos", {
      method: "POST",
      body: { familyIds: selected, location, ...(message.trim() ? { message: message.trim() } : {}) },
    });
    setSending(null);
    if (!res.ok) return setError(res.message);
    onSent(
      res.data.alert,
      res.data.duplicate
        ? "Your SOS was already active — we updated it."
        : withLocation && !location
          ? "Sent without your location — your device couldn't provide it in time."
          : null,
    );
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sos-title"
        className="glass-strong w-full max-w-md rounded-2xl border-danger/40 p-6"
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
      >
        <div className="flex items-start justify-between">
          <h2 id="sos-title" className="flex items-center gap-2 font-display text-lg font-semibold text-white">
            <ShieldAlert className="h-5 w-5 text-danger" aria-hidden="true" /> Send emergency SOS?
          </h2>
          <button type="button" onClick={onClose} disabled={!!sending} aria-label="Close" className="text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-400">Everyone in the families you choose will get an urgent alert.</p>

        <fieldset className="mt-4 space-y-1.5">
          <legend className="mb-1.5 text-xs font-medium text-slate-300">Alert</legend>
          {families.map((f) => (
            <label key={f.id} className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#ff4d6d]"
                checked={selected.includes(f.id)}
                onChange={(e) => setSelected((s) => (e.target.checked ? [...s, f.id] : s.filter((x) => x !== f.id)))}
              />
              <span className="flex-1">{f.name}</span>
              <span className="text-xs text-slate-500">{f.members - 1} people</span>
            </label>
          ))}
        </fieldset>

        <label className="mt-4 flex items-start gap-3 text-sm text-slate-300">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#ff4d6d]" checked={withLocation} onChange={(e) => setWithLocation(e.target.checked)} />
          <span>
            Include my current location <span className="text-slate-500">(sent once with this alert; doesn&apos;t turn on sharing)</span>
          </span>
        </label>

        <label className="mt-4 block text-xs font-medium text-slate-300" htmlFor="sos-message">
          Message (optional)
        </label>
        <textarea
          id="sos-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="e.g. Car broke down on the highway"
          className="mt-1.5 w-full rounded-xl border border-white/10 bg-ink-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-danger/40"
        />

        {error && <Notice tone="danger" className="mt-3">{error}</Notice>}

        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={!!sending}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={send} loading={!!sending} disabled={selected.length === 0}>
            {sending === "locating" ? "Getting location…" : sending === "sending" ? "Sending…" : `Send SOS to ${recipients}`}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function AlertCard({
  alert,
  myUid,
  canResolve,
  highlight = false,
  now,
}: {
  alert: SosAlertView;
  myUid: string;
  canResolve: boolean;
  highlight?: boolean;
  now: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mine = alert.uid === myUid;
  const active = alert.status === "active";
  const acked = alert.acknowledgedBy.some((a) => a.uid === myUid);

  async function act(path: string, body?: unknown) {
    setBusy(path);
    setError(null);
    const res = await api(`/api/sos/${alert.id}/${path}`, { method: "POST", body });
    setBusy(null);
    if (!res.ok) return setError(res.message);
    router.refresh();
  }

  return (
    <li
      id={`alert-${alert.id}`}
      data-testid={`alert-${alert.id}`}
      className={cn(
        "rounded-xl border p-4",
        active ? "border-danger/40 bg-danger/[0.06]" : "border-white/10 bg-white/[0.02]",
        highlight && "ring-2 ring-danger/60",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-white">
            {mine ? "Your SOS" : `SOS from ${alert.displayName}`}{" "}
            <span className="text-xs font-normal text-slate-400">· {timeAgo(alert.createdAt, now)}</span>
          </p>
          <p className="text-xs text-slate-500">
            {new Date(alert.createdAt).toLocaleString()} · to {alert.familyNames.join(", ")} ({alert.recipientCount} people)
          </p>
        </div>
        <Badge tone={active ? "danger" : alert.status === "resolved" ? "safe" : "neutral"} dot>
          {active ? "Active" : alert.status === "resolved" ? "Resolved" : "Cancelled"}
        </Badge>
      </div>
      {alert.message && <p className="mt-2 text-sm text-slate-200">“{alert.message}”</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {alert.location ? (
          <a
            href={googleMapsLink(alert.location.lat, alert.location.lng)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-neon-cyan hover:underline"
          >
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {alert.location.lat.toFixed(5)}, {alert.location.lng.toFixed(5)} (
            {formatAccuracy(alert.location.accuracy)}) <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 text-slate-500">
            <MapPinOff className="h-3.5 w-3.5" aria-hidden="true" /> No location attached
          </span>
        )}
        <span className="text-slate-400">
          {alert.acknowledgedBy.length
            ? `Seen by ${alert.acknowledgedBy.map((a) => a.displayName).join(", ")}`
            : active
              ? "Not acknowledged yet"
              : ""}
        </span>
        {!active && alert.resolvedByName && (
          <span className="text-slate-500">
            {alert.status === "cancelled" ? "Cancelled" : "Resolved"} by {alert.resolvedByName}
          </span>
        )}
      </div>
      {error && <Notice tone="danger" className="mt-2">{error}</Notice>}
      {active && (
        <div className="mt-3 flex flex-wrap gap-2">
          {mine ? (
            <>
              <Button size="sm" onClick={() => act("resolve", { outcome: "resolved" })} loading={busy === "resolve"}>
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> I&apos;m safe
              </Button>
              <Button size="sm" variant="ghost" onClick={() => act("resolve", { outcome: "cancelled" })} loading={busy === "resolve"}>
                Cancel — false alarm
              </Button>
            </>
          ) : (
            <>
              {!acked ? (
                <Button size="sm" variant="danger" onClick={() => act("acknowledge")} loading={busy === "acknowledge"}>
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> I&apos;ve seen this
                </Button>
              ) : (
                <Badge tone="safe">You acknowledged</Badge>
              )}
              {canResolve && (
                <Button size="sm" variant="ghost" onClick={() => act("resolve", { outcome: "resolved" })} loading={busy === "resolve"}>
                  Mark resolved
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function SosButtonPanel({
  families,
  hasActive,
}: {
  families: { id: string; name: string; members: number }[];
  hasActive: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const noFamily = families.length === 0;

  return (
    <Card className="flex flex-col items-center py-10 text-center">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={noFamily}
        aria-label="Emergency SOS — opens a confirmation"
        className="group relative grid h-44 w-44 place-items-center rounded-full disabled:opacity-40"
      >
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-danger/40" aria-hidden="true" />
        <span className="absolute inset-3 rounded-full bg-danger/20" aria-hidden="true" />
        <span className="relative grid h-32 w-32 place-items-center rounded-full bg-gradient-to-br from-[#ff6b84] to-danger font-display text-3xl font-bold text-white shadow-glow-danger transition-transform group-active:scale-95">
          SOS
        </span>
      </button>
      <p className="mt-6 max-w-sm text-sm text-slate-400">
        {noFamily
          ? "Join or create a family to use SOS."
          : hasActive
            ? "Your SOS is active. Pressing again updates it with your latest location."
            : "Press to alert your family. You'll confirm who receives it before anything is sent."}
      </p>
      {sentNote && <Notice tone="warn" className="mt-4 text-left">{sentNote}</Notice>}
      <AnimatePresence>
        {open && (
          <SendDialog
            families={families}
            onClose={() => setOpen(false)}
            onSent={(alert, note) => {
              setOpen(false);
              setSentNote(note);
              router.replace(`/sos?alert=${alert.id}`);
              router.refresh();
            }}
          />
        )}
      </AnimatePresence>
    </Card>
  );
}

export function AlertList({
  title,
  alerts,
  myUid,
  managerFamilyIds,
  highlightId,
  now,
  empty,
}: {
  title: string;
  alerts: SosAlertView[];
  myUid: string;
  managerFamilyIds: string[];
  highlightId?: string;
  now: number;
  empty: string;
}) {
  return (
    <Card>
      <CardHeader icon={<ShieldAlert className="h-4 w-4" />} title={title} />
      {alerts.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-2" aria-label={title}>
          {alerts.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              myUid={myUid}
              now={now}
              highlight={a.id === highlightId}
              canResolve={a.familyIds.some((f) => managerFamilyIds.includes(f))}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
