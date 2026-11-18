"use client";

import { useEffect, useRef, useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  ColorScheme,
  InfoWindow,
  Map as GMap,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { boundsOf, initialView, type PlacedMember } from "@/lib/location/map";
import { onMapsAuthFailure } from "./authFailure";
import { MemberPin, MePin } from "./MemberPin";
import { MemberPopup } from "./MemberPopup";
import type { FamilyMapViewProps } from "./types";

export const MAP_LOAD_TIMEOUT_MS = 15_000;

/** Accuracy radius around a marker (Google has no React wrapper for circles). */
function AccuracyCircles({ members, me }: { members: PlacedMember[]; me: FamilyMapViewProps["me"] }) {
  const map = useMap();
  const maps = useMapsLibrary("maps");
  useEffect(() => {
    if (!map || !maps) return;
    const circles = [
      ...members.map((m) => ({ c: m.location, color: m.color })),
      ...(me ? [{ c: me, color: "#4F7CFF" }] : []),
    ].map(
      ({ c, color }) =>
        new maps.Circle({
          map,
          center: { lat: c.lat, lng: c.lng },
          radius: Math.min(c.accuracy, 5_000),
          strokeColor: color,
          strokeOpacity: 0.6,
          strokeWeight: 1,
          fillColor: color,
          fillOpacity: 0.12,
          clickable: false,
        }),
    );
    return () => circles.forEach((c) => c.setMap(null));
  }, [map, maps, members, me]);
  return null;
}

const ZONE_COLOR = "#9B5CFF";

/** Safe zones as shaded circles with a name label. */
function ZoneCircles({ zones }: { zones: FamilyMapViewProps["zones"] }) {
  const map = useMap();
  const maps = useMapsLibrary("maps");
  useEffect(() => {
    if (!map || !maps) return;
    const circles = zones.map(
      (z) =>
        new maps.Circle({
          map,
          center: { lat: z.lat, lng: z.lng },
          radius: z.radius,
          strokeColor: ZONE_COLOR,
          strokeOpacity: z.alertsEnabled ? 0.9 : 0.4,
          strokeWeight: 2,
          fillColor: ZONE_COLOR,
          fillOpacity: 0.08,
          clickable: false,
        }),
    );
    return () => circles.forEach((c) => c.setMap(null));
  }, [map, maps, zones]);
  return (
    <>
      {zones.map((z) => (
        <AdvancedMarker key={z.id} position={{ lat: z.lat, lng: z.lng }} title={z.name} zIndex={1}>
          <span className="rounded-md bg-[#9B5CFF]/80 px-1.5 py-0.5 text-[10px] font-semibold text-white" data-testid={`zone-${z.id}`}>
            {z.name}
          </span>
        </AdvancedMarker>
      ))}
    </>
  );
}

/** Fit / pan / focus behaviour, driven by tokens from the parent. */
function Camera({ members, zones, me, selectedUid, fitToken, meToken }: Pick<FamilyMapViewProps, "members" | "zones" | "me" | "selectedUid" | "fitToken" | "meToken">) {
  const map = useMap();
  const fittedOnce = useRef(false);

  const fit = () => {
    if (!map) return;
    const pts = [...members.map((m) => m.location), ...zones, ...(me ? [me] : [])];
    const b = boundsOf(pts);
    if (!b) return;
    if (pts.length === 1) {
      map.panTo(pts[0]!);
      map.setZoom(15);
    } else {
      map.fitBounds(b, 64);
    }
  };

  // First data arrival + explicit "Fit everyone".
  useEffect(() => {
    if (!map) return;
    if (!fittedOnce.current && members.length === 0 && zones.length === 0 && !me) return;
    fittedOnce.current = true;
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitToken, members.length > 0, zones.length > 0]);

  useEffect(() => {
    if (map && me && meToken > 0) {
      map.panTo(me);
      map.setZoom(Math.max(map.getZoom() ?? 15, 15));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, meToken]);

  useEffect(() => {
    const m = members.find((x) => x.uid === selectedUid);
    if (map && m) map.panTo(m.location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedUid]);

  return null;
}

/** Reports when Google rejects the key (invalid, restricted, billing off…) or the script fails to load. */
function LoadWatcher({ onFailure }: { onFailure: (reason: "auth" | "load") => void }) {
  const status = useApiLoadingStatus();
  useEffect(() => {
    if (status === "AUTH_FAILURE") onFailure("auth");
    if (status === "FAILED") onFailure("load");
  }, [status, onFailure]);
  // Google's own hook — the reliable signal for an invalid key.
  useEffect(() => onMapsAuthFailure(() => onFailure("auth")), [onFailure]);
  return null;
}

export function GoogleFamilyMap(
  props: FamilyMapViewProps & { apiKey: string; mapId: string; onFailure: (reason: "auth" | "load") => void },
) {
  const { apiKey, mapId, members, zones, me, myUid, selectedUid, onSelect, familyId, now, compact, onFailure } = props;
  const selected = members.find((m) => m.uid === selectedUid) ?? null;
  const view = initialView([...members.map((m) => m.location), ...zones, ...(me ? [me] : [])]);
  const showMe = me && !members.some((m) => m.uid === myUid);

  // Watchdog: if tiles never load (blocked network, key check that never
  // completes), don't leave the user staring at a blank map.
  const [tilesLoaded, setTilesLoaded] = useState(false);
  useEffect(() => {
    if (tilesLoaded) return;
    const t = window.setTimeout(() => onFailure("load"), MAP_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [tilesLoaded, onFailure]);

  return (
    <APIProvider apiKey={apiKey} onError={() => onFailure("load")}>
      <LoadWatcher onFailure={onFailure} />
      <GMap
        mapId={mapId}
        colorScheme={ColorScheme.DARK}
        defaultCenter={view.center}
        defaultZoom={view.zoom}
        gestureHandling={compact ? "cooperative" : "greedy"}
        zoomControl
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={!compact}
        clickableIcons={false}
        onClick={() => onSelect(null)}
        onTilesLoaded={() => setTilesLoaded(true)}
        className="h-full w-full"
        aria-label="Family map"
      >
        <Camera {...props} />
        <ZoneCircles zones={zones} />
        <AccuracyCircles members={members} me={showMe ? me : null} />
        {members.map((m) => (
          <AdvancedMarker
            key={m.uid}
            position={m.location}
            title={m.displayName}
            zIndex={m.uid === selectedUid ? 1000 : m.location.presence === "online" ? 100 : 10}
            onClick={() => onSelect(m.uid)}
          >
            <MemberPin uid={m.uid} name={m.displayName} color={m.color} online={m.location.presence === "online"} selected={m.uid === selectedUid} />
          </AdvancedMarker>
        ))}
        {showMe && (
          <AdvancedMarker position={me} title="You" zIndex={500}>
            <MePin label={me.kind === "local" ? "You — shown only on this screen, not shared" : "You"} />
          </AdvancedMarker>
        )}
        {selected && (
          <InfoWindow position={selected.location} pixelOffset={[0, -52]} onCloseClick={() => onSelect(null)} headerDisabled>
            <MemberPopup member={selected} familyId={familyId} isMe={selected.uid === myUid} now={now} onClose={() => onSelect(null)} />
          </InfoWindow>
        )}
      </GMap>
    </APIProvider>
  );
}
