"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import { getLocalDeviceId } from "@/lib/devices/client";
import { SEND_POLICY, shouldSend, type Fix } from "@/lib/location/geo";
import type { StartSharing } from "@/lib/location/validation";
import type { SharingConsent } from "@/types/models";

/**
 * Browser side of consent-based sharing.
 *
 *   off        – consent not given. The Geolocation API is never touched.
 *   starting   – user pressed Share; waiting for the browser permission prompt.
 *   live       – this tab is sending updates (only while the page is open).
 *   paused     – consent is on, but this device isn't sending (other tab,
 *                page was closed, or permission not yet re-confirmed).
 *   blocked    – the browser denied location permission.
 *   unavailable– no Geolocation API / insecure (non-HTTPS) context.
 *
 * Web browsers stop or throttle location when the tab is closed or in the
 * background; we never claim otherwise.
 */
export type SharingStatus = "off" | "starting" | "live" | "paused" | "blocked" | "unavailable";

interface Ctx {
  enabled: boolean;
  consent: SharingConsent;
  status: SharingStatus;
  lastSent: (Fix & { sentAt: number }) | null;
  error: string | null;
  start: (opts: StartSharing) => Promise<boolean>;
  stop: () => Promise<boolean>;
  resume: () => Promise<void>;
  update: (opts: Partial<StartSharing>) => Promise<boolean>;
}

const SharingContext = createContext<Ctx | null>(null);

export function useSharing(): Ctx {
  const ctx = useContext(SharingContext);
  if (!ctx) throw new Error("useSharing must be used inside <LocationSharingProvider>");
  return ctx;
}

const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 };

function geoAvailable() {
  return typeof window !== "undefined" && "geolocation" in navigator && window.isSecureContext;
}

function toFix(p: GeolocationPosition): Fix & { heading: number | null; speed: number | null } {
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracy: Math.max(1, p.coords.accuracy),
    heading: p.coords.heading != null && !Number.isNaN(p.coords.heading) ? p.coords.heading % 360 : null,
    speed: p.coords.speed != null && !Number.isNaN(p.coords.speed) ? Math.min(150, p.coords.speed) : null,
    at: Date.now(),
  };
}

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTIONS));
}

function geoErrorMessage(err: GeolocationPositionError | unknown): { status: SharingStatus; message: string } {
  const code = (err as GeolocationPositionError)?.code;
  if (code === 1) {
    return {
      status: "blocked",
      message: "Location permission was denied. Allow location for this site in your browser settings, then press Resume.",
    };
  }
  if (code === 3) return { status: "paused", message: "Couldn't get a location fix in time. Move somewhere with better signal and press Resume." };
  return { status: "paused", message: "Your device couldn't determine its location. Check that location services are on." };
}

