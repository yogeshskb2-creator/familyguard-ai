"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, Mail, Smartphone, UserPlus, X } from "lucide-react";
import { Badge, Button, Card, CardHeader, Input, Notice } from "@/components/ui";
import { api } from "@/lib/api/client";
import { ROLE_LABEL, canInviteAs } from "@/lib/families/permissions";
import { inviteSchema } from "@/lib/families/validation";
import { fieldErrors } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";
import type { FamilyRole } from "@/types/models";

export interface SentInvitation {
  id: string;
  inviteeEmail: string | null;
  inviteePhone: string | null;
  role: FamilyRole;
  status: string;
  invitedByName: string;
  expiresAt: number;
}

export function InvitePanel({
  familyId,
  familyName,
  myRole,
  invitations,
}: {
  familyId: string;
  familyName: string;
  myRole: FamilyRole;
  invitations: SentInvitation[];
}) {
  const router = useRouter();
  const [via, setVia] = useState<"email" | "phone">("email");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ tone: "safe" | "danger"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const roles = (["member", "guardian"] as const).filter((r) => canInviteAs(myRole, r));
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const shareText = `I've invited you to "${familyName}" on FamilyGuard AI. Sign in at ${appUrl}/login with this ${
    via === "email" ? "email address" : "phone number"
  } and accept the invitation on the Family page. You decide if and when to share your location.`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    const form = e.currentTarget;
    const fd = Object.fromEntries(new FormData(form));
    const raw = { role: fd.role, ...(via === "email" ? { email: fd.contact } : { phone: fd.contact }) };
    const parsed = inviteSchema.safeParse(raw);
    if (!parsed.success) {
      const f = fieldErrors(parsed.error);
      return setErrors({ contact: f.email ?? f.phone ?? "Invalid value", role: f.role ?? "" });
    }
    setErrors({});
    setLoading(true);
    const res = await api(`/api/families/${familyId}/invitations`, { method: "POST", body: parsed.data });
    setLoading(false);
    if (!res.ok) return setStatus({ tone: "danger", text: res.message });
    form.reset();
    setStatus({
      tone: "safe",
      text: "Invitation created. They'll see it after signing in with that " + (via === "email" ? "verified email." : "phone number."),
    });
    router.refresh();
  }

  async function revoke(id: string) {
    setRevoking(id);
    const res = await api(`/api/families/${familyId}/invitations/${id}`, { method: "DELETE" });
    setRevoking(null);
    if (!res.ok) setStatus({ tone: "danger", text: res.message });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        icon={<UserPlus className="h-4 w-4" />}
        title="Invite someone"
        description="They must sign in and accept before they can see anything."
      />
      {status && <Notice tone={status.tone} className="mb-4">{status.text}</Notice>}

      <div role="tablist" aria-label="Invite by" className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1">
        {(
          [
            ["email", "Email", Mail],
            ["phone", "Phone", Smartphone],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={via === key}
            onClick={() => {
              setVia(key);
              setErrors({});
            }}
            className={cn(
              "flex h-9 items-center justify-center gap-2 rounded-lg text-sm transition-colors",
              via === key ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      <form key={via} onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Invite a family member">
        <Input
          name="contact"
          type={via === "email" ? "email" : "tel"}
          label={via === "email" ? "Their email address" : "Their mobile number"}
          placeholder={via === "email" ? "name@example.com" : "+91 98765 43210"}
          error={errors.contact}
        />
        <div className="space-y-1.5">
          <label htmlFor="invite-role" className="block text-xs font-medium text-slate-300">
            Role
          </label>
          <select
            id="invite-role"
            name="role"
            defaultValue="member"
            className="h-11 w-full rounded-xl border border-white/10 bg-ink-900/70 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-neon-blue/30"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
                {r === "guardian" ? " — can invite & remove members" : " — can view the family"}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={loading}>
            Send invitation
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await navigator.clipboard?.writeText(shareText).catch(() => undefined);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            <Copy className="h-4 w-4" aria-hidden="true" /> {copied ? "Copied" : "Copy message to send"}
          </Button>
        </div>
      </form>

      <div className="mt-6">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Pending invitations ({invitations.length})
        </h4>
        {invitations.length === 0 ? (
          <p className="text-sm text-slate-500">No pending invitations.</p>
        ) : (
          <ul className="space-y-1.5" aria-label="Pending invitations">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-200">{inv.inviteeEmail ?? inv.inviteePhone}</p>
                  <p className="text-[11px] text-slate-500">
                    {ROLE_LABEL[inv.role]} · by {inv.invitedByName} ·{" "}
                    {inv.status === "expired" ? "expired" : `expires ${new Date(inv.expiresAt).toLocaleDateString()}`}
                  </p>
                </div>
                {inv.status === "expired" && <Badge tone="warn">Expired</Badge>}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => revoke(inv.id)}
                  loading={revoking === inv.id}
                  aria-label={`Revoke invitation for ${inv.inviteeEmail ?? inv.inviteePhone}`}
                >
                  {revoking !== inv.id && <X className="h-3.5 w-3.5" aria-hidden="true" />} Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
