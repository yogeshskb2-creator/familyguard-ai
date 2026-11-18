import { authed } from "@/lib/api/handler";
import { listNotifications, unreadCount } from "@/lib/notifications/service.server";

export const runtime = "nodejs";

/** Your own inbox. `?count=1` returns just the unread count (for the bell). */
export const GET = authed(async ({ user, req }) => {
  if (req.nextUrl.searchParams.get("count")) return { unread: await unreadCount(user.uid) };
  const [items, unread] = await Promise.all([listNotifications(user.uid), unreadCount(user.uid)]);
  return { items, unread };
});
