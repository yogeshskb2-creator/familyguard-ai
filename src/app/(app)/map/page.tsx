import type { Metadata } from "next";
import Link from "next/link";
import { MapPinned, Users } from "lucide-react";
import { LiveMap } from "@/components/map/LiveMap";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { listMyFamilies } from "@/lib/families/service.server";

export const metadata: Metadata = { title: "Live Map" };

export default async function MapPage({ searchParams }: { searchParams: Promise<{ family?: string }> }) {
  const viewer = await requireViewer("/map");
  const header = (
    <PageHeader title="Live Map" description="Family members who have chosen to share their location with you." />
  );

  if (viewer.mode === "preview") {
    return (
      <>
        {header}
        <Notice tone="warn" title="Preview mode">
          The live map shows real, consented locations from Firestore. Configure Firebase (see README) to use it.
        </Notice>
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
            description="The map shows members of your families who choose to share their location."
            action={
              <Link href="/family" className="text-sm font-medium text-neon-cyan hover:underline">
                Go to Family →
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  const { family } = await searchParams;
  // Only accept a family the viewer belongs to; anything else falls back to the first.
  const initialFamilyId = families.some((f) => f.id === family) ? family : families[0]!.id;

  return (
    <>
      {header}
      <LiveMap families={families.map((f) => ({ id: f.id, name: f.name }))} myUid={viewer.user.uid} initialFamilyId={initialFamilyId} />
      <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
        <MapPinned className="h-3.5 w-3.5" aria-hidden="true" />
        Locations are visible only to members of the families each person chose to share with.
      </p>
    </>
  );
}
