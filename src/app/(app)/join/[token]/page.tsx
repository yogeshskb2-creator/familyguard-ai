import type { Metadata } from "next";
import Link from "next/link";
import { Link2Off } from "lucide-react";
import { JoinInvitation } from "@/components/family/JoinInvitation";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { FamilyError } from "@/lib/families/errors";
import { getJoinLink, type JoinLinkView } from "@/lib/families/service.server";
import { joinTokenSchema } from "@/lib/families/validation";

export const metadata: Metadata = { title: "Join a family", robots: { index: false, follow: false } };

const INVALID = "This invitation link isn't valid any more. It may have been used already. Ask the person who sent it for a new link.";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const viewer = await requireViewer(`/join/${token}`);

  if (viewer.mode === "preview") {
    return (
      <>
        <PageHeader title="Join a family" />
        <Notice tone="warn" title="Preview mode">
          Configure Firebase (see README) to use invitation links.
        </Notice>
      </>
    );
  }

  const parsed = joinTokenSchema.safeParse(token);
  let invite: JoinLinkView | null = null;
  let problem: string | null = parsed.success ? null : INVALID;
  if (parsed.success) {
    try {
      invite = await getJoinLink(viewer.user, parsed.data);
    } catch (e) {
      if (!(e instanceof FamilyError)) throw e;
      problem = e.message;
    }
  }

  if (!invite || !parsed.success) {
    return (
      <>
        <PageHeader title="Join a family" />
        <Card>
          <EmptyState icon={<Link2Off className="h-6 w-6" />} title="Link not valid" description={problem ?? INVALID} />
          <div className="pb-4 text-center">
            <Link href="/family" className="text-sm text-neon-cyan hover:underline">
              Go to your families
            </Link>
          </div>
        </Card>
      </>
    );
  }

  if (invite.alreadyMember) {
    return (
      <>
        <PageHeader title="Join a family" />
        <Notice tone="safe" title={`You're already in ${invite.familyName}`}>
          <Link href={`/family/${invite.familyId}`} className="underline">
            Open {invite.familyName}
          </Link>
        </Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Join a family" description="You were sent a private invitation link." />
      <JoinInvitation token={parsed.data} invite={invite} />
    </>
  );
}
