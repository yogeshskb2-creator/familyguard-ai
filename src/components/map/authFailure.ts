"use client";

/**
 * Google Maps signals an invalid / unauthorised API key ONLY by calling the
 * global `window.gm_authFailure()` (documented Maps JS API hook). The React
 * wrapper doesn't install it, so a bad key would leave users with a broken
 * map. We install it at module load — before the Maps script can fire it —
 * and remember a failure that happens before any component subscribes.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
let failed = false;

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

if (typeof window !== "undefined") {
  const previous = window.gm_authFailure;
  window.gm_authFailure = () => {
    failed = true;
    listeners.forEach((l) => l());
    previous?.();
  };
}

/** Subscribe to Maps auth failures. Fires immediately if one already happened. */
export function onMapsAuthFailure(listener: Listener): () => void {
  listeners.add(listener);
  if (failed) listener();
  return () => listeners.delete(listener);
}

/** Test helper. */
export function __resetMapsAuthFailure() {
  failed = false;
  listeners.clear();
}
