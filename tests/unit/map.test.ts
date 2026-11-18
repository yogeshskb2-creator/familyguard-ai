import { describe, expect, it } from "vitest";
import { boundsOf, initialView, niceScale, placedMembers, projectSchematic, type MemberLocationView } from "@/lib/location/map";

const loc = (lat: number, lng: number) => ({ lat, lng, accuracy: 10, updatedAt: 0, presence: "online" as const });
const m = (uid: string, l: ReturnType<typeof loc> | null, sharing = l !== null): MemberLocationView => ({
  uid,
  displayName: uid,
  color: "#fff",
  sharing,
  location: l,
});

describe("placedMembers", () => {
  it("shows only members who are sharing with a location", () => {
    const out = placedMembers([m("a", loc(1, 1)), m("b", null), m("c", null, true)]);
    expect(out.map((x) => x.uid)).toEqual(["a"]);
  });
});

describe("boundsOf / initialView", () => {
  it("has no bounds for no points and a neutral world view", () => {
    expect(boundsOf([])).toBeNull();
    expect(initialView([]).zoom).toBe(2);
  });
  it("zooms to street level for one person", () => {
    expect(initialView([{ lat: 12.97, lng: 77.59 }])).toEqual({ center: { lat: 12.97, lng: 77.59 }, zoom: 15 });
  });
  it("centres between several people and zooms out with distance", () => {
    const near = initialView([{ lat: 12.97, lng: 77.59 }, { lat: 12.98, lng: 77.6 }]);
    const far = initialView([{ lat: 12.97, lng: 77.59 }, { lat: 28.61, lng: 77.2 }]);
    expect(near.center.lat).toBeCloseTo(12.975);
    expect(far.zoom).toBeLessThan(near.zoom);
  });
});

describe("projectSchematic", () => {
  it("places a single person in the centre", () => {
    const { points } = projectSchematic([{ uid: "a", lat: 10, lng: 10 }]);
    expect(points[0]).toMatchObject({ x: 50, y: 50 });
  });
  it("keeps north up and east right, inside the padding", () => {
    const { points } = projectSchematic([
      { uid: "sw", lat: 12.9, lng: 77.5 },
      { uid: "ne", lat: 13.0, lng: 77.6 },
    ]);
    const sw = points.find((p) => p.uid === "sw")!;
    const ne = points.find((p) => p.uid === "ne")!;
    expect(ne.x).toBeGreaterThan(sw.x);
    expect(ne.y).toBeLessThan(sw.y);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(14 - 1e-9);
      expect(p.x).toBeLessThanOrEqual(86 + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(14 - 1e-9);
      expect(p.y).toBeLessThanOrEqual(86 + 1e-9);
    }
  });
  it("reports the canvas width in metres for a scale bar", () => {
    const { widthMeters } = projectSchematic([
      { uid: "a", lat: 0, lng: 0 },
      { uid: "b", lat: 0.01, lng: 0 },
    ]);
    expect(widthMeters).toBeGreaterThan(1100); // 0.01° ≈ 1.1 km spans the usable area
  });
});

describe("niceScale", () => {
  it.each([
    [1234, 1000, "1 km"],
    [480, 200, "200 m"],
    [5600, 5000, "5 km"],
    [75, 50, "50 m"],
  ])("%d m → %d (%s)", (max, meters, label) => {
    expect(niceScale(max)).toEqual({ meters, label });
  });
});
