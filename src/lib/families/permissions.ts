import type { FamilyRole } from "@/types/models";

/**
 * Family authorization policy — pure functions, shared by API routes and UI.
 * The server is the only enforcer; the UI just uses these to hide controls.
 *
 *   owner    – one per family. Everything, incl. roles, rename, delete.
 *   guardian – invites/removes plain members. Cannot touch owner/guardians.
 *   member   – can view the family and leave it.
 */
export const LIMITS = {
  maxFamiliesPerUser: 5,
  maxMembersPerFamily: 20,
  maxPendingInvitesPerFamily: 20,
  inviteTtlMs: 7 * 24 * 60 * 60 * 1000,
} as const;

export const ROLE_LABEL: Record<FamilyRole, string> = {
  owner: "Owner",
  guardian: "Guardian",
  member: "Member",
};

export function canManageInvites(actor: FamilyRole | undefined): boolean {
  return actor === "owner" || actor === "guardian";
}

/** Guardians may only invite plain members; nobody can invite a new owner. */
export function canInviteAs(actor: FamilyRole | undefined, role: FamilyRole): boolean {
  if (role === "owner") return false;
  if (actor === "owner") return true;
  return actor === "guardian" && role === "member";
}

export function canRemoveMember(actor: FamilyRole | undefined, target: FamilyRole, isSelf: boolean): boolean {
  if (target === "owner") return false; // owner deletes the family instead
  if (isSelf) return actor !== undefined; // anyone else may leave
  if (actor === "owner") return true;
  return actor === "guardian" && target === "member";
}

export function canChangeRole(
  actor: FamilyRole | undefined,
  target: FamilyRole,
  next: FamilyRole,
  isSelf: boolean,
): boolean {
  return actor === "owner" && !isSelf && target !== "owner" && next !== "owner" && target !== next;
}

export function canRenameFamily(actor: FamilyRole | undefined): boolean {
  return actor === "owner";
}

export function canDeleteFamily(actor: FamilyRole | undefined): boolean {
  return actor === "owner";
}

/** Marker colours for the map; assigned round-robin by join order. */
export const MEMBER_COLORS = ["#4F7CFF", "#9B5CFF", "#22E1FF", "#FF4FD8", "#2EE6A6", "#FFB547", "#FF6B6B", "#7CC4FF"];

export function nextMemberColor(used: string[]): string {
  return MEMBER_COLORS.find((c) => !used.includes(c)) ?? MEMBER_COLORS[used.length % MEMBER_COLORS.length]!;
}
