import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPinOff, ShieldCheck } from "lucide-react";
import { Avatar, Badge, Card, CardHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { FamilyError } from "@/lib/families/errors";
import { ROLE_LABEL } from "@/lib/families/permissions";
import { getFamilyForMember } from "@/lib/families/service.server";
import { docIdSchema } from "@/lib/families/validation";
import { getFamilyLocations } from "@/lib/location/service.server";

export const metadata: Metadata = { title: "Member" };

/**
 * Member profile as seen by fellow members. Data minimisation: only what's
 * in the family record (name, role, colour, join date) — never another
 * member's email or phone number.
 */
export default async function MemberProfilePage({ params }: { params: Promise<{ familyId: string; uid: string }> }) {
  const { familyId: rawFamily, uid: rawUid } = await params;
  const viewer = await requireViewer(`/family/${rawFamily}/members/${rawUid}`);
  if (viewer.mode === "preview") redirect("/family");
  const familyId = docIdSchema.safeParse(rawFamily);
  const uid = docIdSchema.safeParse(rawUid);
  if (!familyId.success || !uid.success) notFound();

  const family = await getFamilyForMember(familyId.data, viewer.user.uid).catch((e) => {
    if (e instanceof FamilyError && e.status === 404) notFound();
    throw e;
  });
  const member = family.members.find((m) => m.uid === uid.data);
  if (!member) notFound();
  const loc = (await getFamilyLocations(family.id, viewer.user.uid)).find((m) => m.uid === member.uid);

  return (
    <>
      <Link href={`/family/${family.id}`} className="mb-3 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> {family.name}
      </Link>
      <Card className="mb-4 flex flex-col items-center gap-4 py-8 text-center sm:flex-row sm:text-left">
        <Avatar name={member.displayName} color={member.color} size={72} />
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">{member.displayName}</h1>
          <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Badge tone={member.role === "owner" ? "purple" : member.role === "guardian" ? "blue" : "neutral"}>
              {ROLE_LABEL[member.role]}
            </Badge>
            <Badge>
              <span className="h-2 w-2 rounded-full" style={{ background: member.color }} aria-hidden="true" /> Map colour
            </Badge>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader icon={<MapPinOff className="h-4 w-4" />} title="Location sharing" />
          {loc?.location ? (
            <p className="text-sm text-slate-400">
              Sharing with this family · {loc.location.presence === "online" ? "online" : "last seen"}{" "}
              {new Date(loc.location.updatedAt).toLocaleString()} · ±{Math.round(loc.location.accuracy)} m
            </p>
          ) : (
            <p className="text-sm text-slate-400">
              Not sharing with this family. {member.displayName.split(" ")[0]} decides if and when to share.
            </p>
          )}
        </Card>
        <Card>
          <CardHeader icon={<CalendarDays className="h-4 w-4" />} title="Membership" />
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">Family</dt>
              <dd className="text-white">{family.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Joined</dt>
              <dd className="text-white">{new Date(member.joinedAt).toLocaleDateString()}</dd>
            </div>
          </dl>
          <p className="mt-4 flex gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 shrink-0 text-safe" aria-hidden="true" />
            Contact details stay private — members only see each other&apos;s name and role.
          </p>
        </Card>
      </div>
    </>
  );
}
