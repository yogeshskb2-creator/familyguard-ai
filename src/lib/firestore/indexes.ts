/**
 * Firestore rejects a query that needs a composite index which doesn't exist
 * yet with gRPC code 9 (FAILED_PRECONDITION) and a "requires an index"
 * message. Newly created projects, or projects whose index deploy hasn't run
 * or hasn't finished building, hit this. Callers use it to fall back to a
 * query that needs no composite index.
 */
export function isMissingIndexError(e: unknown): boolean {
  const err = e as { code?: unknown; message?: unknown } | null;
  if (!err) return false;
  const msg = typeof err.message === "string" ? err.message : "";
  return (err.code === 9 || err.code === "failed-precondition" || /FAILED_PRECONDITION/.test(msg)) && /index/i.test(msg);
}