export function LocationSharingProvider({
  enabled,
  initialConsent,
  children,
}: {
  /** False in preview mode — nothing here ever runs. */
  enabled: boolean;
  initialConsent: SharingConsent;
  children: ReactNode;
}) {
  const [consent, setConsent] = useState(initialConsent);
  const [status, setStatus] = useState<SharingStatus>(initialConsent.active ? "paused" : "off");
  const [lastSent, setLastSent] = useState<Ctx["lastSent"]>(null);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const lastSentRef = useRef<Fix | null>(null);
  const sending = useRef(false);
  const trailing = useRef<{ fix: ReturnType<typeof toFix>; timer: number } | null>(null);

  const stopWatching = useCallback(() => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    if (trailing.current) window.clearTimeout(trailing.current.timer);
    trailing.current = null;
  }, []);

  /** Server says consent is gone (stopped on another device, or no families left). */
  const handleRevoked = useCallback(() => {
    stopWatching();
    lastSentRef.current = null;
    setConsent((c) => ({ ...c, active: false }));
    setStatus("off");
    setError("Location sharing was turned off (possibly from another device).");
  }, [stopWatching]);

  const send = useCallback(
    async (fix: ReturnType<typeof toFix>, force = false): Promise<void> => {
      if (sending.current) return;
      if (!force && !shouldSend(lastSentRef.current, fix)) {
        // Throttled. If we actually moved, send the newest fix as soon as the
        // minimum interval allows, instead of waiting for the next heartbeat.
        const last = lastSentRef.current;
        if (last && fix.at - last.at < SEND_POLICY.minIntervalMs) {
          const moved = shouldSend(last, { ...fix, at: last.at + SEND_POLICY.minIntervalMs });
          if (trailing.current) window.clearTimeout(trailing.current.timer);
          trailing.current = moved
            ? {
                fix,
                timer: window.setTimeout(() => {
                  const pending = trailing.current?.fix;
                  trailing.current = null;
                  if (pending) void send({ ...pending, at: Date.now() });
                }, last.at + SEND_POLICY.minIntervalMs - fix.at + 50),
              }
            : null;
        }
        return;
      }
      if (trailing.current) {
        window.clearTimeout(trailing.current.timer);
        trailing.current = null;
      }
      sending.current = true;
      const res = await api("/api/location", {
        method: "POST",
        body: {
          lat: fix.lat,
          lng: fix.lng,
          accuracy: fix.accuracy,
          heading: fix.heading,
          speed: fix.speed,
          timestamp: fix.at,
          // Which of the user's registered devices is sending (shown on the Devices page).
          ...(getLocalDeviceId() ? { deviceId: getLocalDeviceId()! } : {}),
        },
      });
      sending.current = false;
      if (res.ok) {
        lastSentRef.current = fix;
        setLastSent({ ...fix, sentAt: Date.now() });
        setError(null);
      } else if (res.code === "not_sharing" || res.code === "no_families") {
        handleRevoked();
      } else if (res.status !== 429) {
        setError(`Couldn't send your location: ${res.message} Retrying automatically.`);
      }
    },
    [handleRevoked],
  );

  const beginWatching = useCallback(() => {
    stopWatching();
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setStatus("live");
        void send(toFix(p));
      },
      (err) => {
        const e = geoErrorMessage(err);
        if (e.status === "blocked") stopWatching();
        setStatus(e.status === "blocked" ? "blocked" : "live");
        setError(e.message);
      },
      GEO_OPTIONS,
    );
    setStatus("live");
  }, [send, stopWatching]);

  // Resume automatically on page load ONLY if consent is active AND the
  // browser permission is already granted — never trigger a prompt unasked.
  useEffect(() => {
    if (!enabled || !initialConsent.active) return;
    if (!geoAvailable()) {
      setStatus("unavailable");
      return;
    }
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => {
        if (cancelled) return;
        if (p.state === "granted") beginWatching();
        else if (p.state === "denied") setStatus("blocked");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, initialConsent.active, beginWatching]);

  // Heartbeat while visible: some browsers don't fire watchPosition when stationary.
  useEffect(() => {
    if (status !== "live") return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const last = lastSentRef.current;
      if (last && Date.now() - last.at < SEND_POLICY.heartbeatMs) return;
      currentPosition().then((p) => send(toFix(p)), () => undefined);
    };
    const id = window.setInterval(tick, SEND_POLICY.heartbeatMs / 2);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [status, send]);

  useEffect(() => () => stopWatching(), [stopWatching]);

  const start = useCallback(
    async (opts: StartSharing) => {
      setError(null);
      if (!geoAvailable()) {
        setStatus("unavailable");
        setError("This browser can't share location here. Location requires HTTPS and a browser with location support.");
        return false;
      }
      setStatus("starting");
      // 1. Browser permission prompt + first fix BEFORE we record consent.
      let first: ReturnType<typeof toFix>;
      try {
        first = toFix(await currentPosition());
      } catch (err) {
        // Consent was never recorded, so we are simply "off" — just explain why.
        setStatus("off");
        setError(geoErrorMessage(err).message.replace(", then press Resume", ", then try again"));
        return false;
      }
      // 2. Record consent server-side.
      const res = await api<{ consent: SharingConsent }>("/api/sharing", { method: "POST", body: opts });
      if (!res.ok) {
        setStatus("off");
        setError(res.message);
        return false;
      }
      setConsent(res.data.consent);
      // 3. Send the first fix and keep watching.
      await send(first, true);
      beginWatching();
      return true;
    },
    [beginWatching, send],
  );

  const stop = useCallback(async () => {
    stopWatching(); // stop collecting first, even if the network call fails
    const res = await api("/api/sharing", { method: "DELETE" });
    if (!res.ok) {
      setError(`Couldn't reach the server to stop sharing: ${res.message} Try again.`);
      setStatus("paused");
      return false;
    }
    lastSentRef.current = null;
    setLastSent(null);
    setConsent((c) => ({ ...c, active: false, revokedAt: Date.now() }));
    setStatus("off");
    setError(null);
    return true;
  }, [stopWatching]);

  const resume = useCallback(async () => {
    setError(null);
    if (!geoAvailable()) return setStatus("unavailable");
    try {
      const fix = toFix(await currentPosition());
      await send(fix, true);
      beginWatching();
    } catch (err) {
      const e = geoErrorMessage(err);
      setStatus(e.status);
      setError(e.message);
    }
  }, [beginWatching, send]);

  const update = useCallback(async (opts: Partial<StartSharing>) => {
    const res = await api<{ consent: SharingConsent }>("/api/sharing", { method: "PATCH", body: opts });
    if (!res.ok) {
      setError(res.message);
      return false;
    }
    setConsent(res.data.consent);
    setError(null);
    return true;
  }, []);

  const value = useMemo<Ctx>(
    () => ({ enabled, consent, status, lastSent, error, start, stop, resume, update }),
    [enabled, consent, status, lastSent, error, start, stop, resume, update],
  );
  return <SharingContext.Provider value={value}>{children}</SharingContext.Provider>;
}
