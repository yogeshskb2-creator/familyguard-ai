"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS, isActive } from "./nav";

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="glass-strong fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-y-0 border-l-0 lg:flex">
      <div className="flex h-16 items-center px-5">
        <Link href="/dashboard" aria-label="FamilyGuard AI home">
          <Logo />
        </Link>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                        active ? "text-white" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="sidebar-active"
                          className="absolute inset-0 rounded-xl bg-gradient-to-r from-neon-blue/20 to-neon-purple/10 ring-1 ring-inset ring-neon-blue/30"
                          transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        />
                      )}
                      <Icon className={cn("relative h-[18px] w-[18px]", active && "text-neon-cyan")} aria-hidden="true" />
                      <span className="relative">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="m-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
        <div className="flex items-center gap-2 text-xs font-medium text-white">
          <Lock className="h-3.5 w-3.5 text-safe" aria-hidden="true" />
          Privacy first
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
          Location is shared only when you turn it on, and only with families you choose.
        </p>
      </div>
    </aside>
  );
}
