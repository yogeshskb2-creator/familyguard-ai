import { authed } from "@/lib/api/handler";
import { notFound } from "@/lib/families/errors";
import { changeMemberRole, getFamilyForMember, removeMember } from "@/lib/families/service.server";
import { changeRoleSchema, docIdSchema } from "@/lib/families/validation";

export const runtime = "nodejs";
type P = { familyId: string; uid: string };

const ids = (p: P) => {
  const f = docIdSchema.safeParse(p.familyId);
  const u = docIdSchema.safeParse(p.uid);
  if (!f.success || !u.success) throw notFound();
  return { familyId: f.data, uid: u.data };
};

/** Change a member's role (owner only). */
export const PATCH = authed<P>(async ({ user, params, body }) => {
  const { familyId, uid } = ids(params);
  const { role } = await body(changeRoleSchema);
  await changeMemberRole(user, familyId, uid, role);
  return { family: await getFamilyForMember(familyId, user.uid) };
});

/** Remove a member, or leave the family when uid is your own. */
export const DELETE = authed<P>(async ({ user, params }) => {
  const { familyId, uid } = ids(params);
  await removeMember(user, familyId, uid);
});
