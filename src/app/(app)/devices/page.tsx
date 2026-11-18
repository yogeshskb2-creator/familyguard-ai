import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, MapPin, ShieldCheck, UserRound } from "lucide-react";
import { DeviceManager } from "@/components/devices/DeviceManager";
import { Badge, Card, CardHeader, Notice, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { listMyDevices } from "@/lib/devices/service.server";
import { getMySharingState } from "@/lib/location/service.server";

export const metadata: Metadata = { title: "Devices" };

const PROVIDER: Record<string, string> = { password: "Email & password", "google.com": "Google", phone: "Phone (SMS)" };

export default async function DevicesPage() {
  const viewer = await requireViewer("/devices");
  const header = <PageHeader title="Devices" description="Devices you've registered to your account, and where your notifications go." />;
  if (viewer.mode === "preview") {
    return (
      <>
        {header}
        <Notice tone="warn" title="Preview mode">Configure Firebase (see README) to register devices.</Notice>
      </>
    );
  }
  const { user } = viewer;
  const [devices, sharing] = await Promise.all([listMyDevices(user.uid), getMySharingState(user.uid)]);

  return (
    <>
      {header}
      <Card className="mb-4">
        <CardHeader icon={<UserRound className="h-4 w-4" />} title="Account status" />
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-500">Account</dt>
            <dd className="mt-1 flex items-center gap-2 text-white">
              <Badge tone="safe" dot>Active</Badge>
              {user.emailVerified && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <BadgeCheck className="h-3.5 w-3.5 text-safe" aria-hidden="true" /> Email verified
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Sign-in method</dt>
            <dd className="mt-1 text-white">{PROVIDER[user.signInProvider] ?? user.signInProvider}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Location sharing</dt>
            <dd className="mt-1 flex items-center gap-2 text-white">
              <Badge tone={sharing.consent.active ? "cyan" : "neutral"} dot>
                <MapPin className="h-3 w-3" aria-hidden="true" /> {sharing.consent.active ? "On" : "Off"}
              </Badge>
              <Link href="/settings#location" className="text-xs text-neon-cyan hover:underline">
                Manage
              </Link>
            </dd>
          </div>
        </dl>
      </Card>
      <DeviceManager initial={devices} />
      <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        FamilyGuard never discovers or accesses devices you didn&apos;t register. Don&apos;t recognise one? Remove it and use “Sign
        out everywhere”.
      </p>
    </>
  );
}
