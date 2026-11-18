"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, CheckCheck, DoorOpen, MapPin, MapPinOff, Radio, ShieldAlert, Smartphone, UserPlus } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";
import { api } from "@/lib/api/client";
import { cn, timeAgo } from "@/lib/utils";

export interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  priority: string;
  createdAt: number;
}

const ICON: Record<string, React.ReactNode> = {
  sos: <ShieldAlert className="h-4 w-4 text-danger" />,
  geofence_enter: <MapPin className="h-4 w-4 text-safe" />,
  geofence_exit: <DoorOpen className="h-4 w-4 text-warn" />,
  invitation: <UserPlus className="h-4 w-4 text-neon-cyan" />,
  sharing_started: <Radio className="h-4 w-4 text-neon-cyan" />,
  sharing_stopped: <MapPinOff className="h-4 w-4 text-slate-400" />,
  device: <Smartphone className="h-4 w-4 text-[#c7a6ff]" />,
};

export function NotificationList({ initial, now }: { initial: NotificationView[]; now: number }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const unread = items.filter((i) => !i.read).length;

  async function open(n: NotificationView) {
    if (!n.read) {
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      await api("/api/notifications/read", { method: "POST", body: { ids: [n.id] } });
    }
    if (n.link) router.push(n.link);
  }

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState icon={<Bell className="h-6 w-6" />} title="You're all caught up" description="SOS alerts, safe-zone arrivals and family updates appear here." />
      </Card>
    );
  }

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center justify-between px-2">
        <p className="text-sm text-slate-400">{unread} unread</p>
        <Button
          size="sm"
          variant="ghost"
          disabled={unread === 0}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await api("/api/notifications/read", { method: "POST", body: { ids: "all" } });
            setItems((xs) => xs.map((x) => ({ ...x, read: true })));
            setBusy(false);
          }}
        >
          <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Mark all read
        </Button>
      </div>
      <ul aria-label="Notifications" className="divide-y divide-white/5">
        {items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => open(n)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left hover:bg-white/[0.04]",
                n.priority === "critical" && !n.read && "bg-danger/[0.08]",
              )}
            >
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5" aria-hidden="true">
                {ICON[n.kind] ?? <Bell className="h-4 w-4 text-slate-400" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm", n.read ? "text-slate-300" : "font-semibold text-white")}>{n.title}</span>
                <span className="block text-xs text-slate-500">{n.body}</span>
              </span>
              <span className="shrink-0 text-[11px] text-slate-500">{timeAgo(n.createdAt, now)}</span>
              {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-neon-cyan" aria-label="unread" />}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
