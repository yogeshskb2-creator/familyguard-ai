import type { ReactNode } from "react";
import { AlertTriangle, Info, ShieldCheck, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "warn" | "danger" | "safe";
const styles: Record<Tone, { box: string; Icon: typeof Info }> = {
  info: { box: "border-neon-blue/30 bg-neon-blue/[0.07] text-[#c3d2ff]", Icon: Info },
  warn: { box: "border-warn/30 bg-warn/[0.07] text-[#ffd79a]", Icon: AlertTriangle },
  danger: { box: "border-danger/30 bg-danger/[0.08] text-[#ffb3c0]", Icon: XCircle },
  safe: { box: "border-safe/30 bg-safe/[0.07] text-[#a8f5d8]", Icon: ShieldCheck },
};

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = styles[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border p-3.5 text-sm", box, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-medium text-white">{title}</p>}
        {children && <div className="text-[13px] leading-relaxed opacity-90">{children}</div>}
      </div>
    </div>
  );
}
