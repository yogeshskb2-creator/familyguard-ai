import { describe, expect, it } from "vitest";
import {
  canChangeRole,
  canDeleteFamily,
  canInviteAs,
  canManageInvites,
  canRemoveMember,
  canRenameFamily,
  nextMemberColor,
  MEMBER_COLORS,
} from "@/lib/families/permissions";
import { changeRoleSchema, createFamilySchema, docIdSchema, inviteSchema } from "@/lib/families/validation";

describe("family permission matrix", () => {
  it("invites: owner → guardian/member, guardian → member only, member → none, nobody → owner", () => {
    expect(canInviteAs("owner", "guardian")).toBe(true);
    expect(canInviteAs("owner", "member")).toBe(true);
    expect(canInviteAs("owner", "owner")).toBe(false);
    expect(canInviteAs("guardian", "member")).toBe(true);
    expect(canInviteAs("guardian", "guardian")).toBe(false);
    expect(canInviteAs("member", "member")).toBe(false);
    expect(canInviteAs(undefined, "member")).toBe(false);
    expect(canManageInvites("member")).toBe(false);
  });

  it("removal: owner can't be removed; guardians remove members; anyone but owner can leave", () => {
    expect(canRemoveMember("owner", "guardian", false)).toBe(true);
    expect(canRemoveMember("owner", "owner", true)).toBe(false);
    expect(canRemoveMember("guardian", "member", false)).toBe(true);
    expect(canRemoveMember("guardian", "guardian", false)).toBe(false);
    expect(canRemoveMember("guardian", "owner", false)).toBe(false);
    expect(canRemoveMember("member", "member", false)).toBe(false);
    expect(canRemoveMember("member", "member", true)).toBe(true);
    expect(canRemoveMember(undefined, "member", true)).toBe(false);
  });

  it("roles: only owner, never self, never to/from owner, never a no-op", () => {
    expect(canChangeRole("owner", "member", "guardian", false)).toBe(true);
    expect(canChangeRole("owner", "guardian", "member", false)).toBe(true);
    expect(canChangeRole("owner", "member", "owner", false)).toBe(false);
    expect(canChangeRole("owner", "owner", "member", true)).toBe(false);
    expect(canChangeRole("owner", "member", "member", false)).toBe(false);
    expect(canChangeRole("guardian", "member", "guardian", false)).toBe(false);
  });

  it("rename/delete: owner only", () => {
    expect([canRenameFamily("owner"), canRenameFamily("guardian"), canDeleteFamily("member")]).toEqual([true, false, false]);
  });

  it("assigns unused colours first", () => {
    expect(nextMemberColor([])).toBe(MEMBER_COLORS[0]);
    expect(nextMemberColor([MEMBER_COLORS[0]!])).toBe(MEMBER_COLORS[1]);
  });
});

describe("family input validation", () => {
  it("requires exactly one of email or phone", () => {
    expect(inviteSchema.safeParse({ email: "a@b.co" }).success).toBe(true);
    expect(inviteSchema.safeParse({ phone: "+15550001111" }).success).toBe(true);
    expect(inviteSchema.safeParse({}).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "a@b.co", phone: "+15550001111" }).success).toBe(false);
  });
  it("defaults the role to member and never accepts owner", () => {
    expect(inviteSchema.parse({ email: "A@B.co" })).toEqual({ email: "a@b.co", role: "member" });
    expect(inviteSchema.safeParse({ email: "a@b.co", role: "owner" }).success).toBe(false);
    expect(changeRoleSchema.safeParse({ role: "owner" }).success).toBe(false);
  });
  it("rejects unknown fields (no smuggling familyId, status, invitedBy…)", () => {
    expect(inviteSchema.safeParse({ email: "a@b.co", status: "accepted" }).success).toBe(false);
    expect(createFamilySchema.safeParse({ name: "Sharmas", ownerId: "x" }).success).toBe(false);
  });
  it("validates family names", () => {
    expect(createFamilySchema.safeParse({ name: " A " }).success).toBe(false);
    expect(createFamilySchema.safeParse({ name: "<b>Fam</b>" }).success).toBe(false);
    expect(createFamilySchema.parse({ name: "  The Sharmas " }).name).toBe("The Sharmas");
  });
  it("rejects path-traversal / odd document ids", () => {
    for (const bad of ["../users/x", "a/b", "", "x", "a".repeat(200), "id with space"]) {
      expect(docIdSchema.safeParse(bad).success).toBe(false);
    }
    expect(docIdSchema.safeParse("Abc123xyZ0987654321q").success).toBe(true);
  });
});
