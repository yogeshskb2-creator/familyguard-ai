/**
 * FamilyGuard AI — Firestore data model.
 *
 * Collection layout (top-level):
 *   users/{uid}                         Profile. `role` is NEVER client-writable.
 *   families/{familyId}                 Group; `memberIds` drives rule checks.
 *   familyInvitations/{inviteId}        Pending/accepted/rejected invitations.
 *   devices/{deviceId}                  Devices explicitly registered by owner.
 *   locations/{uid}                     Latest location — exists ONLY while sharing.
 *   locationHistory/{uid}/points/{id}   Optional history, owner-controlled retention.
 *   emergencyAlerts/{alertId}           SOS events, user-initiated only.
 *   geofences/{zoneId}                  Family zones (Home, School, …).
 *   notifications/{uid}/items/{id}      Per-user inbox.
 *
 * Timestamps are epoch milliseconds in the app layer; they are stored as
 * Firestore Timestamps and converted at the repository boundary.
 */

export type UserRole = "member"; // admin is a Firebase custom claim, never a profile field

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
  familyIds: string[];
  /** Preferred AI provider for the assistant. */
  aiProvider: AiProvider;
  /** Location-sharing consent. Server-managed; clients can't write it. */
  sharing: SharingConsent;
  createdAt: number;
  updatedAt: number;
}

export type FamilyRole = "owner" | "guardian" | "member";

export interface FamilyMember {
  uid: string;
  displayName: string;
  role: FamilyRole;
  joinedAt: number;
  /** Marker colour on the map. */
  color: string;
}

export interface Family {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[]; // denormalised for security-rule membership checks
  members: Record<string, FamilyMember>;
  createdAt: number;
}

export type InvitationStatus = "pending" | "accepted" | "rejected" | "revoked" | "expired";

export interface FamilyInvitation {
  id: string;
  familyId: string;
  familyName: string;
  invitedBy: string;
  invitedByName: string;
  /** The invitee identifies themselves by signing in with this email/phone. */
  inviteeEmail: string | null;
  inviteePhone: string | null;
  role: Exclude<FamilyRole, "owner">;
  status: InvitationStatus;
  createdAt: number;
  expiresAt: number;
}

/**
 * Consent record. Location is only written while `active` is true and the
 * user started sharing themselves; revoking deletes `locations/{uid}`.
 */
export interface SharingConsent {
  active: boolean;
  /** Families the user chose to share with — not all families by default. */
  familyIds: string[];
  grantedAt: number | null;
  revokedAt: number | null;
  keepHistory: boolean;
  historyRetentionDays: number;
}

export interface LiveLocation {
  uid: string;
  lat: number;
  lng: number;
  accuracy: number; // metres
  heading: number | null;
  speed: number | null;
  /** Families allowed to read this document (copied from consent). */
  sharedWith: string[];
  updatedAt: number;
  source: "web" | "android";
}

export interface LocationHistoryPoint {
  id: string;
  lat: number;
  lng: number;
  accuracy: number;
  recordedAt: number;
}

export type DeviceType = "web" | "android" | "ios" | "tablet";

export interface Device {
  id: string;
  ownerId: string;
  name: string;
  type: DeviceType;
  userAgent: string | null;
  sharingEnabled: boolean;
  status: "active" | "inactive" | "revoked";
  registeredAt: number;
  lastActiveAt: number;
}

export type AlertStatus = "active" | "acknowledged" | "resolved" | "cancelled";

export interface EmergencyAlert {
  id: string;
  uid: string;
  displayName: string;
  familyIds: string[];
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  message: string;
  status: AlertStatus;
  acknowledgedBy: string[];
  createdAt: number;
  resolvedAt: number | null;
}

export type ZoneKind = "home" | "school" | "office" | "college" | "custom";

export interface Geofence {
  id: string;
  familyId: string;
  createdBy: string;
  name: string;
  kind: ZoneKind;
  lat: number;
  lng: number;
  radius: number; // metres
  alertsEnabled: boolean;
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
  createdAt: number;
}

export type NotificationKind =
  | "invitation"
  | "sos"
  | "geofence_enter"
  | "geofence_exit"
  | "sharing_started"
  | "sharing_stopped"
  | "device";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  read: boolean;
  link: string | null;
  createdAt: number;
}

export type AiProvider = "claude" | "openai" | "gemini";
