import type { Metadata } from "next";
import { NotificationList } from "@/components/notifications/NotificationList";
import { Notice, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { NotificationPrefsCard } from "@/components/notifications/NotificationPrefsCard";
import { listMyDevices } from "@/lib/devices/service.server";
import { adminDb } from "@/lib/firebase/admin";
import { prefsFromDoc } from "@/lib/notifications/prefs";
import { listNotifications } from "@/lib/notifications/service.server";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const viewer = await requireViewer("/notifications");
  const header = <PageHeader title="Notifications" description="SOS alerts, safe-zone arrivals and departures, and family updates." />;
  if (viewer.mode === "preview") {
    return (
      <>
        {header}
        <Notice tone="warn" title="Preview mode">Configure Firebase (see README) to receive notifications.</Notice>
      </>
    );
  }
  const uid = viewer.user.uid;
  const [items, user, devices] = await Promise.all([
    listNotifications(uid),
    adminDb().collection("users").doc(uid).get(),
    listMyDevices(uid),
  ]);
  return (
    <>
      {header}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <NotificationList initial={items} now={Date.now()} />
        <NotificationPrefsCard
          initial={prefsFromDoc(user.get("notificationPrefs"))}
          pushDevices={devices.filter((d) => d.status === "active" && d.pushEnabled).length}
        />
      </div>
    </>
  );
}
