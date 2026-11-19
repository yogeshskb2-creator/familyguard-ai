import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  fitView,
  metersPerPixel,
  osmTileUrl,
  panBy,
  project,
  toScreen,
  unproject,
  visibleTiles,
  zoomAround,
} from "@/lib/location/tiles";

const size = { width: 800, height: 600 };
const blr = { lat: 12.9716, lng: 77.5946 };

describe("Web-Mercator projection", () => {
  it("puts (0, 0) in the middle of the world and matches the standard tile scheme", () => {
    expect(project({ lat: 0, lng: 0 }, 0)).toEqual({ x: 128, y: 128 });
    const p = project(blr, 15);
    expect([Math.floor(p.x / 256), Math.floor(p.y / 256)]).toEqual([23446, 15193]);
  });

  it("round-trips lat/lng exactly", () => {
    for (const q of [blr, { lat: -33.86, lng: 151.2 }, { lat: 51.5, lng: -0.12 }]) {
      const a = project(q, 13);
      const b = unproject(a.x, a.y, 13);
      expect(b.lat).toBeCloseTo(q.lat, 9);
      expect(b.lng).toBeCloseTo(q.lng, 9);
    }
  });

  it("knows real ground distance per pixel (for zones, accuracy rings and the scale bar)", () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(156_543.034, 2);
    expect(metersPerPixel(60, 10)).toBeCloseTo(156_543.034 / 2 / 1024, 2);
  });
});

describe("view maths", () => {
  const view = { center: { lat: 12.97, lng: 77.59 }, zoom: 14 };

  it("draws the centre in the middle of the map, and panning moves content the other way", () => {
    expect(toScreen(view.center, view, size)).toEqual({ x: 400, y: 300 });
    const moved = toScreen(view.center, panBy(view, 100, 0), size);
    expect(moved.x).toBeCloseTo(300, 6);
    expect(moved.y).toBeCloseTo(300, 6);
  });

  it("zooming keeps the ground under the cursor fixed, and clamps zoom", () => {
    const c = project(view.center, 14);
    const ground = unproject(c.x + 250, c.y - 180, 14); // under screen point (650, 120)
    const z = zoomAround(view, 16, 650, 120, size);
    expect(z.zoom).toBe(16);
    const s = toScreen(ground, z, size);
    expect(s.x).toBeCloseTo(650, 4);
    expect(s.y).toBeCloseTo(120, 4);
    expect(zoomAround(view, 99, 0, 0, size).zoom).toBe(MAX_ZOOM);
    expect(zoomAround(view, -5, 0, 0, size).zoom).toBe(MIN_ZOOM);
  });

  it("keeps markers next to the centre across the date line", () => {
    const v = { center: { lat: 0, lng: 179.9 }, zoom: 10 };
    const x = toScreen({ lat: 0, lng: -179.9 }, v, size).x;
    expect(x).toBeGreaterThan(400);
    expect(x).toBeLessThan(800);
  });
});

describe("fitView", () => {
  it("fits everyone inside the padding at the closest zoom that works", () => {
    const pts = [{ lat: 12.97, lng: 77.59 }, { lat: 12.93, lng: 77.62 }];
    const v = fitView(pts, size, 64);
    for (const p of pts) {
      const s = toScreen(p, v, size);
      expect(s.x).toBeGreaterThanOrEqual(64 - 1e-6);
      expect(s.x).toBeLessThanOrEqual(736 + 1e-6);
      expect(s.y).toBeGreaterThanOrEqual(64 - 1e-6);
      expect(s.y).toBeLessThanOrEqual(536 + 1e-6);
    }
    const closer = { ...v, zoom: v.zoom + 1 };
    expect(pts.some((p) => { const s = toScreen(p, closer, size); return s.y < 64 || s.y > 536 || s.x < 64 || s.x > 736; })).toBe(true);
  });

  it("one point → street level; nobody → world view", () => {
    expect(fitView([blr], size)).toEqual({ center: blr, zoom: 15 });
    expect(fitView([], size).zoom).toBe(MIN_ZOOM);
  });
});

describe("tiles", () => {
  it("covers the whole viewport with OpenStreetMap tiles", () => {
    const tiles = visibleTiles({ center: { lat: 12.97, lng: 77.59 }, zoom: 14 }, size);
    expect(Math.min(...tiles.map((t) => t.left))).toBeLessThanOrEqual(0);
    expect(Math.max(...tiles.map((t) => t.left + 256))).toBeGreaterThanOrEqual(800);
    expect(Math.min(...tiles.map((t) => t.top))).toBeLessThanOrEqual(0);
    expect(Math.max(...tiles.map((t) => t.top + 256))).toBeGreaterThanOrEqual(600);
    for (const t of tiles) expect(t.url).toMatch(/^https:\/\/tile\.openstreetmap\.org\/14\/\d+\/\d+\.png$/);
  });

  it("never requests tiles above/below the world and wraps east–west", () => {
    const tiles = visibleTiles({ center: { lat: 80, lng: 179 }, zoom: 2 }, size);
    for (const t of tiles) {
      const [, x, y] = t.url.match(/\/2\/(\d+)\/(\d+)\.png$/)!.map(Number);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(4);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(4);
    }
    expect(osmTileUrl(3, 4, 5)).toBe("https://tile.openstreetmap.org/3/4/5.png");
  });
});
