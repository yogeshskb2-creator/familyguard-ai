"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { usePolling } from "@/hooks/usePolling";
import { api } from "@/lib/api/client";
import { timeAgo } from "@/lib/utils";
import type { SosAlertView } from "./SosPanel";

const POLL_MS = 15_000;

/**
 * App-wide emergency banner: any active SOS from your families is shown on
 * every page until it's resolved. (Push notifications are added in Phase 8.)
 */
export function SosBanner({
  enabled,
  myUid,
}: {
  enabled: boolean;
  myUid: string | null;
}) {
  const pathname = usePathname();
  const [alerts, setAlerts] = useState<SosAlertView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = async () => {
    const res = await api<{ active: SosAlertView[] }>("/api/sos");
    if (res.ok) {
      setAlerts(res.data.active);
      setNow(Date.now());
    }
  };
  usePolling(load, POLL_MS, enabled);

  if (!enabled || pathname === "/sos" || alerts.length === 0) return null;
  const incoming = alerts.filter((a) => a.uid !== myUid);
  const mine = alerts.find((a) => a.uid === myUid);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="mb-4 space-y-2"
      data-testid="sos-banner"
    >
      {incoming.map((a) => {
        const acked = a.acknowledgedBy.some((x) => x.uid === myUid);
        return (
          <div
            key={a.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/50 bg-danger/15 p-4 shadow-glow-danger"
          >
            <ShieldAlert
              className="h-6 w-6 shrink-0 animate-pulse text-danger"
              aria-hidden="true"
            />
            <div className="min-w-[12rem] flex-1">
              <p className="font-semibold text-white">
                SOS from {a.displayName} · {timeAgo(a.createdAt, now)}
              </p>
              <p className="line-clamp-2 text-sm text-[#ffb3c0] sm:truncate">
                {a.message ? `“${a.message}” · ` : ""}
                {a.location ? "Location attached" : "No location"}
                {a.acknowledgedBy.length
                  ? ` · seen by ${a.acknowledgedBy.map((x) => x.displayName).join(", ")}`
                  : ""}
              </p>
            </div>
            <div className="ml-9 flex items-center gap-2 sm:ml-0">
              {!acked && (
                <Button
                  size="sm"
                  variant="danger"
                  loading={busy === a.id}
                  onClick={async () => {
                    setBusy(a.id);
                    await api(`/api/sos/${a.id}/acknowledge`, {
                      method: "POST",
                    });
                    setBusy(null);
                    void load();
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                  I&apos;ve seen this
                </Button>
              )}
              <Link
                href={`/sos?alert=${a.id}`}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
              >
                View
              </Link>
            </div>
          </div>
        );
      })}
      {mine && (
        <Link
          href={`/sos?alert=${mine.id}`}
          className="flex items-center gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-white hover:bg-danger/15"
        >
          <ShieldAlert className="h-5 w-5 text-danger" aria-hidden="true" />
          Your SOS is active · {mine.acknowledgedBy.length} of{" "}
          {mine.recipientCount} have seen it. Tap when you&apos;re safe.
        </Link>
      )}
    </div>
  );
}
