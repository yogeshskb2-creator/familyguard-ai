"use client";

import { motion } from "framer-motion";
import { initials } from "@/lib/utils";

export interface MapPin {
  uid: string;
  name: string;
  color: string;
  /** Position in percent of the preview canvas. */
  x: number;
  y: number;
}

/**
 * Stylised radar preview used on the dashboard. The interactive Google Map
 * lives on /map (Phase 5); this keeps the dashboard light-weight.
 */
export function MapPreview({ pins }: { pins: MapPin[] }) {
  return (
    <div className="grid-bg relative h-64 overflow-hidden rounded-xl bg-ink-900/80 ring-1 ring-white/5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(79,124,255,0.18),transparent_60%)]" aria-hidden="true" />
      {[30, 55, 80].map((s) => (
        <div
          key={s}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-neon-cyan/10"
          style={{ width: `${s}%`, aspectRatio: "1" }}
          aria-hidden="true"
        />
      ))}
      <motion.div
        className="absolute left-1/2 top-1/2 h-[45%] w-[45%] origin-top-left bg-[conic-gradient(from_0deg,rgba(34,225,255,0.22),transparent_25%)]"
        style={{ borderTopLeftRadius: 0 }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
        aria-hidden="true"
      />
      <ul aria-label="Family members on map">
        {pins.map((p, i) => (
          <motion.li
            key={p.uid}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 + i * 0.1, type: "spring" }}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            <span className="absolute inset-0 animate-pulse-ring rounded-full" style={{ background: p.color }} aria-hidden="true" />
            <span
              className="relative grid h-8 w-8 place-items-center rounded-full text-[10px] font-bold text-white ring-2 ring-white/80"
              style={{ background: p.color, boxShadow: `0 0 18px ${p.color}` }}
              title={p.name}
            >
              {initials(p.name)}
            </span>
            <span className="sr-only">{p.name}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
