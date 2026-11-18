import "server-only";
import type { SessionUser } from "@/lib/auth/session";
import { executeTool } from "./tools.server";

/*
 * "Quick answers": a deterministic, no-LLM mode that answers the common
 * questions straight from the same authorized tools. Used when no AI
 * provider is configured (or chosen). Nothing leaves the server.
 */

type Intent = "members" | "sharing" | "location" | "sos" | "zones" | "summary" | "me";

const INTENTS: [Intent, RegExp][] = [
  ["me", /\b(am i|my) (sharing|location)\b/i],
  ["sos", /\b(sos|alert|alerts|emergenc)/i],
  ["zones", /\b(zone|zones|geofenc|safe place)/i],
  ["summary", /\b(summar|overview|activity|what happened|update me)/i],
  // "sharing" before "location": "members currently sharing location" asks WHO shares.
  ["sharing", /\b(shar)/i],
  ["location", /\b(where|last known|location|located)\b/i],
  ["members", /\b(member|members|family|who is in|who's in)\b/i],
];

export function detectIntent(q: string): Intent | null {
  return INTENTS.find(([, re]) => re.test(q))?.[0] ?? null;
}

const URGENT = /\b(help me|danger|emergency|i'?m hurt|attack|unsafe)\b/i;

async function data<T>(tool: string, user: SessionUser): Promise<T> {
  const r = await executeTool(tool, user);
  return JSON.parse(r.content) as T;
}

interface Loc {
  name: string;
  is_you: boolean;
  sharing: boolean;
  status?: string;
  last_updated_relative?: string;
  accuracy_meters?: number;
  latitude?: number;
  longitude?: number;
  inside_safe_zone?: string | null;
}

const who = (m: { name: string; is_you: boolean }) => (m.is_you ? `${m.name} (you)` : m.name);
const place = (m: Loc) => (m.inside_safe_zone ? `at ${m.inside_safe_zone}` : `near ${m.latitude}, ${m.longitude}`);

async function answer(intent: Intent, user: SessionUser): Promise<string> {
  switch (intent) {
    case "members": {
      const { families } = await data<{ families: { family: string; members: { name: string; is_you: boolean; role: string; sharing_location_with_this_family: boolean }[] }[] }>("list_family_members", user);
      if (!families.length) return "You're not in a family yet. Create one or accept an invitation on the Family page.";
      return families
        .map((f) => `${f.family} (${f.members.length} members):\n` + f.members.map((m) => `- ${who(m)} — ${m.role}${m.sharing_location_with_this_family ? ", sharing location" : ""}`).join("\n"))
        .join("\n\n");
    }
    case "sharing":
    case "location": {
      const { families } = await data<{ families: { family: string; members: Loc[] }[] }>("get_shared_locations", user);
      if (!families.length) return "You're not in a family yet.";
      return families
        .map((f) => {
          const sharing = f.members.filter((m) => m.sharing);
          const not = f.members.filter((m) => !m.sharing);
          const lines = sharing.map((m) =>
            intent === "sharing"
              ? `- ${who(m)} (${m.status})`
              : `- ${who(m)}: ${m.status === "online" ? "" : "last known "}${place(m)}, ${m.last_updated_relative} (±${m.accuracy_meters} m)`,
          );
          return (
            `${f.family}: ${sharing.length ? `${sharing.length} sharing` : "nobody is sharing right now"}` +
            (lines.length ? `\n${lines.join("\n")}` : "") +
            (not.length ? `\nNot sharing: ${not.map(who).join(", ")}` : "")
          );
        })
        .join("\n\n");
    }
    case "sos": {
      const { alerts } = await data<{ alerts: { from: string; status: string; sent_relative: string; message: string | null; acknowledged_by: string[] }[] }>("get_recent_sos_alerts", user);
      if (!alerts.length) return "No SOS alerts. All clear.";
      return (
        "Recent SOS alerts:\n" +
        alerts
          .slice(0, 5)
          .map((a) => `- ${a.from === "you" ? "You" : a.from}, ${a.sent_relative} — ${a.status}${a.message ? `: “${a.message}”` : ""}${a.acknowledged_by.length ? ` (seen by ${a.acknowledged_by.join(", ")})` : ""}`)
          .join("\n")
      );
    }
    case "zones": {
      const { families } = await data<{ families: { family: string; zones: { name: string; radius_meters: number; alerts_enabled: boolean }[] }[] }>("get_safe_zones", user);
      const lines = families.flatMap((f) => f.zones.map((z) => `- ${z.name} (${f.family}, ${z.radius_meters} m${z.alerts_enabled ? "" : ", alerts off"})`));
      return lines.length ? `Safe zones:\n${lines.join("\n")}` : "No safe zones yet. Owners and guardians can add them on the Safe Zones page.";
    }
    case "me": {
      const s = await data<{ sharing: boolean; shared_with_families: string[] }>("get_my_sharing_status", user);
      return s.sharing ? `Yes — you're sharing your location with ${s.shared_with_families.join(", ")}.` : "You're not sharing your location. You can turn it on in Privacy & Settings.";
    }
    case "summary": {
      const [{ alerts }, { events }, loc] = await Promise.all([
        data<{ alerts: { status: string }[] }>("get_recent_sos_alerts", user),
        data<{ events: { type: string; person: string; zone: string | null; relative: string }[] }>("get_recent_activity", user),
        data<{ families: { members: Loc[] }[] }>("get_shared_locations", user),
      ]);
      const active = alerts.filter((a) => a.status === "active").length;
      const people = loc.families.flatMap((f) => f.members).filter((m) => m.sharing && !m.is_you);
      const text: Record<string, (e: { person: string; zone: string | null }) => string> = {
        sos: (e) => `${e.person} sent an SOS`,
        sos_resolved: (e) => `${e.person}'s SOS was resolved`,
        sos_cancelled: (e) => `${e.person} cancelled an SOS`,
        geofence_enter: (e) => `${e.person} arrived at ${e.zone}`,
        geofence_exit: (e) => `${e.person} left ${e.zone}`,
      };
      return [
        active ? `⚠️ ${active} active SOS alert${active > 1 ? "s" : ""} — check the SOS page.` : "No active SOS alerts.",
        `${people.length} ${people.length === 1 ? "person is" : "people are"} sharing their location with you (${people.filter((p) => p.status === "online").length} online).`,
        events.length ? `Recent activity:\n${events.slice(0, 6).map((e) => `- ${text[e.type]?.(e) ?? e.type}, ${e.relative}`).join("\n")}` : "No recent activity.",
      ].join("\n");
    }
  }
}

export async function quickAnswer(question: string, user: SessionUser): Promise<{ text: string; intent: Intent | null }> {
  const prefix = URGENT.test(question)
    ? "If you're in danger, press the SOS button in the app and call your local emergency number now.\n\n"
    : "";
  const intent = detectIntent(question);
  if (!intent) {
    return {
      intent: null,
      text:
        prefix +
        "In quick-answer mode I can tell you about: family members, who's sharing their location, last known locations, recent SOS alerts, safe zones, and a safety summary. Try one of the suggestions below.",
    };
  }
  return { intent, text: prefix + (await answer(intent, user)) };
}
