"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, Link2, Mail, MessageCircle, RefreshCw, Share2, Smartphone, UserPlus, X } from "lucide-react";
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

type Via = "link" | "email" | "phone";

/** The private join link for an invitation, shown once right after it is created (or renewed). */
function JoinLinkBox({ familyName, url, email, onClose }: { familyName: string; url: string; email: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const message = `I've invited you to join "${familyName}" on FamilyGuard AI. Open this private link to join: ${url}\n\nYou decide if and when to share your location.`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-neon-cyan/30 bg-neon-cyan/[0.05] p-4" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-white">Invitation link ready</p>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <input
        readOnly
        value={url}
        aria-label="Invitation link"
        onFocus={(e) => e.currentTarget.select()}
        className="h-10 w-full rounded-lg border border-white/10 bg-ink-900/70 px-3 font-mono text-xs text-slate-200"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        <a
          href={`mailto:${email ? encodeURIComponent(email) : ""}?subject=${encodeURIComponent(`Join ${familyName} on FamilyGuard AI`)}&body=${encodeURIComponent(message)}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs text-slate-200 hover:border-neon-cyan/60 hover:text-white"
        >
          <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Send by email
        </a>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs text-slate-200 hover:border-neon-cyan/60 hover:text-white"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Send on WhatsApp
        </a>
        {canShare && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigator.share({ title: `Join ${familyName} on FamilyGuard AI`, text: message }).catch(() => undefined)}
          >
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" /> Share…
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-400">
        Anyone who opens this link and signs in can join, so send it only to the person you mean. It works once and expires in
        7 days. They still choose whether to share their location.
      </p>
    </div>
  );
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
  const [via, setVia] = useState<Via>("link");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ tone: "safe" | "danger"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; email: string | null } | null>(null);

  const roles = (["member", "guardian"] as const).filter((r) => canInviteAs(myRole, r));
  const joinUrl = (token: string) => `${window.location.origin}/join/${token}`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    setLink(null);
    const form = e.currentTarget;
    const fd = Object.fromEntries(new FormData(form));
    const contact = typeof fd.contact === "string" ? fd.contact.trim() : "";
    if (via !== "link" && !contact) {
      return setErrors({ contact: via === "email" ? "Enter their email address" : "Enter their mobile number" });
    }
    const raw = { role: fd.role, ...(via === "email" ? { email: contact } : via === "phone" ? { phone: contact } : {}) };
    const parsed = inviteSchema.safeParse(raw);
    if (!parsed.success) {
      const f = fieldErrors(parsed.error);
      return setErrors({ contact: f.email ?? f.phone ?? "Invalid value", role: f.role ?? "" });
    }
    setErrors({});
    setLoading(true);
    const res = await api<{ joinToken: string }>(`/api/families/${familyId}/invitations`, { method: "POST", body: parsed.data });
    setLoading(false);
    if (!res.ok) return setStatus({ tone: "danger", text: res.message });
    form.reset();
    setLink({ url: joinUrl(res.data.joinToken), email: "email" in parsed.data && parsed.data.email ? parsed.data.email : null });
    router.refresh();
  }

  async function renew(id: string) {
    setBusy(`renew:${id}`);
    setStatus(null);
    const res = await api<{ joinToken: string }>(`/api/families/${familyId}/invitations/${id}/link`, { method: "POST" });
    setBusy(null);
    if (!res.ok) return setStatus({ tone: "danger", text: res.message });
    const inv = invitations.find((i) => i.id === id);
    setLink({ url: joinUrl(res.data.joinToken), email: inv?.inviteeEmail ?? null });
  }

  async function revoke(id: string) {
    setBusy(`revoke:${id}`);
    const res = await api(`/api/families/${familyId}/invitations/${id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) setStatus({ tone: "danger", text: res.message });
    router.refresh();
  }

  const tabs = [
    ["link", "Link", Link2],
    ["email", "Email", Mail],
    ["phone", "Phone", Smartphone],
  ] as const;

  return (
    <Card>
      <CardHeader
        icon={<UserPlus className="h-4 w-4" />}
        title="Invite someone"
        description="Create a private link and send it on WhatsApp or SMS. They sign in, press Join, and then choose to share their location."
      />
      {status && <Notice tone={status.tone} className="mb-4">{status.text}</Notice>}
      {link && <JoinLinkBox familyName={familyName} url={link.url} email={link.email} onClose={() => setLink(null)} />}

      <div role="tablist" aria-label="Invite by" className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-white/[0.04] p-1">
        {tabs.map(([key, label, Icon]) => (
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
        {via === "link" ? (
          <p className="text-sm text-slate-400">
            No email or number needed. You&apos;ll get a link to send however you like.
          </p>
        ) : (
          <Input
            name="contact"
            type={via === "email" ? "email" : "tel"}
            label={via === "email" ? "Their email address" : "Their mobile number"}
            placeholder={via === "email" ? "name@example.com" : "+91 98765 43210"}
            hint={
              via === "email"
                ? "They'll also see the invitation in the app if they sign in with this verified email."
                : "They'll also see the invitation in the app if they sign in with this number."
            }
            error={errors.contact}
          />
        )}
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
        <Button type="submit" loading={loading}>
          {!loading && <Link2 className="h-4 w-4" aria-hidden="true" />} Create invitation link
        </Button>
      </form>

      <div className="mt-6">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Pending invitations ({invitations.length})
        </h4>
        {invitations.length === 0 ? (
          <p className="text-sm text-slate-500">No pending invitations.</p>
        ) : (
          <ul className="space-y-1.5" aria-label="Pending invitations">
            {invitations.map((inv) => {
              const who = inv.inviteeEmail ?? inv.inviteePhone ?? "Invitation link";
              const expired = inv.status === "expired";
              return (
                <li key={inv.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-200">{who}</p>
                    <p className="text-[11px] text-slate-500">
                      {ROLE_LABEL[inv.role]} · by {inv.invitedByName} ·{" "}
                      {expired ? "expired" : `expires ${new Date(inv.expiresAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  {expired && <Badge tone="warn">Expired</Badge>}
                  {!expired && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => renew(inv.id)}
                      loading={busy === `renew:${inv.id}`}
                      disabled={!!busy}
                      aria-label={`Get a new link for ${who}`}
                    >
                      {busy !== `renew:${inv.id}` && <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />} New link
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revoke(inv.id)}
                    loading={busy === `revoke:${inv.id}`}
                    disabled={!!busy}
                    aria-label={`Revoke invitation for ${who}`}
                  >
                    {busy !== `revoke:${inv.id}` && <X className="h-3.5 w-3.5" aria-hidden="true" />} Revoke
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {invitations.some((i) => i.status !== "expired") && (
          <p className="mt-2 text-[11px] text-slate-500">
            For your privacy, links aren&apos;t stored. &quot;New link&quot; makes a fresh one and the old one stops working.
          </p>
        )}
      </div>
    </Card>
  );
}
