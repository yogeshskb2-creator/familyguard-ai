/*
 * FamilyGuard AI push service worker.
 * Shows notifications sent through Firebase Cloud Messaging (standard Web
 * Push payloads) and opens the app on click. No third-party scripts.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function safeLink(link) {
  // Only ever open pages of this app (never an external URL from a payload).
  try {
    const url = new URL(link || "/notifications", self.location.origin);
    return url.origin === self.location.origin ? url.href : new URL("/notifications", self.location.origin).href;
  } catch {
    return new URL("/notifications", self.location.origin).href;
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const n = payload.notification || {};
  const data = payload.data || {};
  const critical = data.kind === "sos" || data.critical === "1";
  const link = safeLink((payload.fcmOptions && payload.fcmOptions.link) || data.link);
  event.waitUntil(
    self.registration.showNotification(n.title || "FamilyGuard AI", {
      body: n.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: critical ? (data.kind === "sos" ? "familyguard-sos" : "familyguard-alarm") : undefined,
      vibrate: critical ? [500, 200, 500, 200, 500] : undefined,
      renotify: critical,
      requireInteraction: critical,
      data: { link },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = safeLink(event.notification.data && event.notification.data.link);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          w.navigate(link);
          return w.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});
