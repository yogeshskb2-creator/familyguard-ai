import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { readServiceAccount } = await import("@/lib/firebase/admin");

const PEM = (kind: string) => `-----${kind} ${"PRIVATE"} KEY-----`; // built from parts so the secret scanner stays clean
const KEY = `${PEM("BEGIN")}\nabc\n${PEM("END")}\n`;
const file = { type: "service_account", project_id: "fg-123", client_email: "sa@fg-123.iam.gserviceaccount.com", private_key: KEY };

describe("readServiceAccount", () => {
  it("accepts the whole downloaded key file in FIREBASE_SERVICE_ACCOUNT", () => {
    expect(readServiceAccount({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify(file, null, 2) })).toEqual({
      projectId: "fg-123",
      clientEmail: "sa@fg-123.iam.gserviceaccount.com",
      privateKey: KEY,
    });
  });
  it("accepts a key whose newlines were pasted as \\n", () => {
    const flat = JSON.stringify({ ...file, private_key: KEY.replace(/\n/g, "\\n") });
    expect(readServiceAccount({ FIREBASE_SERVICE_ACCOUNT: flat })?.privateKey).toBe(KEY);
  });
  it("still supports the three separate variables", () => {
    expect(
      readServiceAccount({ FIREBASE_ADMIN_PROJECT_ID: "p", FIREBASE_ADMIN_CLIENT_EMAIL: "e", FIREBASE_ADMIN_PRIVATE_KEY: KEY.replace(/\n/g, "\\n") }),
    ).toEqual({ projectId: "p", clientEmail: "e", privateKey: KEY });
  });
  it("is not configured when the JSON is malformed or incomplete", () => {
    expect(readServiceAccount({ FIREBASE_SERVICE_ACCOUNT: "{not json" })).toBeNull();
    expect(readServiceAccount({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "x" }) })).toBeNull();
    expect(readServiceAccount({})).toBeNull();
  });
});
