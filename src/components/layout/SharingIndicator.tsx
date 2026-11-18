"use client";

import Link from "next/link";
import { Loader2, MapPinOff, PauseCircle, Radio, ShieldAlert } from "lucide-react";
import { useSharing, type SharingStatus } from "@/components/location/LocationSharingProvider";
import { cn } from "@/lib/utils";

const VIEW: Record<SharingStatus, { label: string; aria: string; cls: string }> = {
  off: { label: "Not sharing", aria: "Location sharing is off", cls: "bg-white/5 text-slate-400 ring-white/10 hover:text-slate-200" },
  starting: { label: "Starting…", aria: "Location sharing is starting", cls: "bg-neon-cyan/10 text-neon-cyan ring-neon-cyan/40" },
  live: { label: "Sharing live", aria: "Location sharing is on and live from this device", cls: "bg-neon-cyan/10 text-neon-cyan ring-neon-cyan/40 hover:bg-neon-cyan/15" },
  paused: { label: "Sharing · paused here", aria: "Location sharing is on but paused on this device", cls: "bg-warn/10 text-warn ring-warn/40" },
  blocked: { label: "Location blocked", aria: "Location sharing is on but the browser blocked location", cls: "bg-danger/10 text-[#ff8399] ring-danger/40" },
  unavailable: { label: "Location unavailable", aria: "Location sharing is on but unavailable in this browser", cls: "bg-danger/10 text-[#ff8399] ring-danger/40" },
};

/**
 * Always-visible sharing status. Whenever consent is active it is shown in
 * colour — with a live beacon while this device is actually sending — so a
 * user can never be sharing without seeing it.
 */
export function SharingIndicator() {
  const { status } = useSharing();
  const v = VIEW[status];
  return (
    <Link
      href="/settings#location"
      aria-label={`${v.aria}. Manage sharing`}
      data-status={status}
      className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors", v.cls)}
    >
      {status === "live" ? (
        <span className="relative grid h-3.5 w-3.5 place-items-center" aria-hidden="true">
          <span className="absolute h-2.5 w-2.5 animate-pulse-ring rounded-full bg-neon-cyan" />
          <Radio className="relative h-3.5 w-3.5" />
        </span>
      ) : status === "starting" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : status === "paused" ? (
        <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
      ) : status === "off" ? (
        <MapPinOff className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{v.label}</span>
    </Link>
  );
}
