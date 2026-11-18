"use client";

import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { niceScale, projectSchematic } from "@/lib/location/map";
import { MemberPin, MePin } from "./MemberPin";
import { MemberPopup } from "./MemberPopup";
import type { FamilyMapViewProps } from "./types";

/**
 * Fallback when Google map tiles are unavailable (no/invalid API key or
 * blocked network). Shows TRUE relative positions and distances — north up,
 * to scale — but no streets. Clearly labelled as such.
 */
/** Pins are drawn upward from their point (~52 px), so keep them clear of the edges even on the compact map. */
const PLOT_PADDING_PCT = 22;

export function SchematicMap({ members, zones, me, myUid, selectedUid, onSelect, familyId, now, compact }: FamilyMapViewProps) {
  const [zoom, setZoom] = useState(1);
  const showMe = me && !members.some((m) => m.uid === myUid);
  const { points, widthMeters } = useMemo(
    () =>
      projectSchematic([
        ...members.map((m) => ({ uid: m.uid, lat: m.location.lat, lng: m.location.lng })),
        ...zones.map((z) => ({ uid: `zone:${z.id}`, lat: z.lat, lng: z.lng })),
        ...(showMe ? [{ uid: "__me", lat: me.lat, lng: me.lng }] : []),
      ], PLOT_PADDING_PCT),
    [members, zones, me, showMe],
  );
  const pos = (uid: string) => {
    const p = points.find((x) => x.uid === uid);
    return p ? { x: 50 + (p.x - 50) * zoom, y: 50 + (p.y - 50) * zoom } : null;
  };
  const visibleWidth = widthMeters / zoom;
  const scale = niceScale(visibleWidth / 4);
  const selected = members.find((m) => m.uid === selectedUid) ?? null;

  return (
    <div
      className="grid-bg relative h-full w-full overflow-hidden bg-ink-900"
      style={{ containerType: "size" }}
      data-testid="schematic-map"
      onClick={() => onSelect(null)}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(79,124,255,0.14),transparent_65%)]" aria-hidden="true" />
      <span className="absolute left-3 top-3 z-10 text-[10px] font-semibold tracking-widest text-slate-500" aria-hidden="true">
        N ↑
      </span>
      {/* Square plotting area (largest square that fits) so N–S and E–W share one scale. */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: "min(100cqw, 100cqh)", aspectRatio: "1" }}
        data-testid="schematic-plot"
      >
        {[30, 60, 90].map((s) => (
          <div
            key={s}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-neon-cyan/10"
            style={{ width: `${s}%`, aspectRatio: "1" }}
            aria-hidden="true"
          />
        ))}

        {zones.map((z) => {
          const p = pos(`zone:${z.id}`);
          if (!p) return null;
          const d = Math.max(3, ((2 * z.radius) / visibleWidth) * 100);
          return (
            <div
              key={z.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#9B5CFF]/80 bg-[#9B5CFF]/10"
              style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${d}%`, aspectRatio: "1", opacity: z.alertsEnabled ? 1 : 0.5 }}
              data-testid={`zone-${z.id}`}
              title={`${z.name} · ${z.radius} m`}
            >
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-[#9B5CFF]/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {z.name}
              </span>
            </div>
          );
        })}
        <ul aria-label="Family members on map">
          {members.map((m) => {
            const p = pos(m.uid);
            if (!p || p.x < -5 || p.x > 105 || p.y < -5 || p.y > 105) return null;
            return (
              <li key={m.uid} className="absolute -translate-x-1/2 -translate-y-full" style={{ left: `${p.x}%`, top: `${p.y}%`, zIndex: m.uid === selectedUid ? 20 : 10 }}>
                <button
                  type="button"
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
          {showMe && pos("__me") && (
            <li className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${pos("__me")!.x}%`, top: `${pos("__me")!.y}%` }}>
              <MePin label={me.kind === "local" ? "You — shown only on this screen, not shared" : "You"} />
            </li>
          )}
        </ul>
        {scale.meters > 0 && (
          <div className="absolute bottom-3 left-3 text-[10px] text-slate-400" data-testid="scale-bar">
            <div className="h-1 border-x border-b border-slate-400" style={{ width: `${(scale.meters / visibleWidth) * 100}%`, minWidth: 24 }} />
            {scale.label}
          </div>
        )}
      </div>

      {!compact && (
        <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-lg bg-ink-850/90 ring-1 ring-white/10">
          <button type="button" aria-label="Zoom in" className="p-2 text-slate-300 hover:bg-white/10" onClick={(e) => (e.stopPropagation(), setZoom((z) => Math.min(z * 1.6, 40)))}>
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Zoom out" className="border-t border-white/10 p-2 text-slate-300 hover:bg-white/10" onClick={(e) => (e.stopPropagation(), setZoom((z) => Math.max(z / 1.6, 0.25)))}>
            <Minus className="h-4 w-4" />
          </button>
        </div>
      )}

      {selected && (
        <div className="glass-strong absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-xl p-3" onClick={(e) => e.stopPropagation()}>
          <MemberPopup member={selected} familyId={familyId} isMe={selected.uid === myUid} now={now} onClose={() => onSelect(null)} />
        </div>
      )}
    </div>
  );
}
