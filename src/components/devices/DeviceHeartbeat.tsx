"use client";

import { usePolling } from "@/hooks/usePolling";
import { api } from "@/lib/api/client";
import { getLocalDeviceId, setLocalDeviceId } from "@/lib/devices/client";

/** While the app is open on a registered device, tell the server it's active (every 5 min). */
export function DeviceHeartbeat({ enabled }: { enabled: boolean }) {
  usePolling(
    async () => {
      const id = getLocalDeviceId();
      if (!id) return;
      const res = await api(`/api/devices/${id}/heartbeat`, { method: "POST" });
      // Removed from the account (or unknown): forget it locally.
      if (!res.ok && (res.status === 404 || res.status === 410)) setLocalDeviceId(null);
    },
    5 * 60_000,
    enabled,
  );
  return null;
}
