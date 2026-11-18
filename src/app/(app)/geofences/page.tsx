import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { ZoneManager } from "@/components/geofences/ZoneManager";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { listMyFamilies } from "@/lib/families/service.server";

export const metadata: Metadata = { title: "Safe Zones" };

export default async function GeofencesPage() {
  const viewer = await requireViewer("/geofences");
  const header = <PageHeader title="Safe Zones" description="Get notified when family members arrive at or leave places like Home or School." />;
  if (viewer.mode === "preview") {
    return (
      <>
        {header}
        <Notice tone="warn" title="Preview mode">Configure Firebase (see README) to create safe zones.</Notice>
      </>
    );
  }
  const families = await listMyFamilies(viewer.user.uid);
  if (families.length === 0) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Join or create a family first"
            description="Safe zones belong to a family."
            action={<Link href="/family" className="text-sm font-medium text-neon-cyan hover:underline">Go to Family →</Link>}
          />
        </Card>
      </>
    );
  }
  return (
    <>
      {header}
      <ZoneManager families={families.map((f) => ({ id: f.id, name: f.name, myRole: f.myRole }))} myUid={viewer.user.uid} />
    </>
  );
}
