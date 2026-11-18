"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { Geofence } from "@/types/models";

/** Safe zones of one family (members only — enforced by the API). */
export function useFamilyZones(familyId: string | null, version = 0) {
  const [zones, setZones] = useState<Geofence[]>([]);
  const load = useCallback(async () => {
    if (!familyId) return;
    const res = await api<{ zones: Geofence[] }>(`/api/families/${familyId}/geofences`);
    if (res.ok) setZones(Array.isArray(res.data.zones) ? res.data.zones : []);
  }, [familyId]);
  useEffect(() => {
    setZones([]);
    void load();
  }, [load, version]);
  return { zones, reload: load };
}
