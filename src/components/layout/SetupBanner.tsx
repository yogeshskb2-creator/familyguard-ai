import { missingFirebaseConfig } from "@/lib/env";
import { Notice } from "@/components/ui";

/** Shown until the owner configures Firebase — the app never pretends to be connected. */
export function SetupBanner() {
  const missing = missingFirebaseConfig();
  if (missing.length === 0) return null;
  return (
    <Notice tone="warn" title="Preview mode — Firebase is not configured" className="mb-6">
      Figures and members below are sample data for layout only. Add your Firebase web config to{" "}
      <code className="rounded bg-black/30 px-1">.env.local</code> (see README → Firebase setup) to connect real data.
    </Notice>
  );
}
