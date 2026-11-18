import { AppShell } from "@/components/layout/AppShell";
import { requireViewer } from "@/lib/auth/session";
import { getMySharingState } from "@/lib/location/service.server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Server-side verification of the session cookie (incl. revocation). Pages
  // that load data must ALSO call requireViewer() — layouts are not re-run on
  // every client-side navigation.
  const viewer = await requireViewer();
  const consent = viewer.mode === "live" ? (await getMySharingState(viewer.user.uid)).consent : undefined;
  return (
    <AppShell viewer={viewer} consent={consent}>
      {children}
    </AppShell>
  );
}
