import type { ReactNode } from "react";
import { CheckCircle2, Hammer } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

/** Honest placeholder for a route whose functionality lands in a later phase. */
export function PlannedFeature({
  title,
  description,
  phase,
  icon,
  features,
  children,
}: {
  title: string;
  description: string;
  phase: number;
  icon: ReactNode;
  features: string[];
  children?: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} description={description} actions={<Badge tone="purple">Phase {phase}</Badge>} />
      {children}
      <Card className="grid gap-6 md:grid-cols-[1fr_1.2fr] md:items-center">
        <EmptyState
          icon={icon}
          title="Under construction"
          description={`This area is designed and routed; its functionality is implemented in Phase ${phase}.`}
        />
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Hammer className="h-3.5 w-3.5" aria-hidden="true" /> Planned scope
          </p>
          <ul className="space-y-2.5">
            {features.map((f) => (
              <li key={f} className="flex gap-2.5 text-sm text-slate-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-neon-cyan/70" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </>
  );
}
