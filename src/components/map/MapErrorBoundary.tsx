"use client";

import { Component, type ReactNode } from "react";

/**
 * Contains failures inside the third-party Google Maps subtree (e.g. Google's
 * marker code throwing while the map is torn down after a key rejection).
 * It must stay mounted ABOVE both the Google map and the fallback: React
 * reports errors thrown while a subtree unmounts to the nearest boundary
 * that is still mounted.
 * Without this, one map error would replace the WHOLE page with the error
 * screen; with it, only the map degrades to the schematic fallback.
 */
export class MapErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[FamilyGuard] Google map failed; showing schematic view instead.", error);
    this.props.onError();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
