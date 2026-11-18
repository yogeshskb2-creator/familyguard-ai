import Link from "next/link";
import { ExternalLink, UserRound, X } from "lucide-react";
import { Badge } from "@/components/ui";
import { formatAccuracy, googleMapsLink } from "@/lib/location/geo";
import type { PlacedMember } from "@/lib/location/map";
import { timeAgo } from "@/lib/utils";

/** Member info shown when a marker is selected. */
export function MemberPopup({
  member,
  familyId,
  isMe,
  now,
  onClose,
}: {
  member: PlacedMember;
  familyId: string;
  isMe: boolean;
  now: number;
  onClose?: () => void;
}) {
  const { location: l } = member;
  const online = l.presence === "online";
  return (
    <div className="min-w-[220px] max-w-[260px] text-left" role="dialog" aria-label={`${member.displayName} location details`} data-testid="member-popup">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">
            {member.displayName} {isMe && <span className="font-normal text-slate-400">(you)</span>}
          </p>
          {member.role && <p className="text-[11px] capitalize text-slate-400">{member.role}</p>}
        </div>
        <div className="flex items-center gap-1">
          <Badge tone={online ? "cyan" : "neutral"} dot>
            {online ? "Online" : "Offline"}
          </Badge>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="rounded p-0.5 text-slate-400 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <dl className="mt-2 space-y-0.5 text-xs text-slate-300">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">{online ? "Updated" : "Last seen"}</dt>
          <dd>{timeAgo(l.updatedAt, now)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Accuracy</dt>
          <dd>{formatAccuracy(l.accuracy)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Time</dt>
          <dd>{new Date(l.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</dd>
        </div>
      </dl>
      <div className="mt-3 flex gap-3 text-xs">
        <a
          href={googleMapsLink(l.lat, l.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-neon-cyan hover:underline"
        >
          Directions <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
        <Link href={`/family/${familyId}/members/${member.uid}`} className="inline-flex items-center gap-1 text-slate-300 hover:text-white">
          <UserRound className="h-3 w-3" aria-hidden="true" /> Profile
        </Link>
      </div>
    </div>
  );
}
