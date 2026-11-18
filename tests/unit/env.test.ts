import { describe, expect, it } from "vitest";
import { isFirebaseConfigured, missingFirebaseConfig, type FirebaseWebConfig } from "@/lib/env";

const full: FirebaseWebConfig = {
  apiKey: "k",
  authDomain: "x.firebaseapp.com",
  projectId: "x",
  storageBucket: "",
  messagingSenderId: "",
  appId: "1:2:web:3",
};

describe("firebase config detection", () => {
  it("is configured when all required keys are present", () => {
    expect(isFirebaseConfigured(full)).toBe(true);
    expect(missingFirebaseConfig(full)).toEqual([]);
  });

  it("reports each missing required key", () => {
    expect(missingFirebaseConfig({ ...full, apiKey: "", projectId: "  " })).toEqual(["apiKey", "projectId"]);
  });

  it("treats the empty default (no .env.local) as unconfigured", () => {
    expect(isFirebaseConfigured()).toBe(false);
  });
});
