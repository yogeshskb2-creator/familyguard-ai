import { cn } from "@/lib/utils";

interface LogoMarkProps {
  className?: string;
  /** Unique id prefix — needed when several logos render on one page. */
  idPrefix?: string;
}

/** Shield + location pin + three family nodes. */
export function LogoMark({ className, idPrefix = "fg" }: LogoMarkProps) {
  const g = `${idPrefix}-grad`;
  const p = `${idPrefix}-pin`;
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className={cn("h-9 w-9", className)}>
      <defs>
        <linearGradient id={g} x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4F7CFF" />
          <stop offset="0.55" stopColor="#9B5CFF" />
          <stop offset="1" stopColor="#22E1FF" />
        </linearGradient>
        <linearGradient id={p} x1="24" y1="13" x2="24" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#B9F4FF" />
        </linearGradient>
      </defs>
      <path
        d="M24 3.5 7.5 9.6v12.1c0 10.4 7 19.4 16.5 22.8 9.5-3.4 16.5-12.4 16.5-22.8V9.6L24 3.5Z"
        fill={`url(#${g})`}
        fillOpacity="0.16"
        stroke={`url(#${g})`}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M24 13c-4.4 0-7.8 3.3-7.8 7.6 0 5.4 6.2 11.2 7.2 12.1.35.3.85.3 1.2 0 1-.9 7.2-6.7 7.2-12.1 0-4.3-3.4-7.6-7.8-7.6Z"
        fill={`url(#${p})`}
      />
      <circle cx="24" cy="20.6" r="3" fill="#4F7CFF" />
      <circle cx="12.5" cy="15" r="1.7" fill="#22E1FF" />
      <circle cx="35.5" cy="15" r="1.7" fill="#9B5CFF" />
      <circle cx="24" cy="39" r="1.5" fill="#22E1FF" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {!compact && (
        <span className="font-display text-lg font-semibold tracking-tight text-white">
          FamilyGuard <span className="text-gradient">AI</span>
        </span>
      )}
    </span>
  );
}
