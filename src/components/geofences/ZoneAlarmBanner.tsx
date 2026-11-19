"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellOff, CheckCircle2, ExternalLink, Siren, Volume2 } from "lucide-react";
import { Button } from "@/components/ui";
import { usePolling } from "@/hooks/usePolling";
import { api } from "@/lib/api/client";
import { formatRadius } from "@/lib/geofences/zones";
import { googleMapsLink } from "@/lib/location/geo";
import { timeAgo } from "@/lib/utils";
import type { ZoneAlarm } from "@/types/models";

const POLL_MS = 10_000;

/**
 * Siren made with the Web Audio API (no sound file to load). Browsers only
 * allow sound after the user has interacted with the page, so `start` can
 * fail; the banner then offers a button to turn the sound on.
 */
function useSiren() {
  const ctxRef = useRef<AudioContext | null>(null);
  const timer = useRef<number | null>(null);
  const [blocked, setBlocked] = useState(false);

  const beep = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.linearRampToValueAtTime(1320, t + 0.35);
    osc.frequency.linearRampToValueAtTime(880, t + 0.7);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
    gain.gain.setValueAtTime(0.25, t + 0.65);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.72);
    if ("vibrate" in navigator) navigator.vibrate?.([400, 150, 400]);
  }, []);

  const start = useCallback(async () => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctxRef.current ??= new AC();
      if (ctxRef.current.state === "suspended") await ctxRef.current.resume();
      if (ctxRef.current.state !== "running") {
        setBlocked(true);
        return;
      }
      setBlocked(false);
      if (timer.current == null) {
        beep();
        timer.current = window.setInterval(beep, 1000);
      }
    } catch {
      setBlocked(true);
    }
  }, [beep]);

  const stop = useCallback(() => {
    if (timer.current != null) window.clearInterval(timer.current);
    timer.current = null;
    if ("vibrate" in navigator) navigator.vibrate?.(0);
  }, []);

  useEffect(() => stop, [stop]);
  return { start, stop, blocked };
}

/**
 * App-wide safe-zone alarm for owners and guardians: shown on every page,
 * with a siren, until each person presses "I've seen this" or the member is
 * back inside the zone.
 */
export function ZoneAlarmBanner({ enabled }: { enabled: boolean }) {
  const [alarms, setAlarms] = useState<ZoneAlarm[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const siren = useSiren();

  const load = useCallback(async () => {
    const res = await api<{ alarms: ZoneAlarm[] }>("/api/zone-alarms");
    if (res.ok) {
      setAlarms(res.data.alarms);
      setNow(Date.now());
    }
  }, []);
  usePolling(load, POLL_MS, enabled);

  const ringing = alarms.some((a) => a.active) && !muted;
  const { start, stop } = siren;
  useEffect(() => {
    if (ringing) void start();
    else stop();
  }, [ringing, start, stop]);

  // A new alarm un-mutes, so a second person leaving is never silent.
  const lastIds = useRef("");
  useEffect(() => {
    const ids = alarms.map((a) => a.id).join(",");
    if (ids && ids !== lastIds.current && alarms.some((a) => !lastIds.current.includes(a.id))) setMuted(false);
    lastIds.current = ids;
  }, [alarms]);

  if (!enabled || alarms.length === 0) return null;

  async function acknowledge(id: string) {
    setBusy(id);
    await api(`/api/zone-alarms/${id}/acknowledge`, { method: "POST" });
    setBusy(null);
    void load();
  }

  return (
    <div role="alert" aria-live="assertive" className="mb-4 space-y-2" data-testid="zone-alarm-banner">
      {alarms.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/60 bg-danger/20 p-4 shadow-glow-danger">
          <Siren className="h-7 w-7 shrink-0 animate-pulse text-danger" aria-hidden="true" />
          <div className="min-w-[12rem] flex-1">
            <p className="font-semibold text-white">
              {a.displayName} left the safe zone “{a.zoneName}”
            </p>
            <p className="text-sm text-[#ffb3c0]">
              {formatRadius(a.distanceM)} from the centre (zone {formatRadius(a.radius)}) · {timeAgo(a.createdAt, now)} · {a.familyName}
              {!a.active && " · now back inside"}
              {a.acknowledgedBy.length > 0 && ` · seen by ${a.acknowledgedBy.map((x) => x.displayName).join(", ")}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="danger" loading={busy === a.id} onClick={() => acknowledge(a.id)}>
              {busy !== a.id && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />} I&apos;ve seen this
            </Button>
            <Link
              href={`/map?family=${a.familyId}`}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
            >
              Live map
            </Link>
            <a
              href={googleMapsLink(a.lat, a.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
            >
              Where <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {siren.blocked && ringing && (
          <Button size="sm" variant="danger" onClick={() => void start()}>
            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> Turn on alarm sound
          </Button>
        )}
        {ringing && (
          <Button size="sm" variant="ghost" onClick={() => setMuted(true)}>
            <BellOff className="h-3.5 w-3.5" aria-hidden="true" /> Mute sound
          </Button>
        )}
      </div>
    </div>
  );
}
