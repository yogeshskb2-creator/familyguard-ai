"use client";

import { useEffect, useRef } from "react";

/** Run `fn` now, every `ms` while the tab is visible, and when it becomes visible again. */
export function usePolling(fn: () => void, ms: number, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const tick = () => document.visibilityState === "visible" && ref.current();
    tick();
    const id = window.setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ms, enabled]);
}
