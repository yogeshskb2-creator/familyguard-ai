import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus, Users } from "lucide-react";
import { CreateFamilyForm } from "@/components/family/CreateFamilyForm";
import { MyInvitations } from "@/components/family/MyInvitations";
import { Avatar, Badge, Card, CardHeader, EmptyState, Notice, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { LIMITS, ROLE_LABEL } from "@/lib/families/permissions";
import { listMyFamilies, listMyInvitations } from "@/lib/families/service.server";

export const metadata: Metadata = { title: "Family" };

export default async function FamilyPage() {
  const viewer = await requireViewer("/family");

  if (viewer.mode === "preview") {
    return (
      <>
        <PageHeader title="Family" description="Create a family group, invite members and manage roles." />
        <Notice tone="warn" title="Preview mode">
          Family groups are stored in Firestore. Configure Firebase (see README) to create a family and invite members.
        </Notice>
      </>
    );
  }

  const [families, invitations] = await Promise.all([listMyFamilies(viewer.user.uid), listMyInvitations(viewer.user)]);

  return (
    <>
      <PageHeader title="Family" description="Your family groups. Only people who accept an invitation can join." />
      <MyInvitations invitations={invitations} />

      {families.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Create your first family"
            description="Start a family group, then invite the people you trust. Nobody's location is shared until they turn sharing on themselves."
          />
          <div className="mx-auto max-w-lg pb-4">
            <CreateFamilyForm autoFocus />
          </div>
        </Card>
      ) : (
        <>
          <ul className="grid gap-4 md:grid-cols-2" aria-label="Your families">
            {families.map((f) => (
              <li key={f.id}>
                <Link href={`/family/${f.id}`} className="glass group block rounded-2xl p-5 transition-colors hover:bg-white/[0.06]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-lg font-semibold text-white">{f.name}</h2>
                      <p className="text-xs text-slate-400">
                        {f.members.length} member{f.members.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Badge tone={f.myRole === "owner" ? "purple" : f.myRole === "guardian" ? "blue" : "neutral"}>
                      {ROLE_LABEL[f.myRole]}
                    </Badge>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex -space-x-2">
                      {f.members.slice(0, 6).map((m) => (
                        <Avatar key={m.uid} name={m.displayName} color={m.color} size={32} />
                      ))}
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {families.length < LIMITS.maxFamiliesPerUser && (
            <Card className="mt-4">
              <CardHeader icon={<Plus className="h-4 w-4" />} title="Create another family" />
              <CreateFamilyForm />
            </Card>
          )}
        </>
      )}
    </>
  );
}
