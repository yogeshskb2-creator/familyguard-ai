import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { FamilySettings } from "@/components/family/FamilySettings";
import { InvitePanel } from "@/components/family/InvitePanel";
import { MemberList } from "@/components/family/MemberList";
import { FamilyLocationsCard } from "@/components/location/FamilyLocationsCard";
import { ShareWithFamilyCard } from "@/components/location/ShareWithFamilyCard";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { FamilyError } from "@/lib/families/errors";
import { ROLE_LABEL, canManageInvites } from "@/lib/families/permissions";
import { getFamilyForMember, listFamilyInvitations } from "@/lib/families/service.server";
import { docIdSchema } from "@/lib/families/validation";

export const metadata: Metadata = { title: "Family" };

const permissionsCopy = {
  owner: "You can invite guardians and members, change roles, remove anyone, rename or delete the family.",
  guardian: "You can invite and remove members. Only the owner can change roles.",
  member: "You can see the family and its members, and leave at any time.",
} as const;

export default async function FamilyDetailPage({ params }: { params: Promise<{ familyId: string }> }) {
  const { familyId: raw } = await params;
  const viewer = await requireViewer(`/family/${raw}`);
  if (viewer.mode === "preview") redirect("/family");
  const id = docIdSchema.safeParse(raw);
  if (!id.success) notFound();

  const family = await getFamilyForMember(id.data, viewer.user.uid).catch((e) => {
    if (e instanceof FamilyError && e.status === 404) notFound();
    throw e;
  });
  const invitations = canManageInvites(family.myRole) ? await listFamilyInvitations(family.id, viewer.user.uid) : [];

  return (
    <>
      <Link href="/family" className="mb-3 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All families
      </Link>
      <PageHeader
        title={family.name}
        description={`${family.members.length} member${family.members.length === 1 ? "" : "s"}`}
        actions={<Badge tone="purple">You are {ROLE_LABEL[family.myRole].toLowerCase()}</Badge>}
      />
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <ShareWithFamilyCard familyId={family.id} familyName={family.name} />
          <FamilyLocationsCard familyId={family.id} myUid={viewer.user.uid} />
          <MemberList familyId={family.id} members={family.members} myUid={viewer.user.uid} myRole={family.myRole} />
          <Card>
            <CardHeader icon={<Info className="h-4 w-4" />} title="Your permissions" />
            <p className="text-sm text-slate-400">{permissionsCopy[family.myRole]}</p>
            <p className="mt-2 text-sm text-slate-400">
              Being in a family never shares your location by itself — you choose which families can see you when you start
              sharing.
            </p>
          </Card>
        </div>
        <div className="space-y-4">
          {canManageInvites(family.myRole) && (
            <InvitePanel familyId={family.id} familyName={family.name} myRole={family.myRole} invitations={invitations} />
          )}
          <FamilySettings familyId={family.id} familyName={family.name} myRole={family.myRole} myUid={viewer.user.uid} />
        </div>
      </div>
    </>
  );
}
