import { authed } from "@/lib/api/handler";
import { createFamily, listMyFamilies, listMyInvitations } from "@/lib/families/service.server";
import { createFamilySchema } from "@/lib/families/validation";

export const runtime = "nodejs";

/** My families + invitations addressed to me. */
export const GET = authed(async ({ user }) => ({
  families: await listMyFamilies(user.uid),
  invitations: await listMyInvitations(user),
}));

export const POST = authed(async ({ user, body }) => {
  const { name } = await body(createFamilySchema);
  return { family: await createFamily(user, name) };
});
