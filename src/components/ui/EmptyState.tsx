import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-2xl bg-neon-blue/20 blur-xl" aria-hidden="true" />
        <div className="relative grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-neon-cyan ring-1 ring-white/10">
          {icon}
        </div>
      </div>
      <h3 className="font-display text-base font-semibold text-white">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-slate-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
