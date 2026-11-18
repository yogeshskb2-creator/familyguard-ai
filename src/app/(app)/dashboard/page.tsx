import type { Metadata } from "next";
import { LiveDashboard } from "@/components/dashboard/LiveDashboard";
import { PreviewDashboard } from "@/components/dashboard/PreviewDashboard";
import { requireViewer } from "@/lib/auth/session";
import { listMyFamilies, listMyInvitations } from "@/lib/families/service.server";
import { countSharingWithMe } from "@/lib/location/service.server";
import { listMyRecentEvents } from "@/lib/families/events.server";
import { countZones } from "@/lib/geofences/service.server";
import { listSosForUser } from "@/lib/sos/service.server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const viewer = await requireViewer("/dashboard");
  if (viewer.mode === "preview") return <PreviewDashboard />;
  const uid = viewer.user.uid;
  const [families, invitations, sharing, alerts] = await Promise.all([
    listMyFamilies(uid),
    listMyInvitations(viewer.user),
    countSharingWithMe(uid),
    listSosForUser(uid, 20),
  ]);
  const familyIds = families.map((f) => f.id);
  const [zoneCount, events] = await Promise.all([countZones(familyIds), listMyRecentEvents(familyIds, uid, 8)]);
  return (
    <LiveDashboard
      myUid={uid}
      name={viewer.user.displayName}
      families={families}
      invitations={invitations}
      sharing={sharing}
      openSos={alerts.filter((a) => a.status === "active").length}
      zoneCount={zoneCount}
      events={events}
    />
  );
}
