"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MapPin, Radio, ShieldCheck } from "lucide-react";
import { Button, Card, CardHeader, Notice } from "@/components/ui";
import { useShareWithFamily } from "./useShareWithFamily";

/**
 * Shown on a family's page whenever the viewer's own location isn't reaching
 * that family: either they never chose to share with it, or they did but this
 * device isn't sending (browser closed, permission blocked, …).
 */
export function ShareWithFamilyCard({ familyId, familyName }: { familyId: string; familyName: string }) {
  const router = useRouter();
  const { share, busy, sharesThisFamily, status, error } = useShareWithFamily(familyId);
  // On page load an already-sharing device resumes by itself within a moment;
  // don't flash "not being sent" while that happens.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 4000);
    return () => clearTimeout(t);
  }, []);

  if (sharesThisFamily && (status === "live" || (status === "paused" && !settled))) return null;

  const paused = sharesThisFamily;
  return (
    <Card className="gradient-border">
      <CardHeader
        icon={paused ? <Radio className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
        title={paused ? "Your location isn't being sent from this device" : `Share your location with ${familyName}`}
        description={
          paused
            ? `You chose to share with ${familyName}, but this device isn't sending updates right now.`
            : `Members of ${familyName} can't see you yet. Being in a family never shares your location by itself.`
        }
      />
      {error && <Notice tone="danger" className="mb-3">{error}</Notice>}
      {!paused && (
        <ul className="mb-4 space-y-1.5 text-sm text-slate-300">
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-safe" aria-hidden="true" />
            Only members of {familyName} will see it, and you can stop at any time.
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-safe" aria-hidden="true" />
            Your browser will ask for permission. Press <b className="text-white">Allow</b>.
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-safe" aria-hidden="true" />
            Updates are sent while FamilyGuard is open on this phone.
          </li>
        </ul>
      )}
      <Button
        onClick={async () => {
          if (await share()) router.refresh();
        }}
        loading={busy || status === "starting"}
      >
        {!busy && <MapPin className="h-4 w-4" aria-hidden="true" />} {paused ? "Resume sharing" : "Share my location"}
      </Button>
    </Card>
  );
}
