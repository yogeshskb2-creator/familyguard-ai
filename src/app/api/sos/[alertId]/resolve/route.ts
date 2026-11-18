import { authed } from "@/lib/api/handler";
import { notFound } from "@/lib/families/errors";
import { docIdSchema } from "@/lib/families/validation";
import { resolveSos } from "@/lib/sos/service.server";
import { resolveSosSchema } from "@/lib/sos/validation";

export const runtime = "nodejs";

export const POST = authed<{ alertId: string }>(async ({ user, params, body }) => {
  const id = docIdSchema.safeParse(params.alertId);
  if (!id.success) throw notFound();
  const { outcome } = await body(resolveSosSchema);
  return { alert: await resolveSos(user, id.data, outcome) };
});
