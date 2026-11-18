"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { MemberLocationView } from "@/lib/location/map";

const POLL_MS = 20_000;

/**
 * Polls the server for the locations members chose to share with this
 * family. Pauses while the tab is hidden; refreshes when it becomes visible.
 * Authorization is enforced by the API (members only, per-family consent).
 */
export function useFamilyLocations(familyId: string | null) {
  const [members, setMembers] = useState<MemberLocationView[] | null>(null);
  const [serverNow, setServerNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    const res = await api<{ members: MemberLocationView[]; now: number }>(`/api/families/${familyId}/locations`);
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setError(null);
    setMembers(res.data.members);
    setServerNow(res.data.now);
  }, [familyId]);

  useEffect(() => {
    setMembers(null);
    if (!familyId) return;
    void load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), POLL_MS);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [familyId, load]);

  return { members, serverNow, error, loading, reload: load };
}
