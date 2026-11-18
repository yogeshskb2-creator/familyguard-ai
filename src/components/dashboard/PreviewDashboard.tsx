import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BatteryMedium,
  Bot,
  DoorOpen,
  MapPin,
  MapPinned,
  Radar,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { ActivityChart } from "@/components/dashboard/ActivityChart";
import { MapPreview } from "@/components/dashboard/MapPreview";
import { StatCard } from "@/components/dashboard/StatCard";
import { SetupBanner } from "@/components/layout/SetupBanner";
import { Avatar, Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { previewActivity, previewEvents, previewMembers } from "@/lib/preview-data";
import { timeAgo } from "@/lib/utils";

const MIN = 60_000;
const PIN_POSITIONS = [
  { x: 38, y: 42 },
  { x: 68, y: 30 },
  { x: 58, y: 70 },
];

const eventIcon = {
  geofence_enter: <MapPin className="h-3.5 w-3.5 text-safe" aria-hidden="true" />,
  geofence_exit: <DoorOpen className="h-3.5 w-3.5 text-warn" aria-hidden="true" />,
  sharing_started: <Radio className="h-3.5 w-3.5 text-neon-cyan" aria-hidden="true" />,
  sharing_stopped: <Radio className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />,
} as const;

/** Sample-data dashboard shown only while Firebase is not configured. */
export function PreviewDashboard() {
  const now = Date.now();
  const members = previewMembers;
  const sharing = members.filter((m) => m.sharing);
  const pins = sharing.map((m, i) => ({ uid: m.uid, name: m.name, color: m.color, ...PIN_POSITIONS[i % PIN_POSITIONS.length]! }));

  return (
    <>
      <PageHeader
        title="Family safety overview"
        description="Everything your family has chosen to share with you, in one place."
        actions={
          <>
            <Link
              href="/assistant"
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white glass hover:bg-white/10"
            >
              <Bot className="h-4 w-4 text-neon-cyan" aria-hidden="true" /> Ask AI
            </Link>
            <Link
              href="/sos"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-danger px-4 text-sm font-semibold text-white shadow-glow-danger hover:brightness-110"
            >
              <ShieldAlert className="h-4 w-4" aria-hidden="true" /> SOS
            </Link>
          </>
        }
      />

      <SetupBanner />

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard index={0} label="Family members" value={members.length} sub="1 family group" icon={<Users />} accent="blue" />
        <StatCard
          index={1}
          label="Sharing location"
          value={`${sharing.length}/${members.length}`}
          sub="With their consent"
          icon={<Radio />}
          accent="cyan"
        />
        <StatCard index={2} label="Safe zones" value={3} sub="Home · School · Office" icon={<Radar />} accent="purple" />
        <StatCard index={3} label="Open SOS alerts" value={0} sub="All clear" icon={<ShieldCheck />} accent="safe" />
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={<MapPinned className="h-4 w-4" />}
            title="Live family map"
            description="Only members who are currently sharing appear here."
            action={
              <Link href="/map" className="inline-flex items-center gap-1 text-xs font-medium text-neon-cyan hover:underline">
                Open map <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            }
          />
          <MapPreview pins={pins} />
        </Card>

        <Card>
          <CardHeader icon={<Users className="h-4 w-4" />} title="Members" description="Sharing status & last update" />
          <ul className="space-y-1">
            {members.map((m) => (
              <li key={m.uid} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-white/[0.03]">
                <Avatar name={m.name} color={m.color} status={m.sharing ? "sharing" : "offline"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{m.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {m.sharing ? `${m.place} · ${timeAgo(now - m.updatedMinAgo * MIN, now)}` : "Location sharing off"}
                  </p>
                </div>
                {m.sharing ? (
                  <span className="flex items-center gap-1 text-[11px] text-slate-400">
                    <BatteryMedium className="h-3.5 w-3.5" aria-hidden="true" />
                    {m.battery}%
                  </span>
                ) : (
                  <Badge>Paused</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={<Activity className="h-4 w-4" />}
            title="Safety activity"
            description="Location updates and safe-zone events, last 7 days"
            action={
              <div className="hidden items-center gap-3 text-[11px] text-slate-400 sm:flex">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-neon-blue" /> Updates
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-neon-cyan" /> Zone events
                </span>
              </div>
            }
          />
          <ActivityChart data={previewActivity} />
        </Card>

        <Card>
          <CardHeader icon={<Radar className="h-4 w-4" />} title="Recent events" />
          <ol className="relative space-y-4 border-l border-white/10 pl-5">
            {previewEvents.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[29px] grid h-6 w-6 place-items-center rounded-full bg-ink-850 ring-1 ring-white/10">
                  {eventIcon[e.kind]}
                </span>
                <p className="text-sm text-slate-200">{e.text}</p>
                <p className="text-xs text-slate-500">{timeAgo(e.at, now)}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
