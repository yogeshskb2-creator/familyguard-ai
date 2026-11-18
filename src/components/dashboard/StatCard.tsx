"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const accents = {
  blue: "from-neon-blue/25 text-[#9db5ff]",
  cyan: "from-neon-cyan/20 text-neon-cyan",
  purple: "from-neon-purple/25 text-[#c7a6ff]",
  safe: "from-safe/20 text-safe",
} as const;

export function StatCard({
  label,
  value,
  sub,
  icon,
  accent = "blue",
  index = 0,
}: {
  label: string;
  value: string | number;
  sub?: string;
  /** Rendered icon element, e.g. <Users /> — components can't cross the server/client boundary. */
  icon: ReactNode;
  accent?: keyof typeof accents;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: "easeOut" }}
      className="glass group relative overflow-hidden rounded-2xl p-4 sm:p-5"
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br to-transparent opacity-60 blur-2xl transition-opacity group-hover:opacity-100",
          accents[accent],
        )}
        aria-hidden="true"
      />
      <div className="relative flex items-start justify-between">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <span className={cn("[&>svg]:h-[18px] [&>svg]:w-[18px]", accents[accent].split(" ")[1])} aria-hidden="true">
          {icon}
        </span>
      </div>
      <p className="relative mt-2 font-display text-2xl sm:mt-3 sm:text-3xl font-semibold tracking-tight text-white">{value}</p>
      {sub && <p className="relative mt-1 truncate text-xs text-slate-500">{sub}</p>}
    </motion.div>
  );
}
