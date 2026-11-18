/**
 * Only allow same-site relative paths as post-login redirect targets, to
 * prevent open redirects like ?next=https://evil.example or ?next=//evil.
 */
export function safeRedirect(target: string | null | undefined, fallback = "/dashboard"): string {
  if (!target || typeof target !== "string") return fallback;
  if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(target)) return fallback;
  try {
    const url = new URL(target, "http://local.invalid");
    if (url.origin !== "http://local.invalid") return fallback;
    if (url.pathname.startsWith("/api/") || url.pathname === "/login" || url.pathname === "/register") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
