import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "blue" | "cyan" | "purple" | "safe" | "warn" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-white/5 text-slate-300 ring-white/10",
  blue: "bg-neon-blue/10 text-[#9db5ff] ring-neon-blue/30",
  cyan: "bg-neon-cyan/10 text-neon-cyan ring-neon-cyan/30",
  purple: "bg-neon-purple/10 text-[#c7a6ff] ring-neon-purple/30",
  safe: "bg-safe/10 text-safe ring-safe/30",
  warn: "bg-warn/10 text-warn ring-warn/30",
  danger: "bg-danger/10 text-[#ff8399] ring-danger/30",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}
