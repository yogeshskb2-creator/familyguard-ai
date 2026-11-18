"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MapPinOff, ShieldAlert, Trash2 } from "lucide-react";
import { Button, Card, CardHeader, ConfirmDialog, Notice } from "@/components/ui";
import { api } from "@/lib/api/client";
import { signOut } from "@/lib/auth/client";
import { setLocalDeviceId } from "@/lib/devices/client";

export function DataControlsCard() {
  const router = useRouter();
  const [dialog, setDialog] = useState<"location" | "account" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function deleteLocation() {
    setBusy(true);
    setError(null);
    const res = await api<{ historyDeleted: number }>("/api/location/delete-all", { method: "POST" });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setDialog(null);
    setDone(`Location sharing is off, your live location was deleted, and ${res.data.historyDeleted} history point${res.data.historyDeleted === 1 ? "" : "s"} were erased.`);
    router.refresh();
  }

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    const res = await api("/api/account", { method: "DELETE", body: { confirm: "DELETE" } });
    if (!res.ok) {
      setBusy(false);
      if (res.code === "reauth_required") {
        // Sign in again, then come straight back here.
        await signOut();
        router.replace("/login?next=%2Fsettings%23data&reauth=1");
        return;
      }
      return setError(res.message);
    }
    setLocalDeviceId(null);
    await signOut().catch(() => undefined);
    router.replace("/?deleted=1");
  }

  return (
    <Card id="data">
      <CardHeader icon={<Trash2 className="h-4 w-4" />} title="Your data" description="You can erase your data at any time." />
      {done && <Notice tone="safe" className="mb-3">{done}</Notice>}
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-white">Delete all location data</p>
          <p className="mt-0.5 text-xs text-slate-400">Turns sharing off, deletes your live location and your entire location history.</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setDialog("location")}>
            <MapPinOff className="h-3.5 w-3.5" aria-hidden="true" /> Delete location data
          </Button>
        </div>
        <div className="rounded-xl border border-danger/25 bg-danger/[0.04] p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            <ShieldAlert className="h-4 w-4 text-danger" aria-hidden="true" /> Delete account
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Permanently deletes your account, profile, locations, history, SOS alerts, devices and notifications. Families you
            own pass to their longest-standing guardian (or member); families with nobody else are deleted. This can&apos;t be undone.
          </p>
          <Button variant="danger" size="sm" className="mt-3" onClick={() => setDialog("account")}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete my account
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={dialog === "location"}
        danger
        title="Delete all your location data?"
        description="Sharing will turn off and your live location and history are erased immediately."
        confirmLabel="Delete location data"
        loading={busy}
        error={error}
        onConfirm={deleteLocation}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "account"}
        danger
        title="Delete your account permanently?"
        description="Everything listed above is erased. For your security you may be asked to sign in again first."
        confirmText="DELETE"
        confirmLabel="Delete account forever"
        loading={busy}
        error={error}
        onConfirm={deleteAccount}
        onClose={() => setDialog(null)}
      />
    </Card>
  );
}
