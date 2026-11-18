"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell } from "lucide-react";
import { usePolling } from "@/hooks/usePolling";
import { api } from "@/lib/api/client";

export function NotificationBell({ enabled }: { enabled: boolean }) {
  const [unread, setUnread] = useState(0);
  usePolling(
    async () => {
      const res = await api<{ unread: number }>("/api/notifications?count=1");
      if (res.ok) setUnread(res.data.unread);
    },
    30_000,
    enabled,
  );
  return (
    <Link
      href="/notifications"
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
    >
      <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
      {unread > 0 && (
        <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white" data-testid="unread-badge">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
