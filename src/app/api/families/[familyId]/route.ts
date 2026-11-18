import { authed } from "@/lib/api/handler";
import { notFound } from "@/lib/families/errors";
import { deleteFamily, getFamilyForMember, renameFamily } from "@/lib/families/service.server";
import { docIdSchema, renameFamilySchema } from "@/lib/families/validation";

export const runtime = "nodejs";
type P = { familyId: string };

const id = (p: P) => {
  const r = docIdSchema.safeParse(p.familyId);
  if (!r.success) throw notFound();
  return r.data;
};

export const GET = authed<P>(async ({ user, params }) => ({ family: await getFamilyForMember(id(params), user.uid) }));

export const PATCH = authed<P>(async ({ user, params, body }) => {
  const { name } = await body(renameFamilySchema);
  await renameFamily(user, id(params), name);
  return { family: await getFamilyForMember(id(params), user.uid) };
});

export const DELETE = authed<P>(async ({ user, params }) => {
  await deleteFamily(user, id(params));
});
