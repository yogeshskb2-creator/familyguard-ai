"use client";

import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { api } from "@/lib/api/client";
import { isFirebaseConfigured, publicEnv } from "@/lib/env";
import { getFirebaseApp } from "@/lib/firebase/client";
import type { DeviceType } from "@/types/models";

/** Which registered device THIS browser is (a per-browser convenience, not a secret). */
const KEY = "fg.deviceId";
export function getLocalDeviceId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function setLocalDeviceId(id: string | null) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable (private mode): the device just won't be remembered */
  }
}

/** Short, privacy-friendly description — we never store the full user-agent string. */
export function describeThisDevice(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): {
  type: DeviceType;
  platform: string;
  defaultName: string;
} {
  const os = /iPad/.test(ua)
    ? "iPadOS"
    : /iPhone|iPod/.test(ua)
      ? "iOS"
      : /Android/.test(ua)
        ? "Android"
        : /CrOS/.test(ua)
          ? "ChromeOS"
          : /Mac OS X/.test(ua)
            ? "macOS"
            : /Windows/.test(ua)
              ? "Windows"
              : /Linux/.test(ua)
                ? "Linux"
                : "Unknown OS";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const type: DeviceType = os === "iPadOS" || (os === "Android" && !/Mobile/.test(ua)) ? "tablet" : os === "iOS" ? "ios" : os === "Android" ? "android" : "web";
  const kind = type === "tablet" ? "tablet" : type === "web" ? "computer" : "phone";
  return { type, platform: `${browser} on ${os}`, defaultName: `My ${os === "Unknown OS" ? "" : `${os} `}${kind}` };
}

export type PushSupport = { ok: true } | { ok: false; reason: string };

/** Can this browser + deployment receive push? Explains why not, honestly. */
export async function pushSupport(): Promise<PushSupport> {
  if (typeof window === "undefined") return { ok: false, reason: "Not available." };
  if (!isFirebaseConfigured()) return { ok: false, reason: "Firebase isn't configured on this server." };
  if (!publicEnv.vapidKey) return { ok: false, reason: "Push isn't configured on this server yet (the web-push key is missing)." };
  if (!window.isSecureContext) return { ok: false, reason: "Push needs a secure (HTTPS) connection." };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return {
      ok: false,
      reason: /iPhone|iPad/.test(navigator.userAgent)
        ? "On iPhone and iPad, add FamilyGuard to your Home Screen first (Share → Add to Home Screen), then enable notifications from there."
        : "This browser doesn't support push notifications.",
    };
  }
  if (!(await isSupported().catch(() => false))) return { ok: false, reason: "This browser doesn't support Firebase push." };
  return { ok: true };
}

/** Explicit opt-in: browser permission prompt → FCM token → stored server-side for this device. */
export async function enablePushOnThisDevice(deviceId: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for this site. Allow them in your browser's site settings, then try again."
        : "Notification permission wasn't granted.",
    );
  }
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const token = await getToken(getMessaging(getFirebaseApp()!), { vapidKey: publicEnv.vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Couldn't get a push token from Firebase.");
  const res = await api(`/api/devices/${deviceId}/push`, { method: "PUT", body: { token } });
  if (!res.ok) throw new Error(res.message);
}

export async function disablePushOnThisDevice(deviceId: string): Promise<void> {
  try {
    await deleteToken(getMessaging(getFirebaseApp()!));
  } catch {
    /* token may already be gone; the server side is what matters */
  }
  const res = await api(`/api/devices/${deviceId}/push`, { method: "DELETE" });
  if (!res.ok) throw new Error(res.message);
}
