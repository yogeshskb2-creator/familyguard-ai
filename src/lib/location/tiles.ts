/**
 * Pure Web-Mercator helpers for the OpenStreetMap tile map (no DOM, no
 * dependencies — unit-testable). Coordinates follow the standard "slippy map"
 * scheme used by OpenStreetMap and Google: at zoom z the world is
 * 256 · 2^z pixels wide, x grows east, y grows south.
 */
import { boundsOf, type LatLng } from "./map";

export const TILE_SIZE = 256;
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 19;
/** Web-Mercator is undefined at the poles; every slippy map clips here. */
export const MAX_LAT = 85.05112878;

export interface MapView {
  center: LatLng;
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

const RAD = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const worldSize = (zoom: number) => TILE_SIZE * 2 ** zoom;
/** Longitude normalised to [-180, 180). */
const wrapLng = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;

export function clampZoom(zoom: number): number {
  return clamp(Math.round(zoom), MIN_ZOOM, MAX_ZOOM);
}

/** lat/lng → world pixel at `zoom`. */
export function project(p: LatLng, zoom: number): { x: number; y: number } {
  const s = worldSize(zoom);
  const sin = Math.sin(clamp(p.lat, -MAX_LAT, MAX_LAT) * RAD);
  return {
    x: ((p.lng + 180) / 360) * s,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s,
  };
}

/** World pixel at `zoom` → lat/lng (longitude wrapped, latitude clipped). */
export function unproject(x: number, y: number, zoom: number): LatLng {
  const s = worldSize(zoom);
  const n = Math.PI - (2 * Math.PI * clamp(y, 0, s)) / s;
  return { lat: clamp(Math.atan(Math.sinh(n)) / RAD, -MAX_LAT, MAX_LAT), lng: wrapLng((x / s) * 360 - 180) };
}

/** Ground resolution: real metres covered by one screen pixel at this latitude and zoom. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (156_543.033_92 * Math.cos(clamp(lat, -MAX_LAT, MAX_LAT) * RAD)) / 2 ** zoom;
}

/**
 * Screen position (px from the map's top-left) of a point. Chooses the copy of
 * the world nearest the centre, so markers stay correct across the date line.
 */
export function toScreen(p: LatLng, view: MapView, size: Size): { x: number; y: number } {
  const s = worldSize(view.zoom);
  const c = project(view.center, view.zoom);
  const q = project(p, view.zoom);
  let dx = q.x - c.x;
  dx -= Math.round(dx / s) * s;
  return { x: size.width / 2 + dx, y: size.height / 2 + (q.y - c.y) };
}

/** Move the view by a screen-pixel delta (positive dx = content moves left, i.e. look east). */
export function panBy(view: MapView, dx: number, dy: number): MapView {
  const c = project(view.center, view.zoom);
  return { zoom: view.zoom, center: unproject(c.x + dx, c.y + dy, view.zoom) };
}

/** Change zoom while keeping the ground under screen point (sx, sy) fixed — how wheel/pinch zoom feels natural. */
export function zoomAround(view: MapView, nextZoom: number, sx: number, sy: number, size: Size): MapView {
  const zoom = clampZoom(nextZoom);
  if (zoom === view.zoom) return view;
  const k = 2 ** (zoom - view.zoom);
  const c = project(view.center, view.zoom);
  const ox = sx - size.width / 2;
  const oy = sy - size.height / 2;
  return { zoom, center: unproject((c.x + ox) * k - ox, (c.y + oy) * k - oy, zoom) };
}

/**
 * The view that shows every point with `padding` px to spare: one point →
 * street level (15); several → the closest zoom (≤ maxZoom) that fits them all;
 * none → a neutral world view.
 */
export function fitView(points: LatLng[], size: Size, padding = 64, maxZoom = 17): MapView {
  const b = boundsOf(points);
  if (!b) return { center: { lat: 20, lng: 0 }, zoom: MIN_ZOOM };
  if (points.length === 1 || (b.north === b.south && b.east === b.west)) return { center: points[0]!, zoom: Math.min(15, maxZoom) };
  const availW = Math.max(1, size.width - 2 * padding);
  const availH = Math.max(1, size.height - 2 * padding);
  for (let z = maxZoom; z >= MIN_ZOOM; z--) {
    const nw = project({ lat: b.north, lng: b.west }, z);
    const se = project({ lat: b.south, lng: b.east }, z);
    if (se.x - nw.x <= availW && se.y - nw.y <= availH) {
      return { zoom: z, center: unproject((nw.x + se.x) / 2, (nw.y + se.y) / 2, z) };
    }
  }
  const nw = project({ lat: b.north, lng: b.west }, MIN_ZOOM);
  const se = project({ lat: b.south, lng: b.east }, MIN_ZOOM);
  return { zoom: MIN_ZOOM, center: unproject((nw.x + se.x) / 2, (nw.y + se.y) / 2, MIN_ZOOM) };
}

export interface VisibleTile {
  key: string;
  url: string;
  /** Screen position of the tile's top-left corner, in px. */
  left: number;
  top: number;
}

export function osmTileUrl(z: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

/** Tiles covering the viewport (wrapped east–west; nothing above/below the world). */
export function visibleTiles(view: MapView, size: Size): VisibleTile[] {
  const z = view.zoom;
  const n = 2 ** z;
  const c = project(view.center, z);
  const left0 = c.x - size.width / 2;
  const top0 = c.y - size.height / 2;
  const tiles: VisibleTile[] = [];
  for (let ty = Math.floor(top0 / TILE_SIZE); ty <= Math.floor((top0 + size.height) / TILE_SIZE); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(left0 / TILE_SIZE); tx <= Math.floor((left0 + size.width) / TILE_SIZE); tx++) {
      const wx = ((tx % n) + n) % n;
      tiles.push({ key: `${z}/${tx}/${ty}`, url: osmTileUrl(z, wx, ty), left: tx * TILE_SIZE - left0, top: ty * TILE_SIZE - top0 });
    }
  }
  return tiles;
}
