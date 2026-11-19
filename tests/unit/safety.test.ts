import { describe, expect, it } from "vitest";
import { createZoneSchema, updateZoneSchema } from "@/lib/geofences/validation";
import { nextZoneState } from "@/lib/geofences/zones";
import { emergencySettingsSchema, resolveSosSchema, sendSosSchema } from "@/lib/sos/validation";

const zone = { lat: 0, lng: 0, radius: 100 };
const at = (meters: number, accuracy = 10) => ({ lat: meters / 111_195, lng: 0, accuracy }); // metres north of centre

describe("nextZoneState (geofence hysteresis)", () => {
  it("never alerts on the first observation", () => {
    expect(nextZoneState(undefined, zone, at(10))).toEqual({ inside: true, event: null });
    expect(nextZoneState(undefined, zone, at(500))).toEqual({ inside: false, event: null });
  });
  it("leaves state unknown in the ambiguous band on first observation", () => {
    expect(nextZoneState(undefined, zone, at(115))).toEqual({ inside: undefined, event: null });
  });
  it("enters only when clearly inside", () => {
    expect(nextZoneState(false, zone, at(95)).event).toBe("enter");
    expect(nextZoneState(false, zone, at(110)).event).toBeNull();
  });
  it("exits only beyond radius + buffer (max(25 m, accuracy))", () => {
    expect(nextZoneState(true, zone, at(120)).event).toBeNull(); // within 25 m buffer
    expect(nextZoneState(true, zone, at(130)).event).toBe("exit");
    expect(nextZoneState(true, zone, at(130, 40)).event).toBeNull(); // bigger buffer for a vaguer fix
  });
  it("ignores fixes less precise than the zone itself", () => {
    expect(nextZoneState(false, zone, at(0, 150))).toEqual({ inside: false, event: null });
    expect(nextZoneState(true, zone, at(5000, 150))).toEqual({ inside: true, event: null });
  });
  it("doesn't re-fire while staying inside or outside", () => {
    expect(nextZoneState(true, zone, at(10)).event).toBeNull();
    expect(nextZoneState(false, zone, at(900)).event).toBeNull();
  });
});

describe("zone validation", () => {
  const ok = { name: "Home", kind: "home", lat: 12.97, lng: 77.59, radius: 150 };
  it("accepts a valid zone and defaults alerts on", () => {
    expect(createZoneSchema.parse(ok)).toMatchObject({ alertsEnabled: true, notifyOnEnter: true, notifyOnExit: true, alarmOnExit: false, watchUids: [] });
  });
  it("allows large zones (e.g. 5 km around home) up to 50 km, and an alarm on leaving", () => {
    expect(createZoneSchema.safeParse({ ...ok, radius: 5000, alarmOnExit: true }).success).toBe(true);
    expect(createZoneSchema.safeParse({ ...ok, radius: 50_000 }).success).toBe(true);
    expect(createZoneSchema.safeParse({ ...ok, watchUids: ["not valid!"] }).success).toBe(false);
  });
  it.each([
    { radius: 10 },
    { radius: 60_000 },
    { radius: 100.5 },
    { lat: 95 },
    { kind: "secret-base" },
    { name: "<b>x</b>" },
    { familyId: "other" },
    { createdBy: "someone" },
  ])("rejects %o", (bad) => expect(createZoneSchema.safeParse({ ...ok, ...bad }).success).toBe(false));
  it("updates must change something and can't smuggle fields", () => {
    expect(updateZoneSchema.safeParse({}).success).toBe(false);
    expect(updateZoneSchema.safeParse({ familyId: "x" }).success).toBe(false);
    expect(updateZoneSchema.safeParse({ alertsEnabled: false }).success).toBe(true);
  });
  it("changing one toggle doesn't reset the others (regression)", () => {
    expect(updateZoneSchema.parse({ notifyOnEnter: false })).toEqual({ notifyOnEnter: false });
    expect(updateZoneSchema.parse({ name: "Gym" })).toEqual({ name: "Gym" });
  });
});

describe("SOS validation", () => {
  it("accepts an empty SOS (all families, no location)", () => {
    expect(sendSosSchema.safeParse({}).success).toBe(true);
  });
  it("rejects spoofed senders, statuses, and bad locations", () => {
    expect(sendSosSchema.safeParse({ uid: "victim" }).success).toBe(false);
    expect(sendSosSchema.safeParse({ status: "resolved" }).success).toBe(false);
    expect(sendSosSchema.safeParse({ location: { lat: 200, lng: 0, accuracy: 5 } }).success).toBe(false);
    expect(sendSosSchema.safeParse({ message: "x".repeat(201) }).success).toBe(false);
    expect(sendSosSchema.safeParse({ message: "<script>" }).success).toBe(false);
  });
  it("only resolve/cancel outcomes are allowed", () => {
    expect(resolveSosSchema.safeParse({ outcome: "resolved" }).success).toBe(true);
    expect(resolveSosSchema.safeParse({ outcome: "active" }).success).toBe(false);
  });
  it("emergency settings: up to 5 contacts with valid phones and a numeric emergency number", () => {
    const c = { name: "Dr Rao", phone: "+91 98765 43210" };
    expect(emergencySettingsSchema.parse({ contacts: [c], emergencyNumber: "112" }).contacts[0]!.phone).toBe("+919876543210");
    expect(emergencySettingsSchema.safeParse({ contacts: Array(6).fill(c), emergencyNumber: "112" }).success).toBe(false);
    expect(emergencySettingsSchema.safeParse({ contacts: [{ ...c, phone: "12345" }], emergencyNumber: "112" }).success).toBe(false);
    expect(emergencySettingsSchema.safeParse({ contacts: [], emergencyNumber: "call-me" }).success).toBe(false);
  });
});
