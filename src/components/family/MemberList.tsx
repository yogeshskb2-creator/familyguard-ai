"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, ShieldCheck, UserMinus } from "lucide-react";
import { Avatar, Badge, Button, Card, CardHeader, ConfirmDialog, Notice } from "@/components/ui";
import { api } from "@/lib/api/client";
import { ROLE_LABEL, canChangeRole, canRemoveMember } from "@/lib/families/permissions";
import type { FamilyMember, FamilyRole } from "@/types/models";
import { Users } from "lucide-react";

const roleTone = { owner: "purple", guardian: "blue", member: "neutral" } as const;

export function MemberList({
  familyId,
  members,
  myUid,
  myRole,
}: {
  familyId: string;
  members: FamilyMember[];
  myUid: string;
  myRole: FamilyRole;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<FamilyMember | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function setRole(m: FamilyMember, role: FamilyRole) {
    setPending(m.uid);
    setError(null);
    const res = await api(`/api/families/${familyId}/members/${m.uid}`, { method: "PATCH", body: { role } });
    setPending(null);
    if (!res.ok) setError(res.message);
    router.refresh();
  }

  async function confirmRemove() {
    if (!removing) return;
    setPending(removing.uid);
    setRemoveError(null);
    const res = await api(`/api/families/${familyId}/members/${removing.uid}`, { method: "DELETE" });
    setPending(null);
    if (!res.ok) return setRemoveError(res.message);
    setRemoving(null);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader icon={<Users className="h-4 w-4" />} title={`Members (${members.length})`} description="Only approved members appear here." />
      {error && <Notice tone="danger" className="mb-3">{error}</Notice>}
      <ul className="divide-y divide-white/5" aria-label="Family members">
        {members.map((m) => {
          const self = m.uid === myUid;
          const nextRole: FamilyRole = m.role === "guardian" ? "member" : "guardian";
          const showRole = canChangeRole(myRole, m.role, nextRole, self);
          const showRemove = !self && canRemoveMember(myRole, m.role, false);
          return (
            <li key={m.uid} className="flex flex-wrap items-center gap-3 py-3">
              <Link href={`/family/${familyId}/members/${m.uid}`} className="group flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={m.displayName} color={m.color} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white group-hover:underline">
                    {m.displayName} {self && <span className="text-slate-500">(you)</span>}
                  </p>
                  <p className="text-xs text-slate-500">Joined {new Date(m.joinedAt).toLocaleDateString()}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-600" aria-hidden="true" />
              </Link>
              <Badge tone={roleTone[m.role]}>{ROLE_LABEL[m.role]}</Badge>
              {(showRole || showRemove) && (
                <div className="flex gap-1">
                  {showRole && (
                    <Button size="sm" variant="ghost" loading={pending === m.uid} onClick={() => setRole(m, nextRole)}>
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      {nextRole === "guardian" ? "Make guardian" : "Make member"}
                    </Button>
                  )}
                  {showRemove && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-[#ff8399] hover:text-[#ffb3c0]"
                      onClick={() => {
                        setRemoveError(null);
                        setRemoving(m);
                      }}
                      aria-label={`Remove ${m.displayName}`}
                    >
                      <UserMinus className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={!!removing}
        danger
        title={`Remove ${removing?.displayName}?`}
        description="They'll immediately lose access to this family and to anything its members share. They can only rejoin with a new invitation."
        confirmLabel="Remove member"
        loading={!!removing && pending === removing.uid}
        error={removeError}
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      />
    </Card>
  );
}
