import type { Metadata } from "next";
import { History, PhoneCall } from "lucide-react";
import { EmergencyContactsCard } from "@/components/sos/EmergencyContactsCard";
import { AlertList, SosButtonPanel } from "@/components/sos/SosPanel";
import { Notice, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { canManageInvites } from "@/lib/families/permissions";
import { listMyFamilies } from "@/lib/families/service.server";
import { getEmergencySettings, listSosForUser } from "@/lib/sos/service.server";

export const metadata: Metadata = { title: "Emergency SOS" };

export default async function SosPage({ searchParams }: { searchParams: Promise<{ alert?: string }> }) {
  const viewer = await requireViewer("/sos");
  const header = (
    <PageHeader title="Emergency SOS" description="Alert your family with one deliberate, confirmed press." />
  );
  if (viewer.mode === "preview") {
    return (
      <>
        {header}
        <Notice tone="warn" title="Preview mode">
          SOS alerts are delivered through Firebase. Configure Firebase (see README) to use them.
        </Notice>
      </>
    );
  }

  const { user } = viewer;
  const [families, alerts, emergency, sp] = await Promise.all([
    listMyFamilies(user.uid),
    listSosForUser(user.uid),
    getEmergencySettings(user.uid),
    searchParams,
  ]);
  const now = Date.now();
  const active = alerts.filter((a) => a.status === "active");
  const mineActive = active.filter((a) => a.uid === user.uid);
  const incoming = active.filter((a) => a.uid !== user.uid);
  const history = alerts.filter((a) => a.status !== "active");
  const managerFamilyIds = families.filter((f) => canManageInvites(f.myRole)).map((f) => f.id);

  return (
    <>
      {header}
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <SosButtonPanel
            families={families.map((f) => ({ id: f.id, name: f.name, members: f.members.length }))}
            hasActive={mineActive.length > 0}
          />
          {(mineActive.length > 0 || incoming.length > 0) && (
            <AlertList
              title="Active alerts"
              alerts={[...mineActive, ...incoming]}
              myUid={user.uid}
              managerFamilyIds={managerFamilyIds}
              highlightId={sp.alert}
              now={now}
              empty=""
            />
          )}
          <Notice tone="info" title="In immediate danger?">
            <span className="inline-flex items-center gap-1">
              <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" /> Call {emergency.emergencyNumber} first.
            </span>{" "}
            FamilyGuard alerts your family; it does not contact emergency services.
          </Notice>
        </div>
        <div className="space-y-4">
          <EmergencyContactsCard initial={emergency} />
          <AlertList
            title="SOS history"
            alerts={history}
            myUid={user.uid}
            managerFamilyIds={managerFamilyIds}
            highlightId={sp.alert}
            now={now}
            empty="No past alerts."
          />
        </div>
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
        <History className="h-3.5 w-3.5" aria-hidden="true" /> Alerts are visible only to the sender and current members of the
        families that were alerted.
      </p>
    </>
  );
}
