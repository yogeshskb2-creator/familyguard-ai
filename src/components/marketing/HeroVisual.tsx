"use client";

import { motion } from "framer-motion";
import { Radio, ShieldCheck } from "lucide-react";
import { MapPreview } from "@/components/dashboard/MapPreview";

const pins = [
  { uid: "a", name: "Mom", color: "#4F7CFF", x: 34, y: 40 },
  { uid: "b", name: "Dad", color: "#9B5CFF", x: 70, y: 32 },
  { uid: "c", name: "Ria", color: "#22E1FF", x: 56, y: 72 },
];

export function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -inset-8 rounded-[2rem] bg-gradient-to-tr from-neon-blue/25 via-neon-purple/20 to-neon-cyan/20 blur-3xl" aria-hidden="true" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}
        className="glass gradient-border relative rounded-3xl p-4"
      >
        <MapPreview pins={pins} />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.6 }}
        className="glass-strong absolute -left-4 bottom-8 hidden items-center gap-3 rounded-2xl px-4 py-3 sm:flex animate-float"
      >
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-safe/15 text-safe">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-medium text-white">Ria arrived at School</p>
          <p className="text-[11px] text-slate-400">Safe zone · 2 min ago</p>
        </div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.8 }}
        className="glass-strong absolute -right-3 top-6 hidden items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium text-neon-cyan sm:flex"
      >
        <Radio className="h-3.5 w-3.5" aria-hidden="true" /> Sharing with consent
      </motion.div>
    </div>
  );
}
