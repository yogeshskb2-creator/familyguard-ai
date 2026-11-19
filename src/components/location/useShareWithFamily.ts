"use client";

import { useCallback, useState } from "react";
import { useSharing } from "./LocationSharingProvider";

/**
 * Start sharing with one family, or add it to the families already shared
 * with. Always an explicit user action: the browser asks for permission and
 * nothing is recorded if it's refused.
 */
export function useShareWithFamily(familyId: string) {
  const sharing = useSharing();
  const [busy, setBusy] = useState(false);

  const sharesThisFamily = sharing.consent.active && sharing.consent.familyIds.includes(familyId);

  const share = useCallback(async () => {
    setBusy(true);
    try {
      if (sharing.consent.active) {
        if (!sharing.consent.familyIds.includes(familyId)) {
          const ok = await sharing.update({ familyIds: [...new Set([...sharing.consent.familyIds, familyId])] });
          if (!ok) return false;
        }
        // Consent exists; make sure THIS device is actually sending.
        if (sharing.status !== "live") await sharing.resume();
        return true;
      }
      return await sharing.start({ familyIds: [familyId], keepHistory: false, historyRetentionDays: 7 });
    } finally {
      setBusy(false);
    }
  }, [familyId, sharing]);

  return { share, busy, sharesThisFamily, status: sharing.status, error: sharing.error };
}
