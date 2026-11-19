"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { Minus, Plus } from "lucide-react";
import { niceScale } from "@/lib/location/map";
import {
  TILE_SIZE,
  fitView,
  metersPerPixel,
  panBy,
  toScreen,
  visibleTiles,
  zoomAround,
  type MapView,
  type Size,
} from "@/lib/location/tiles";
import { MemberPin, MePin } from "./MemberPin";
import { MemberPopup } from "./MemberPopup";
import type { FamilyMapViewProps } from "./types";

/**
 * Street map from OpenStreetMap tiles, used when no Google Maps key is
 * configured. No API key, no billing and no extra library: tiles are plain
 * images positioned with Web-Mercator maths (src/lib/location/tiles.ts).
 * OpenStreetMap's tile policy requires the visible attribution below.
 */

export const OSM_LOAD_TIMEOUT_MS = 15_000;
/** Give up on tiles after this many failures with none loaded (blocked network/CSP). */
const MAX_TILE_ERRORS = 6;
const ZONE_COLOR = "#9B5CFF";
/** Turns the light OSM style dark to match the app (tiles only; markers stay true-colour). */
const DARK_TILES = "invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9) saturate(0.6)";
const FALLBACK_SIZE: Size = { width: 600, height: 400 };

function useElementSize(ref: RefObject<HTMLDivElement | null>): Size {
  const [size, setSize] = useState<Size>(FALLBACK_SIZE);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize((s) => (s.width === r.width && s.height === r.height ? s : { width: r.width, height: r.height }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export function OsmFamilyMap(props: FamilyMapViewProps & { onFailure: () => void }) {
  const { members, zones, me, myUid, selectedUid, onSelect, familyId, now, compact, fitToken, meToken, onFailure } = props;
  const ref = useRef<HTMLDivElement>(null);
  const size = useElementSize(ref);
  const allPoints = useMemo(() => [...members.map((m) => m.location), ...zones, ...(me ? [me] : [])], [members, zones, me]);
  const [view, setView] = useState<MapView>(() => fitView(allPoints, size));
  const interactive = !compact;
  const showMe = me && !members.some((m) => m.uid === myUid);
  const selected = members.find((m) => m.uid === selectedUid) ?? null;

  // ── Camera: same behaviour as the Google map ──
  const fittedOnce = useRef(false);
  /** Set once the user pans or zooms, so a resize (e.g. mobile address bar) doesn't throw their view away. */
  const userMoved = useRef(false);
  useEffect(() => {
    if (!fittedOnce.current && allPoints.length === 0) return;
    fittedOnce.current = true;
    userMoved.current = false;
    setView(fitView(allPoints, size));
    // Re-fit on first data and on "Fit everyone".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken, members.length > 0, zones.length > 0]);

  useEffect(() => {
    if (fittedOnce.current && !userMoved.current) setView(fitView(allPoints, size));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height]);

  useEffect(() => {
    if (me && meToken > 0) userMoved.current = true;
    if (me && meToken > 0) setView((v) => ({ center: { lat: me.lat, lng: me.lng }, zoom: Math.max(v.zoom, 15) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meToken]);

  useEffect(() => {
    const m = members.find((x) => x.uid === selectedUid);
    if (m) userMoved.current = true;
    if (m) setView((v) => ({ ...v, center: { lat: m.location.lat, lng: m.location.lng } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUid]);

  // ── Tile watchdog: if no tile ever loads, hand over to the schematic view ──
  const loaded = useRef(0);
  const errors = useRef(0);
  const failed = useRef(false);
  const fail = () => {
    if (failed.current) return;
    failed.current = true;
    onFailure();
  };
  useEffect(() => {
    const t = window.setTimeout(() => loaded.current === 0 && fail(), OSM_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Wheel zoom (native listener: React's is passive and can't stop page scroll) ──
  useEffect(() => {
    const el = ref.current;
    if (!el || !interactive) return;
    let acc = 0;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      const t = performance.now();
      if (Math.abs(acc) < 60 || t - last < 180) return;
      last = t;
      const r = el.getBoundingClientRect();
      const dir = acc > 0 ? -1 : 1;
      acc = 0;
      userMoved.current = true;
      setView((v) => zoomAround(v, v.zoom + dir, e.clientX - r.left, e.clientY - r.top, size));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [interactive, size]);

  // ── Drag to pan, pinch to zoom ──
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchBase = useRef<number | null>(null);
  const dragged = useRef(false);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive || (e.pointerType === "mouse" && e.button !== 0)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchBase.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;

    if (pointers.current.size >= 2) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const base = pinchBase.current ?? dist;
      const step = dist / base >= 1.5 ? 1 : dist / base <= 1 / 1.5 ? -1 : 0;
      if (step !== 0) {
        dragged.current = true;
        userMoved.current = true;
        pinchBase.current = dist;
        const mid = local({ clientX: (a!.x + b!.x) / 2, clientY: (a!.y + b!.y) / 2 });
        setView((v) => zoomAround(v, v.zoom + step, mid.x, mid.y, size));
      }
      return;
    }

    // Ignore tiny jitter so a tap still counts as a click.
    if (!dragged.current && Math.hypot(dx, dy) < 4) return;
    if (!dragged.current) {
      dragged.current = true;
      userMoved.current = true;
      ref.current?.setPointerCapture?.(e.pointerId);
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setView((v) => panBy(v, -dx, -dy));
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchBase.current = null;
    if (ref.current?.hasPointerCapture?.(e.pointerId)) ref.current.releasePointerCapture(e.pointerId);
  }

  const tiles = visibleTiles(view, size);
  const mpp = metersPerPixel(view.center.lat, view.zoom);
  const scale = niceScale((mpp * size.width) / 4);
  const onScreen = (p: { x: number; y: number }, margin = 60) =>
    p.x > -margin && p.x < size.width + margin && p.y > -margin && p.y < size.height + margin;

  const zoomBy = (d: number) => {
    userMoved.current = true;
    setView((v) => zoomAround(v, v.zoom + d, size.width / 2, size.height / 2, size));
  };

  return (
    <div
      ref={ref}
      className="relative h-full w-full select-none overflow-hidden bg-[#10141f]"
      style={{ touchAction: interactive ? "none" : "auto", cursor: interactive ? "grab" : "default" }}
      data-testid="osm-map"
      role="region"
      aria-label="Family map"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClick={() => {
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        onSelect(null);
      }}
      onDoubleClick={(e) => {
        if (!interactive) return;
        const p = local(e);
        userMoved.current = true;
        setView((v) => zoomAround(v, v.zoom + 1, p.x, p.y, size));
      }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ filter: DARK_TILES }} aria-hidden="true">
        {tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element -- map tiles: plain, uncached-by-Next images by design
          <img
            key={t.key}
            src={t.url}
            alt=""
            width={TILE_SIZE}
            height={TILE_SIZE}
            draggable={false}
            decoding="async"
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute max-w-none"
            style={{ left: t.left, top: t.top, width: TILE_SIZE, height: TILE_SIZE }}
            onLoad={() => {
              loaded.current++;
            }}
            onError={() => {
              errors.current++;
              if (loaded.current === 0 && errors.current >= MAX_TILE_ERRORS) fail();
            }}
          />
        ))}
      </div>

      {/* Safe zones, to scale */}
      {zones.map((z) => {
        const p = toScreen(z, view, size);
        const r = Math.max(6, z.radius / mpp);
        if (!onScreen(p, r + 40)) return null;
        return (
          <div
            key={z.id}
            className="pointer-events-none absolute rounded-full border-2"
            style={{
              left: p.x - r,
              top: p.y - r,
              width: 2 * r,
              height: 2 * r,
              borderColor: ZONE_COLOR,
              background: `${ZONE_COLOR}1A`,
              opacity: z.alertsEnabled ? 1 : 0.5,
            }}
            title={`${z.name} · ${z.radius} m`}
          >
            <span
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-[#9B5CFF]/80 px-1.5 py-0.5 text-[10px] font-semibold text-white"
              data-testid={`zone-${z.id}`}
            >
              {z.name}
            </span>
          </div>
        );
      })}

      {/* Accuracy circles */}
      {[...members.map((m) => ({ key: m.uid, c: m.location, color: m.color })), ...(showMe ? [{ key: "__me", c: me!, color: "#4F7CFF" }] : [])].map(
        ({ key, c, color }) => {
          const p = toScreen(c, view, size);
          const r = Math.min(c.accuracy, 5_000) / mpp;
          if (r < 8 || !onScreen(p, r)) return null;
          return (
            <div
              key={`acc-${key}`}
              className="pointer-events-none absolute rounded-full border"
              style={{ left: p.x - r, top: p.y - r, width: 2 * r, height: 2 * r, borderColor: `${color}99`, background: `${color}1F` }}
              aria-hidden="true"
            />
          );
        },
      )}

      <ul aria-label="Family members on map">
        {members.map((m) => {
          const p = toScreen(m.location, view, size);
          if (!onScreen(p)) return null;
          return (
            <li
              key={m.uid}
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{ left: p.x, top: p.y, zIndex: m.uid === selectedUid ? 20 : m.location.presence === "online" ? 12 : 10 }}
            >
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(m.uid);
                }}
                aria-label={`Show ${m.displayName}`}
              >
                <MemberPin uid={m.uid} name={m.displayName} color={m.color} online={m.location.presence === "online"} selected={m.uid === selectedUid} />
              </button>
            </li>
          );
        })}
        {showMe &&
          (() => {
            const p = toScreen(me!, view, size);
            return onScreen(p) ? (
              <li className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: p.x, top: p.y, zIndex: 15 }}>
                <MePin label={me!.kind === "local" ? "You — shown only on this screen, not shared" : "You"} />
              </li>
            ) : null;
          })()}
      </ul>

      {scale.meters > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-3 text-[10px] text-slate-200 [text-shadow:0_1px_2px_#000]" data-testid="scale-bar">
          <div className="h-1 border-x border-b border-slate-200" style={{ width: scale.meters / mpp }} />
          {scale.label}
        </div>
      )}

      {interactive && (
        <div className="absolute bottom-7 right-3 flex flex-col overflow-hidden rounded-lg bg-ink-850/90 ring-1 ring-white/10">
          <button
            type="button"
            aria-label="Zoom in"
            className="p-2 text-slate-300 hover:bg-white/10"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => (e.stopPropagation(), zoomBy(1))}
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            className="border-t border-white/10 p-2 text-slate-300 hover:bg-white/10"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => (e.stopPropagation(), zoomBy(-1))}
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1.5 py-0.5 text-[10px] text-slate-300" onPointerDown={(e) => e.stopPropagation()}>
        ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline" onClick={(e) => e.stopPropagation()}>
          OpenStreetMap
        </a>{" "}
        contributors
      </div>

      {selected && (
        <div className="glass-strong absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-xl p-3" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <MemberPopup member={selected} familyId={familyId} isMe={selected.uid === myUid} now={now} onClose={() => onSelect(null)} />
        </div>
      )}
    </div>
  );
}
