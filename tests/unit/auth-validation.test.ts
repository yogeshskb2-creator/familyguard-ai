import { describe, expect, it } from "vitest";
import {
  fieldErrors,
  loginSchema,
  otpSchema,
  phoneSchema,
  profileUpdateSchema,
  registerSchema,
} from "@/lib/validation/auth";

const validReg = {
  displayName: "Ananya",
  email: "  Ananya@Example.COM ",
  password: "safe1234",
  confirmPassword: "safe1234",
  acceptTerms: true as const,
};

describe("registration validation", () => {
  it("accepts a valid registration and normalises email", () => {
    const r = registerSchema.parse(validReg);
    expect(r.email).toBe("ananya@example.com");
  });
  it.each([
    ["short", "Use at least 8 characters"],
    ["abcdefgh", "Include at least one number"],
    ["12345678", "Include at least one letter"],
  ])("rejects weak password %s", (password, msg) => {
    const r = registerSchema.safeParse({ ...validReg, password, confirmPassword: password });
    expect(r.success).toBe(false);
    expect(fieldErrors(r.error!).password).toBe(msg);
  });
  it("rejects mismatched confirmation", () => {
    const r = registerSchema.safeParse({ ...validReg, confirmPassword: "other1234" });
    expect(fieldErrors(r.error!).confirmPassword).toBe("Passwords don't match");
  });
  it("requires accepting the terms", () => {
    const r = registerSchema.safeParse({ ...validReg, acceptTerms: false });
    expect(fieldErrors(r.error!).acceptTerms).toMatch(/accept/);
  });
  it("rejects markup in names", () => {
    expect(registerSchema.safeParse({ ...validReg, displayName: "<img src=x>" }).success).toBe(false);
  });
});

describe("login validation", () => {
  it("rejects invalid email and empty password", () => {
    const r = loginSchema.safeParse({ email: "nope", password: "" });
    expect(fieldErrors(r.error!)).toEqual({ email: "Enter a valid email address", password: "Enter your password" });
  });
});

describe("phone OTP validation", () => {
  it("normalises formatted numbers to E.164", () => {
    expect(phoneSchema.parse("+91 98765-43210")).toBe("+919876543210");
  });
  it("requires an international prefix", () => {
    expect(phoneSchema.safeParse("9876543210").success).toBe(false);
  });
  it("requires exactly 6 digits for the code", () => {
    expect(otpSchema.safeParse("123456").success).toBe(true);
    expect(otpSchema.safeParse("12345").success).toBe(false);
    expect(otpSchema.safeParse("12a456").success).toBe(false);
  });
});

describe("profile update whitelist", () => {
  it("allows displayName and aiProvider", () => {
    expect(profileUpdateSchema.parse({ displayName: "Meera", aiProvider: "gemini" })).toEqual({
      displayName: "Meera",
      aiProvider: "gemini",
    });
  });
  it.each([{ admin: true }, { role: "admin" }, { familyIds: ["x"] }, { uid: "other" }, { email: "a@b.co" }])(
    "rejects privileged field %o",
    (extra) => {
      expect(profileUpdateSchema.safeParse({ displayName: "Meera", ...extra }).success).toBe(false);
    },
  );
  it("rejects empty updates and unknown providers", () => {
    expect(profileUpdateSchema.safeParse({}).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ aiProvider: "other" }).success).toBe(false);
  });
});
