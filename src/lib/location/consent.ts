import type { SharingConsent } from "@/types/models";

/** Default consent: NOT sharing. Location is never collected until the user opts in. */
export const NO_CONSENT: SharingConsent = {
  active: false,
  familyIds: [],
  grantedAt: null,
  revokedAt: null,
  keepHistory: false,
  historyRetentionDays: 7,
};

/** Accepts Firestore Timestamps (duck-typed, so this module stays client-safe) or epoch ms. */
const ms = (v: unknown): number =>
  typeof v === "number" ? v : v && typeof (v as { toMillis?: unknown }).toMillis === "function" ? (v as { toMillis: () => number }).toMillis() : 0;

export function consentFromDoc(v: unknown): SharingConsent {
  if (!v || typeof v !== "object") return { ...NO_CONSENT };
  const c = v as Record<string, unknown>;
  return {
    active: c.active === true,
    familyIds: Array.isArray(c.familyIds) ? (c.familyIds as string[]) : [],
    grantedAt: c.grantedAt ? ms(c.grantedAt) : null,
    revokedAt: c.revokedAt ? ms(c.revokedAt) : null,
    keepHistory: c.keepHistory === true,
    historyRetentionDays: typeof c.historyRetentionDays === "number" ? c.historyRetentionDays : 7,
  };
}
