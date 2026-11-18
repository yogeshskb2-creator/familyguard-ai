import type { ReactNode } from "react";
import { isFirebaseConfigured } from "@/lib/env";
import { Notice } from "@/components/ui";

/** Renders children only when Firebase is configured; otherwise explains why sign-in is unavailable. */
export function FirebaseRequired({ children }: { children: ReactNode }) {
  if (isFirebaseConfigured()) return <>{children}</>;
  return (
    <Notice tone="warn" title="Sign-in isn't available yet">
      This deployment hasn&apos;t been connected to Firebase. The owner needs to add the Firebase web config to{" "}
      <code className="rounded bg-black/30 px-1">.env.local</code> — see README → Firebase setup. You can still explore
      the <a className="underline" href="/dashboard">preview dashboard</a>.
    </Notice>
  );
}
