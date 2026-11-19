"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, MapPin, ShieldCheck, Users, X } from "lucide-react";
import { useSharing } from "@/components/location/LocationSharingProvider";
import { Badge, Button, Card, CardHeader, Notice } from "@/components/ui";
import { api } from "@/lib/api/client";
import { ROLE_LABEL } from "@/lib/families/permissions";
import type { FamilyRole } from "@/types/models";

export interface JoinInvite {
  familyId: string;
  familyName: string;
  invitedByName: string;
  role: Exclude<FamilyRole, "owner">;
  memberCount: number;
  expiresAt: number;
}

/**
 * Two explicit steps: (1) join the family, (2) choose to share location with it.
 * Joining never shares anything by itself.
 */
export function JoinInvitation({ token, invite }: { token: string; invite: JoinInvite }) {
  const router = useRouter();
  const sharing = useSharing();
  const [busy, setBusy] = useState<"accept" | "reject" | "share" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  async function respond(action: "accept" | "reject") {
    setBusy(action);
    setError(null);
    const res = await api<{ familyId: string }>(`/api/join/${token}`, { method: "POST", body: { action } });
    setBusy(null);
    if (!res.ok) return setError(res.message);
    if (action === "accept") setJoined(true);
    else router.replace("/family");
  }

  async function shareLocation() {
    setBusy("share");
    setError(null);
    let ok: boolean;
    if (sharing.consent.active) {
      // Already sharing with other families: add this one, and make sure this device is sending.
      const familyIds = [...new Set([...sharing.consent.familyIds, invite.familyId])];
      ok = await sharing.update({ familyIds });
      if (ok && sharing.status !== "live") await sharing.resume();
    } else {
      ok = await sharing.start({ familyIds: [invite.familyId], keepHistory: false, historyRetentionDays: 7 });
    }
    setBusy(null);
    if (ok) router.push(`/family/${invite.familyId}`);
  }

  const shareError = error ?? sharing.error;

  if (joined) {
    return (
      <Card className="gradient-border max-w-xl">
        <CardHeader
          icon={<MapPin className="h-4 w-4" />}
          title={`You joined ${invite.familyName}`}
          description="Last step: let this family see where you are. You can stop sharing at any time in Settings."
        />
        {shareError && <Notice tone="danger" className="mb-3">{shareError}</Notice>}
        <ul className="mb-4 space-y-1.5 text-sm text-slate-300">
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-safe" aria-hidden="true" />
            Only members of {invite.familyName} will see your location.
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-safe" aria-hidden="true" />
            Your browser will ask for permission. Press <b className="text-white">Allow</b>.
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-safe" aria-hidden="true" />
            Updates are sent while FamilyGuard is open. Keep it open or add it to your home screen.
          </li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button onClick={shareLocation} loading={busy === "share"} disabled={!!busy}>
            {busy !== "share" && <MapPin className="h-4 w-4" aria-hidden="true" />} Share my location
          </Button>
          <Button variant="ghost" onClick={() => router.push(`/family/${invite.familyId}`)} disabled={!!busy}>
            Not now
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="gradient-border max-w-xl">
      <CardHeader
        icon={<Users className="h-4 w-4" />}
        title={`${invite.invitedByName} invited you to ${invite.familyName}`}
        description="Joining lets you see the family and lets you choose to share your location with them. Nothing is shared automatically."
      />
      {error && <Notice tone="danger" className="mb-3">{error}</Notice>}
      <p className="mb-4 text-sm text-slate-400">
        {invite.memberCount} member{invite.memberCount === 1 ? "" : "s"} · you join as{" "}
        <Badge tone="blue">{ROLE_LABEL[invite.role]}</Badge> · link expires {new Date(invite.expiresAt).toLocaleDateString()}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => respond("accept")} loading={busy === "accept"} disabled={!!busy}>
          {busy !== "accept" && <Check className="h-4 w-4" aria-hidden="true" />} Join {invite.familyName}
        </Button>
        <Button variant="ghost" onClick={() => respond("reject")} loading={busy === "reject"} disabled={!!busy}>
          {busy !== "reject" && <X className="h-4 w-4" aria-hidden="true" />} Decline
        </Button>
      </div>
    </Card>
  );
}
