"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, MailOpen, X } from "lucide-react";
import { Badge, Button, Card, CardHeader, Notice } from "@/components/ui";
import { api } from "@/lib/api/client";
import { ROLE_LABEL } from "@/lib/families/permissions";
import type { FamilyRole } from "@/types/models";

export interface MyInvitation {
  id: string;
  familyName: string;
  invitedByName: string;
  role: FamilyRole;
  expiresAt: number;
}

/** Invitations addressed to the signed-in user. Joining always requires their explicit Accept. */
export function MyInvitations({ invitations }: { invitations: MyInvitation[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (invitations.length === 0) return null;

  async function respond(id: string, action: "accept" | "reject") {
    setBusy(`${id}:${action}`);
    setError(null);
    const res = await api<{ familyId: string }>(`/api/invitations/${id}`, { method: "POST", body: { action } });
    setBusy(null);
    if (!res.ok) return setError(res.message);
    // Navigate OR refresh — never both: a refresh fired right after push can
    // overtake the navigation and re-render the current page instead.
    if (action === "accept") router.push(`/family/${res.data.familyId}`);
    else router.refresh();
  }

  return (
    <Card className="gradient-border mb-6">
      <CardHeader
        icon={<MailOpen className="h-4 w-4" />}
        title={`You have ${invitations.length} invitation${invitations.length > 1 ? "s" : ""}`}
        description="Joining lets members of that family see what you choose to share with them. Nothing is shared automatically."
      />
      {error && <Notice tone="danger" className="mb-3">{error}</Notice>}
      <ul className="space-y-2">
        {invitations.map((inv) => (
          <li key={inv.id} className="flex flex-col gap-3 rounded-xl bg-white/[0.03] p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-white">{inv.familyName}</p>
              <p className="text-xs text-slate-400">
                Invited by {inv.invitedByName} · joins as <Badge tone="blue">{ROLE_LABEL[inv.role]}</Badge> · expires{" "}
                {new Date(inv.expiresAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => respond(inv.id, "reject")} loading={busy === `${inv.id}:reject`} disabled={!!busy}>
                {busy !== `${inv.id}:reject` && <X className="h-3.5 w-3.5" aria-hidden="true" />} Decline
              </Button>
              <Button size="sm" onClick={() => respond(inv.id, "accept")} loading={busy === `${inv.id}:accept`} disabled={!!busy}>
                {busy !== `${inv.id}:accept` && <Check className="h-3.5 w-3.5" aria-hidden="true" />} Accept
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
