import { cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  color = "#4F7CFF",
  size = 36,
  status,
  className,
}: {
  name: string;
  color?: string;
  size?: number;
  status?: "online" | "offline" | "sharing";
  className?: string;
}) {
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <span
        className="grid h-full w-full place-items-center rounded-full font-semibold text-white ring-2 ring-ink-900"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}88)`, fontSize: size * 0.36 }}
        aria-hidden="true"
      >
        {initials(name)}
      </span>
      {status && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-ink-900",
            status === "sharing" ? "bg-neon-cyan" : status === "online" ? "bg-safe" : "bg-slate-500",
          )}
          aria-label={status}
          role="img"
        />
      )}
    </span>
  );
}
