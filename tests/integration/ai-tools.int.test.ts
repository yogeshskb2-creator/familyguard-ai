import { beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth/session";
import { quickAnswer } from "@/lib/ai/quick.server";
import { AI_TOOLS, executeTool } from "@/lib/ai/tools.server";
import { createFamily, inviteMember, respondToInvitation } from "@/lib/families/service.server";
import { createZone } from "@/lib/geofences/service.server";
import { recordLocation, startSharing } from "@/lib/location/service.server";
import { sendSos } from "@/lib/sos/service.server";
import { makeUser, wipe } from "./helpers";

let ann: SessionUser, bob: SessionUser, cat: SessionUser, eve: SessionUser;
let home: string;

const run = async (tool: string, u: SessionUser) => {
  const r = await executeTool(tool, u);
  expect(r.ok).toBe(true);
  return { raw: r.content, data: JSON.parse(r.content) };
};

beforeEach(async () => {
  await wipe();
  ann = await makeUser("Ann");
  bob = await makeUser("Bob");
  cat = await makeUser("Cat");
  eve = await makeUser("Eve"); // outsider with her own family
  home = (await createFamily(ann, "Home")).id;
  for (const u of [bob, cat]) {
    const inv = await inviteMember(ann, home, { email: u.email!, role: "member" });
    await respondToInvitation(u, inv.id, true);
  }
  const eveFam = (await createFamily(eve, "Eve Family")).id;
  await createZone(ann, home, { name: "Home", kind: "home", lat: 12.9716, lng: 77.5946, radius: 200, alertsEnabled: true, notifyOnEnter: true, notifyOnExit: true });
  await createZone(eve, eveFam, { name: "Eve Secret Place", kind: "custom", lat: 1, lng: 1, radius: 200, alertsEnabled: true, notifyOnEnter: true, notifyOnExit: true });
  // Bob shares at Home; Cat does NOT share; Eve shares with her own family only.
  await startSharing(bob, { familyIds: [home], keepHistory: true, historyRetentionDays: 7 });
  await recordLocation(bob, { lat: 12.9717, lng: 77.5947, accuracy: 12, timestamp: Date.now() });
  await startSharing(eve, { familyIds: [eveFam], keepHistory: false, historyRetentionDays: 7 });
  await recordLocation(eve, { lat: 1, lng: 1, accuracy: 5, timestamp: Date.now() });
  await sendSos(eve, { message: "Eve private emergency" });
  await sendSos(cat, { message: "Flat tyre" });
});

describe("AI tools only expose what the session user may see", () => {
  it("every tool runs without arguments (nothing for the model to spoof)", () => {
    for (const t of AI_TOOLS) expect(t.parameters).toEqual({ type: "object", properties: {}, required: [], additionalProperties: false });
  });

  it("locations: consenting members only, with zone name; non-sharers have no coordinates", async () => {
    const { data } = await run("get_shared_locations", ann);
    const members = data.families[0].members;
    const bobLoc = members.find((m: { name: string }) => m.name === "Bob");
    expect(bobLoc).toMatchObject({ sharing: true, status: "online", inside_safe_zone: "Home", accuracy_meters: 12 });
    const catLoc = members.find((m: { name: string }) => m.name === "Cat");
    expect(catLoc).toEqual({ name: "Cat", is_you: false, sharing: false });
  });

  it("nothing from another family leaks: no members, locations, zones or SOS", async () => {
    for (const tool of AI_TOOLS.map((t) => t.name)) {
      const { raw } = await run(tool, ann);
      expect(raw).not.toContain("Eve");
    }
  });

  it("an outsider sees only their own family", async () => {
    const { raw } = await run("get_shared_locations", eve);
    expect(raw).not.toContain("Bob");
    expect(raw).not.toContain("12.97");
    const sos = await run("get_recent_sos_alerts", eve);
    expect(sos.raw).not.toContain("Flat tyre");
  });

  it("never includes contact details or internal IDs", async () => {
    for (const tool of AI_TOOLS.map((t) => t.name)) {
      const { raw } = await run(tool, ann);
      for (const u of [ann, bob, cat, eve]) {
        expect(raw).not.toContain(u.email!);
        expect(raw).not.toContain(u.uid);
      }
      expect(raw).not.toContain(home);
    }
  });

  it("other people's location HISTORY is never available (only live consented shares)", async () => {
    // Bob opted in to history and has a stored point; none of it may reach any tool.
    const all = (await Promise.all(AI_TOOLS.map((t) => run(t.name, ann)))).map((r) => r.raw).join();
    expect(all).not.toMatch(/recorded|points|expireAt/i);
    const aboutOthers = AI_TOOLS.filter((t) => t.name !== "get_my_sharing_status"); // that one reports the user's OWN setting
    for (const t of aboutOthers) expect((await run(t.name, ann)).raw).not.toMatch(/history/i);
  });

  it("SOS alerts include sender, status and message for the family", async () => {
    const { data } = await run("get_recent_sos_alerts", bob);
    expect(data.alerts[0]).toMatchObject({ from: "Cat", status: "active", message: "Flat tyre" });
  });

  it("unknown tools return an error result instead of throwing", async () => {
    expect(await executeTool("delete_everything", ann)).toEqual({ ok: false, content: JSON.stringify({ error: "Unknown tool: delete_everything" }) });
  });
});

describe("quick answers (no AI provider)", () => {
  it("answers the five example commands from authorized data", async () => {
    expect((await quickAnswer("Show my family members", ann)).text).toMatch(/Home \(3 members\)[\s\S]*Bob — member, sharing location/);
    expect((await quickAnswer("Show members currently sharing location", ann)).text).toMatch(/1 sharing[\s\S]*Bob \(online\)[\s\S]*Not sharing: Ann \(you\), Cat/);
    expect((await quickAnswer("Show the last known location", ann)).text).toMatch(/Bob: at Home, \d+ seconds ago \(±12 m\)/);
    expect((await quickAnswer("Show recent SOS alerts", ann)).text).toMatch(/Cat, .* — active: “Flat tyre”/);
    const summary = (await quickAnswer("Summarize family safety activity", ann)).text;
    expect(summary).toMatch(/1 active SOS alert/);
    expect(summary).toMatch(/1 person is sharing/);
    expect(summary).toMatch(/Cat sent an SOS/);
  });
  it("adds emergency guidance to urgent messages", async () => {
    expect((await quickAnswer("help me I'm in danger", cat)).text).toMatch(/^If you're in danger, press the SOS button/);
  });
});
