import { authed } from "@/lib/api/handler";
import { notFound } from "@/lib/families/errors";
import { docIdSchema } from "@/lib/families/validation";
import { acknowledgeSos } from "@/lib/sos/service.server";

export const runtime = "nodejs";

export const POST = authed<{ alertId: string }>(async ({ user, params }) => {
  const id = docIdSchema.safeParse(params.alertId);
  if (!id.success) throw notFound();
  return { alert: await acknowledgeSos(user, id.data) };
});
