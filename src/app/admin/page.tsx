import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Activity, ArrowLeft, Bell, LockKeyhole, MapPin, Radar, ShieldAlert, ShieldCheck, Smartphone, Users } from "lucide-react";
import { HorizontalBars } from "@/components/admin/AdminCharts";
import { LogoMark } from "@/components/brand/Logo";
import { StatCard } from "@/components/dashboard/StatCard";
import { Badge, Card, CardHeader, EmptyState, Notice } from "@/components/ui";
import { getAdminStats } from "@/lib/admin/stats.server";
import { requireViewer } from "@/lib/auth/session";
import { clientIp } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security/events.server";
import { timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  sos: "SOS",
  geofence_enter: "Zone arrival",
  geofence_exit: "Zone departure",
  invitation: "Invitation",
  sharing_started: "Sharing started",
  sharing_stopped: "Sharing stopped",
  sharing_request: "Asked to share",
  device: "Device security",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="glass-strong sticky top-0 z-20 flex h-16 items-center gap-3 border-x-0 border-t-0 px-4 sm:px-6">
        <LogoMark idPrefix="admin" className="h-8 w-8" />
        <span className="font-display font-semibold text-white">FamilyGuard Admin</span>
        <Badge tone="purple">Administrator</Badge>
        <Link href="/dashboard" className="ml-auto inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to app
        </Link>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

/**
 * Admin console: outside the family app on purpose. Requires the Firebase
 * custom claim `admin: true` (scripts/set-admin.mjs) — never a profile field.
 * Shows aggregates only: no locations, names, emails or family content.
 */
export default async function AdminPage() {
  const viewer = await requireViewer("/admin");
  if (viewer.mode === "preview") {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <Notice tone="warn" title="Preview mode">Configure Firebase (see README) to use the admin console.</Notice>
      </div>
    );
  }
  const ip = clientIp(await headers());
  if (!viewer.user.isAdmin) {
    void logSecurityEvent("admin_denied", { uid: viewer.user.uid, ip, route: "/admin" });
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <EmptyState
          icon={<LockKeyhole className="h-6 w-6" />}
          title="Administrator access required"
          description="Your account doesn't have administrator access. This attempt was recorded."
          action={<Link href="/dashboard" className="text-sm font-medium text-neon-cyan hover:underline">Back to the app →</Link>}
        />
      </div>
    );
  }
  void logSecurityEvent("admin_access", { uid: viewer.user.uid, ip, route: "/admin" });
  const s = await getAdminStats();
  const healthTone = { ok: "safe", warn: "warn", fail: "danger" } as const;
  const overall = s.health.some((h) => h.status === "fail") ? "fail" : s.health.some((h) => h.status === "warn") ? "warn" : "ok";

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">System overview</h1>
          <p className="text-sm text-slate-400">Aggregated statistics only — no personal data, locations or family content.</p>
        </div>
        <p className="text-xs text-slate-500">Generated {new Date(s.generatedAt).toLocaleString()}</p>
      </div>

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard index={0} label="Registered users" value={s.users.total} sub={`+${s.users.newLast7d} in the last 7 days`} icon={<Users />} accent="blue" />
        <StatCard index={1} label="Active families" value={`${s.families.active}${s.families.activeCapped ? "+" : ""}`} sub={`of ${s.families.total} (2+ members)`} icon={<Users />} accent="purple" />
        <StatCard index={2} label="Registered devices" value={s.devices.active} sub={`${s.devices.pushEnabled} with push on`} icon={<Smartphone />} accent="cyan" />
        <StatCard index={3} label="Sharing location" value={s.location.sharing} sub={`${s.location.onlineNow} online now`} icon={<MapPin />} accent="safe" />
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard index={4} label="Active SOS alerts" value={s.sos.active} sub={`${s.sos.last30d} in the last 30 days`} icon={<ShieldAlert />} accent={s.sos.active ? "blue" : "safe"} />
        <StatCard index={5} label="Safe zones" value={s.safeZones} sub="across all families" icon={<Radar />} accent="purple" />
        <StatCard index={6} label="Notifications (7 d)" value={s.notifications.last7d} sub="in-app; pushed per user settings" icon={<Bell />} accent="cyan" />
        <StatCard index={7} label="Security events (24 h)" value={s.security.last24h} sub={`${s.security.last7d} in the last 7 days`} icon={<ShieldCheck />} accent="safe" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            icon={<Activity className="h-4 w-4" />}
            title="System health"
            action={<Badge tone={healthTone[overall]} dot>{overall === "ok" ? "All systems normal" : overall === "warn" ? "Needs attention" : "Degraded"}</Badge>}
          />
          <ul className="divide-y divide-white/5" aria-label="Health checks">
            {s.health.map((h) => (
              <li key={h.name} className="flex items-center justify-between gap-3 py-2.5 text-sm" data-testid={`health-${h.name}`}>
                <span className="text-slate-200">{h.name}</span>
                <span className="flex items-center gap-2 text-right">
                  <span className="text-xs text-slate-400">{h.detail}</span>
                  <Badge tone={healthTone[h.status]} dot>{h.status.toUpperCase()}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader icon={<Bell className="h-4 w-4" />} title="Notifications by type" description="Last 7 days" />
          <HorizontalBars label="Notifications by type, last 7 days" color="#22E1FF" data={s.notifications.byKind.map((k) => ({ name: KIND_LABEL[k.kind] ?? k.kind, value: k.count }))} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardHeader icon={<ShieldCheck className="h-4 w-4" />} title="Security events by type" description="Last 7 days" />
          <HorizontalBars label="Security events by type, last 7 days" color="#9B5CFF" data={s.security.byType.map((t) => ({ name: t.label, value: t.count }))} />
        </Card>
        <Card>
          <CardHeader icon={<ShieldAlert className="h-4 w-4" />} title="Recent security events" description="Pseudonymous: hashed user id, truncated IP" />
          {s.security.recent.length === 0 ? (
            <p className="text-sm text-slate-500">No events.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs" aria-label="Recent security events">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Event</th>
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Route</th>
                    <th className="py-2 pr-3 font-medium">Network</th>
                    <th className="py-2 font-medium">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {s.security.recent.map((e, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3">{e.label}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-slate-400">{timeAgo(e.at, s.generatedAt)}</td>
                      <td className="py-2 pr-3 font-mono text-[11px] text-slate-400">{e.route ?? "—"}</td>
                      <td className="py-2 pr-3 font-mono text-[11px] text-slate-400">{e.ipPrefix ?? "—"}</td>
                      <td className="py-2 font-mono text-[11px] text-slate-400">{e.uidHash ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <p className="mt-6 text-xs text-slate-500">
        Admin rights come from a server-set Firebase custom claim and are separate from family roles. Admins cannot view
        anyone&apos;s location, family, contacts or messages.
      </p>
    </Shell>
  );
}
