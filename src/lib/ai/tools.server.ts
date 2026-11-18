import "server-only";
import type { SessionUser } from "@/lib/auth/session";
import { listMyRecentEvents } from "@/lib/families/events.server";
import { listMyFamilies } from "@/lib/families/service.server";
import { listZones } from "@/lib/geofences/service.server";
import { distanceMeters } from "@/lib/location/geo";
import { getFamilyLocations, getMySharingState } from "@/lib/location/service.server";
import { listSosForUser } from "@/lib/sos/service.server";
import type { Geofence } from "@/types/models";

/*
 * Tools the AI assistant may call. Security properties:
 *  - READ-ONLY: no tool changes anything, so a prompt-injected instruction
 *    (e.g. in a member's name or SOS message) can't cause an action.
 *  - The acting user always comes from the verified session — tools take NO
 *    user/family identifiers from the model.
 *  - Every tool goes through the same authorized service functions as the
 *    app's own pages (members-only, per-family consent for locations).
 *  - Data minimisation: no emails or phone numbers; other people's location
 *    HISTORY is never available; coordinates only for consented live shares.
 */

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema for the (empty) input object. */
  parameters: { type: "object"; properties: Record<string, never>; required: string[]; additionalProperties: false };
}

const NO_ARGS: ToolDef["parameters"] = { type: "object", properties: {}, required: [], additionalProperties: false };

export const AI_TOOLS: ToolDef[] = [
  {
    name: "list_family_members",
    description:
      "List the user's family groups with each member's name, role (owner/guardian/member) and whether they are currently sharing their location with that family. Use for questions about who is in the family.",
    parameters: NO_ARGS,
  },
  {
    name: "get_shared_locations",
    description:
      "Get the latest location of every family member who has CHOSEN to share it with one of the user's families: online/offline, when it was last updated, accuracy, coordinates, and which safe zone (if any) they are inside. Members who aren't sharing are listed as not sharing. Use for 'where is…', 'who is sharing', 'last known location'.",
    parameters: NO_ARGS,
  },
  {
    name: "get_recent_sos_alerts",
    description:
      "Get the 10 most recent SOS emergency alerts the user can see (their own and those sent to their families): who sent it, when, status (active/resolved/cancelled), message, who acknowledged it, whether a location was attached.",
    parameters: NO_ARGS,
  },
  {
    name: "get_safe_zones",
    description: "List the safe zones (geofences such as Home or School) of each of the user's families, with radius and which alerts are enabled.",
    parameters: NO_ARGS,
  },
  {
    name: "get_recent_activity",
    description:
      "Get the latest safety activity across the user's families: SOS alerts sent/resolved and safe-zone arrivals/departures, newest first.",
    parameters: NO_ARGS,
  },
  {
    name: "get_my_sharing_status",
    description: "Get whether the user themself is currently sharing their location, and with which families.",
    parameters: NO_ARGS,
  },
];

const iso = (ms: number) => (ms ? new Date(ms).toISOString() : null);
function ago(ms: number, now: number) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s} seconds ago`;
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
}
const round = (n: number) => Math.round(n * 1e5) / 1e5;

function zoneAt(zones: Geofence[], lat: number, lng: number): string | null {
  const z = zones.find((z) => distanceMeters(z, { lat, lng }) <= z.radius);
  return z ? z.name : null;
}

type Handler = (user: SessionUser, now: number) => Promise<unknown>;

const HANDLERS: Record<string, Handler> = {
  async list_family_members(user) {
    const families = await listMyFamilies(user.uid);
    const out = [];
    for (const f of families) {
      const locs = await getFamilyLocations(f.id, user.uid);
      out.push({
        family: f.name,
        your_role: f.myRole,
        members: f.members.map((m) => ({
          name: m.displayName,
          is_you: m.uid === user.uid,
          role: m.role,
          sharing_location_with_this_family: locs.find((l) => l.uid === m.uid)?.sharing ?? false,
        })),
      });
    }
    return { families: out };
  },

  async get_shared_locations(user, now) {
    const families = await listMyFamilies(user.uid);
    const out = [];
    for (const f of families) {
      const [locs, zones] = await Promise.all([getFamilyLocations(f.id, user.uid), listZones(f.id, user.uid)]);
      out.push({
        family: f.name,
        members: locs.map((m) =>
          m.location
            ? {
                name: m.displayName,
                is_you: m.uid === user.uid,
                sharing: true,
                status: m.location.presence,
                last_updated: iso(m.location.updatedAt),
                last_updated_relative: ago(m.location.updatedAt, now),
                accuracy_meters: Math.round(m.location.accuracy),
                latitude: round(m.location.lat),
                longitude: round(m.location.lng),
                inside_safe_zone: zoneAt(zones, m.location.lat, m.location.lng),
              }
            : { name: m.displayName, is_you: m.uid === user.uid, sharing: false },
        ),
      });
    }
    return {
      note: "Web browsers only send updates while FamilyGuard is open, so 'offline' means last known location.",
      families: out,
    };
  },

  async get_recent_sos_alerts(user, now) {
    const alerts = await listSosForUser(user.uid, 10);
    return {
      alerts: alerts.map((a) => ({
        from: a.uid === user.uid ? "you" : a.displayName,
        families: a.familyNames,
        status: a.status,
        sent_at: iso(a.createdAt),
        sent_relative: ago(a.createdAt, now),
        message: a.message || null,
        location_attached: a.location !== null,
        acknowledged_by: a.acknowledgedBy.map((x) => x.displayName),
        resolved_by: a.resolvedByName,
      })),
    };
  },

  async get_safe_zones(user) {
    const families = await listMyFamilies(user.uid);
    const out = [];
    for (const f of families) {
      const zones = await listZones(f.id, user.uid);
      out.push({
        family: f.name,
        zones: zones.map((z) => ({
          name: z.name,
          kind: z.kind,
          radius_meters: z.radius,
          alerts_enabled: z.alertsEnabled,
          alert_on_arrival: z.notifyOnEnter,
          alert_on_leaving: z.notifyOnExit,
        })),
      });
    }
    return { families: out };
  },

  async get_recent_activity(user, now) {
    const families = await listMyFamilies(user.uid);
    const events = await listMyRecentEvents(
      families.map((f) => f.id),
      user.uid,
      15,
    );
    return {
      events: events.map((e) => ({
        type: e.type,
        person: e.uid === user.uid ? "you" : e.displayName,
        zone: e.zoneName,
        family: families.find((f) => f.id === e.familyId)?.name ?? null,
        at: iso(e.at),
        relative: ago(e.at, now),
      })),
    };
  },

  async get_my_sharing_status(user) {
    const [state, families] = await Promise.all([getMySharingState(user.uid), listMyFamilies(user.uid)]);
    return {
      sharing: state.consent.active,
      shared_with_families: state.consent.familyIds.map((id) => families.find((f) => f.id === id)?.name ?? "a family you left"),
      keeps_history: state.consent.keepHistory,
      last_sent: state.location ? iso(state.location.updatedAt) : null,
    };
  },
};

/** Execute a tool for the session user. Unknown tools return an error result (never throw to the model loop). */
export async function executeTool(name: string, user: SessionUser): Promise<{ ok: boolean; content: string }> {
  const handler = HANDLERS[name];
  if (!handler) return { ok: false, content: JSON.stringify({ error: `Unknown tool: ${name}` }) };
  try {
    return { ok: true, content: JSON.stringify(await handler(user, Date.now())) };
  } catch (err) {
    console.error("[ai-tool]", name, err);
    return { ok: false, content: JSON.stringify({ error: "This information is temporarily unavailable." }) };
  }
}
