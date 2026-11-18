"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BellOff, BellRing, Laptop, MapPin, Smartphone, Tablet, Trash2, XCircle } from "lucide-react";
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Input, Notice } from "@/components/ui";
import { api } from "@/lib/api/client";
import {
  describeThisDevice,
  disablePushOnThisDevice,
  enablePushOnThisDevice,
  getLocalDeviceId,
  pushSupport,
  setLocalDeviceId,
  type PushSupport,
} from "@/lib/devices/client";
import { cn, timeAgo } from "@/lib/utils";
import type { DeviceType } from "@/types/models";

export interface DeviceView {
  id: string;
  name: string;
  type: DeviceType;
  platform: string;
  status: "active" | "revoked";
  pushEnabled: boolean;
  registeredAt: number;
  lastActiveAt: number;
  lastLocationAt: number | null;
  online: boolean;
  sendingLocation: boolean;
}

const ICON: Record<DeviceType, typeof Smartphone> = { android: Smartphone, ios: Smartphone, tablet: Tablet, web: Laptop };

function ThisDevice({ devices, onChange }: { devices: DeviceView[]; onChange: () => void }) {
  const [localId, setLocalId] = useState<string | null>(null);
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "safe" | "danger" | "warn"; text: string } | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const id = getLocalDeviceId();
    setLocalId(id && devices.some((d) => d.id === id && d.status === "active") ? id : null);
    setName(describeThisDevice().defaultName);
    void pushSupport().then(setSupport);
  }, [devices]);

  const me = devices.find((d) => d.id === localId);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setBusy("register");
    const info = describeThisDevice();
    const res = await api<{ device: DeviceView }>("/api/devices", { method: "POST", body: { name: name.trim(), type: info.type, platform: info.platform } });
    setBusy(null);
    if (!res.ok) return setError(res.fields?.name ?? res.message);
    setLocalDeviceId(res.data.device.id);
    setMsg({ tone: "safe", text: "This device is registered." });
    onChange();
  }

  async function togglePush() {
    if (!me) return;
    setMsg(null);
    setBusy("push");
    try {
      if (me.pushEnabled) {
        await disablePushOnThisDevice(me.id);
        setMsg({ tone: "safe", text: "Push notifications turned off on this device." });
      } else {
        await enablePushOnThisDevice(me.id);
        setMsg({ tone: "safe", text: "Push notifications are on for this device." });
      }
      onChange();
    } catch (err) {
      setMsg({ tone: "danger", text: err instanceof Error ? err.message : "Couldn't change notification settings." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="gradient-border">
      <CardHeader icon={<Smartphone className="h-4 w-4" />} title="This device" description={describeThisDevice().platform} />
      {msg && <Notice tone={msg.tone} className="mb-3">{msg.text}</Notice>}
      {!me ? (
        <form onSubmit={register} noValidate className="space-y-3" aria-label="Register this device">
          <p className="text-sm text-slate-400">
            Register this device to get push notifications on it and see it in your device list. Only you can see your devices.
          </p>
          <Input label="Device name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} error={error} />
          <Button type="submit" loading={busy === "register"}>
            Register this device
          </Button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-white">{me.name}</p>
              <p className="text-xs text-slate-500">Registered {new Date(me.registeredAt).toLocaleDateString()}</p>
            </div>
            <Badge tone={me.pushEnabled ? "cyan" : "neutral"} dot>
              {me.pushEnabled ? "Push on" : "Push off"}
            </Badge>
          </div>
          {support && !support.ok && !me.pushEnabled ? (
            <Notice tone="warn" title="Push notifications unavailable here">
              {support.reason} In-app notifications still work while FamilyGuard is open.
            </Notice>
          ) : (
            <Button variant={me.pushEnabled ? "secondary" : "primary"} onClick={togglePush} loading={busy === "push"} disabled={!support}>
              {me.pushEnabled ? <BellOff className="h-4 w-4" aria-hidden="true" /> : <BellRing className="h-4 w-4" aria-hidden="true" />}
              {me.pushEnabled ? "Turn off push on this device" : "Enable push notifications"}
            </Button>
          )}
          <p className="text-xs text-slate-500">
            Your browser will ask for permission. You can choose which kinds of alerts are pushed on the Notifications page.
          </p>
        </div>
      )}
    </Card>
  );
}

function DeviceRow({ d, isThis, now, onChange }: { d: DeviceView; isThis: boolean; now: number; onChange: () => void }) {
  const [confirm, setConfirm] = useState<"revoke" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const Icon = ICON[d.type];
  const revoked = d.status === "revoked";

  async function run() {
    setBusy(true);
    const res =
      confirm === "revoke"
        ? await api(`/api/devices/${d.id}/revoke`, { method: "POST" })
        : await api(`/api/devices/${d.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setErr(res.message);
    if (isThis) setLocalDeviceId(null);
    setConfirm(null);
    onChange();
  }

  return (
    <li className={cn("py-3", revoked && "opacity-60")} data-testid={`device-${d.id}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-slate-300">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">
            {d.name} {isThis && <span className="text-slate-500">(this device)</span>}
          </p>
          <p className="text-xs text-slate-500">
            {d.platform} · {revoked ? "removed" : d.online ? "active now" : `last active ${timeAgo(d.lastActiveAt, now)}`}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {revoked ? (
              <Badge tone="danger">Removed</Badge>
            ) : (
              <>
                <Badge tone={d.online ? "safe" : "neutral"} dot>
                  {d.online ? "Online" : "Offline"}
                </Badge>
                <Badge tone={d.pushEnabled ? "cyan" : "neutral"}>{d.pushEnabled ? "Push on" : "Push off"}</Badge>
                {d.sendingLocation ? (
                  <Badge tone="cyan">
                    <MapPin className="h-3 w-3" aria-hidden="true" /> Sending location
                  </Badge>
                ) : (
                  <Badge>Not sending location</Badge>
                )}
              </>
            )}
          </div>
        </div>
        {revoked ? (
          <Button size="sm" variant="ghost" aria-label={`Delete ${d.name}`} onClick={() => setConfirm("delete")}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="text-[#ff8399]" aria-label={`Remove ${d.name}`} onClick={() => setConfirm("revoke")}>
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Remove
          </Button>
        )}
      </div>
      {err && <Notice tone="danger" className="mt-2">{err}</Notice>}
      <ConfirmDialog
        open={confirm !== null}
        danger
        title={confirm === "revoke" ? `Remove "${d.name}"?` : `Delete "${d.name}" from the list?`}
        description={
          confirm === "revoke"
            ? "It will stop receiving push notifications immediately. If you don't recognise this device, also use “Sign out everywhere” in Privacy & Settings."
            : "This removes the record of the device."
        }
        confirmLabel={confirm === "revoke" ? "Remove device" : "Delete"}
        loading={busy}
        onConfirm={run}
        onClose={() => setConfirm(null)}
      />
    </li>
  );
}

export function DeviceManager({ initial }: { initial: DeviceView[] }) {
  const router = useRouter();
  const [devices, setDevices] = useState(initial);
  const [localId, setLocalId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setLocalId(getLocalDeviceId());
  }, [devices]);

  async function reload() {
    const res = await api<{ devices: DeviceView[] }>("/api/devices");
    if (res.ok) {
      setDevices(res.data.devices);
      setNow(Date.now());
    }
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
      <ThisDevice devices={devices} onChange={reload} />
      <Card>
        <CardHeader icon={<Laptop className="h-4 w-4" />} title={`Your devices (${devices.filter((d) => d.status === "active").length})`} description="Only devices you registered yourself appear here." />
        {devices.length === 0 ? (
          <EmptyState icon={<Smartphone className="h-6 w-6" />} title="No devices registered" description="Register this device to receive push notifications." />
        ) : (
          <ul className="divide-y divide-white/5" aria-label="Registered devices">
            {devices.map((d) => (
              <DeviceRow key={d.id} d={d} isThis={d.id === localId} now={now} onChange={reload} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
