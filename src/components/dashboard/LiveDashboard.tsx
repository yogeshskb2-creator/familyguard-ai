import Link from "next/link";
import { Activity, Bot, DoorOpen, MailOpen, MapPin, MapPinned, Radar, Radio, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { LiveMap } from "@/components/map/LiveMap";
import { Avatar, Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import type { FamilyView, InvitationView } from "@/lib/families/service.server";
import { ROLE_LABEL } from "@/lib/families/permissions";
import type { FamilyEvent } from "@/lib/families/events.server";
import { timeAgo } from "@/lib/utils";

const EVENT_ICON: Record<FamilyEvent["type"], React.ReactNode> = {
  sos: <ShieldAlert className="h-3.5 w-3.5 text-danger" />,
  sos_resolved: <ShieldCheck className="h-3.5 w-3.5 text-safe" />,
  sos_cancelled: <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />,
  geofence_enter: <MapPin className="h-3.5 w-3.5 text-safe" />,
  geofence_exit: <DoorOpen className="h-3.5 w-3.5 text-warn" />,
};

function eventText(e: FamilyEvent): string {
  switch (e.type) {
    case "sos":
      return `${e.displayName} sent an SOS`;
    case "sos_resolved":
      return `${e.displayName}'s SOS was resolved`;
    case "sos_cancelled":
      return `${e.displayName} cancelled an SOS (false alarm)`;
    case "geofence_enter":
      return `${e.displayName} arrived at ${e.zoneName}`;
    case "geofence_exit":
      return `${e.displayName} left ${e.zoneName}`;
  }
}

/** Dashboard for signed-in users. Shows only real data; later-phase widgets show honest empty states. */
export function LiveDashboard({
  name,
  families,
  invitations,
  sharing,
  myUid,
  openSos,
  zoneCount,
  events,
}: {
  myUid: string;
  openSos: number;
  zoneCount: number;
  events: (FamilyEvent & { familyId: string })[];
  name: string;
  families: FamilyView[];
  invitations: InvitationView[];
  sharing: { sharing: number; online: number };
}) {
  const people = new Map(families.flatMap((f) => f.members.map((m) => [m.uid, m] as const)));
  const now = Date.now();

  return (
    <>
      <PageHeader
        title={`Hi, ${name.split(" ")[0]}`}
        description="Everything your family has chosen to share with you, in one place."
        actions={
          <>
            <Link href="/assistant" className="glass inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white hover:bg-white/10">
              <Bot className="h-4 w-4 text-neon-cyan" aria-hidden="true" /> Ask AI
            </Link>
            <Link href="/sos" className="inline-flex h-10 items-center gap-2 rounded-xl bg-danger px-4 text-sm font-semibold text-white shadow-glow-danger hover:brightness-110">
              <ShieldAlert className="h-4 w-4" aria-hidden="true" /> SOS
            </Link>
          </>
        }
      />

      {invitations.length > 0 && (
        <Link href="/family" className="gradient-border glass mb-4 flex items-center gap-3 rounded-2xl p-4 hover:bg-white/[0.06]">
          <MailOpen className="h-5 w-5 text-neon-cyan" aria-hidden="true" />
          <span className="text-sm text-white">
            You have {invitations.length} family invitation{invitations.length > 1 ? "s" : ""} waiting.
          </span>
          <span className="ml-auto text-xs font-medium text-neon-cyan">Review →</span>
        </Link>
      )}

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard index={0} label="Family members" value={people.size} sub={`${families.length} family group${families.length === 1 ? "" : "s"}`} icon={<Users />} accent="blue" />
        <StatCard
          index={1}
          label="Sharing with you"
          value={sharing.sharing}
          sub={sharing.sharing ? `${sharing.online} online now` : "Nobody yet"}
          icon={<Radio />}
          accent="cyan"
        />
        <StatCard index={2} label="Safe zones" value={zoneCount} sub={zoneCount ? "Arrival & departure alerts" : "None yet"} icon={<Radar />} accent="purple" />
        <StatCard
          index={3}
          label="Open SOS alerts"
          value={openSos}
          sub={openSos ? "Needs attention" : "All clear"}
          icon={openSos ? <ShieldAlert /> : <ShieldCheck />}
          accent={openSos ? "blue" : "safe"}
        />
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader icon={<MapPinned className="h-4 w-4" />} title="Live family map" description="Only members who choose to share appear here." />
          {families[0] ? (
            <LiveMap compact families={families.map((f) => ({ id: f.id, name: f.name }))} myUid={myUid} />
          ) : (
            <EmptyState
              icon={<MapPinned className="h-6 w-6" />}
              title="No family yet"
              description="Create or join a family to see members who share their location with you."
            />
          )}
        </Card>
        <Card>
          <CardHeader icon={<Users className="h-4 w-4" />} title="Your families" />
          {families.length === 0 ? (
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title="No family yet"
              description="Create a family and invite the people you trust."
              action={<Link href="/family" className="text-sm font-medium text-neon-cyan hover:underline">Go to Family →</Link>}
            />
          ) : (
            <ul className="space-y-3">
              {families.map((f) => (
                <li key={f.id}>
                  <Link href={`/family/${f.id}`} className="block rounded-xl px-2 py-2 hover:bg-white/[0.03]">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{f.name}</span>
                      <Badge>{ROLE_LABEL[f.myRole]}</Badge>
                    </div>
                    <div className="mt-2 flex -space-x-2">
                      {f.members.slice(0, 7).map((m) => (
                        <Avatar key={m.uid} name={m.displayName} color={m.color} size={28} />
                      ))}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader icon={<Activity className="h-4 w-4" />} title="Recent safety activity" description="SOS alerts and safe-zone arrivals/departures across your families" />
        {events.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-6 w-6" />}
            title="No activity yet"
            description="SOS alerts and safe-zone arrivals and departures will appear here as they happen."
          />
        ) : (
          <ol className="relative space-y-4 border-l border-white/10 pl-5" aria-label="Recent safety activity">
            {events.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[29px] grid h-6 w-6 place-items-center rounded-full bg-ink-850 ring-1 ring-white/10" aria-hidden="true">
                  {EVENT_ICON[e.type]}
                </span>
                <p className="text-sm text-slate-200">{eventText(e)}</p>
                <p className="text-xs text-slate-500">
                  {timeAgo(e.at, now)} · {families.find((f) => f.id === e.familyId)?.name}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
