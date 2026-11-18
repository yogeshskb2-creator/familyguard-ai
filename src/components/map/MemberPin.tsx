import { cn, initials } from "@/lib/utils";

/** Colour-coded member marker shared by the Google map and the schematic view. */
export function MemberPin({
  uid,
  name,
  color,
  online,
  selected = false,
}: {
  uid: string;
  name: string;
  color: string;
  online: boolean;
  selected?: boolean;
}) {
  return (
    <div className="relative flex flex-col items-center" data-testid={`pin-${uid}`} data-online={online}>
      {online && (
        <span className="absolute top-0 h-10 w-10 animate-pulse-ring rounded-full" style={{ background: color }} aria-hidden="true" />
      )}
      <span
        className={cn(
          "relative grid h-10 w-10 place-items-center rounded-full text-[11px] font-bold text-white ring-2 transition-transform",
          selected ? "scale-110 ring-white" : "ring-white/80",
          !online && "opacity-70 grayscale-[40%]",
        )}
        style={{ background: color, boxShadow: online ? `0 0 18px ${color}` : undefined }}
      >
        {initials(name)}
      </span>
      <span className="-mt-0.5 h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent" style={{ borderTopColor: color }} aria-hidden="true" />
      <span className="sr-only">
        {name} — {online ? "online" : "last known location"}
      </span>
    </div>
  );
}

/** The viewer's own position shown only on this screen (not shared). */
export function MePin({ label }: { label: string }) {
  return (
    <div className="relative grid place-items-center" data-testid="pin-me" title={label}>
      <span className="absolute h-8 w-8 animate-pulse-ring rounded-full bg-[#4F7CFF]" aria-hidden="true" />
      <span className="relative h-4 w-4 rounded-full bg-[#4F7CFF] ring-[3px] ring-white" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
