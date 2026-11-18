/** A domain error with an HTTP status, safe to show to the user. */
export class FamilyError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FamilyError";
  }
}

/** Non-members get the same 404 as a missing family — no existence leaks. */
export const notFound = () => new FamilyError(404, "not_found", "Family not found.");
export const forbidden = (msg = "You don't have permission to do that.") => new FamilyError(403, "forbidden", msg);
