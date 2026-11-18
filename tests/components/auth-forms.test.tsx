import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routerMock } from "../setup";

const client = vi.hoisted(() => ({
  signInWithEmail: vi.fn(),
  registerWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  startPhoneSignIn: vi.fn(),
  confirmPhoneCode: vi.fn(),
}));
vi.mock("@/lib/auth/client", () => client);

import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm } from "@/components/auth/RegisterForm";

beforeEach(() => vi.clearAllMocks());

describe("LoginForm", () => {
  it("shows validation errors and does not call Firebase", async () => {
    render(<LoginForm next="/dashboard" />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(client.signInWithEmail).not.toHaveBeenCalled();
  });

  it("signs in and redirects to the safe next path", async () => {
    client.signInWithEmail.mockResolvedValue({ status: "signed_in" });
    render(<LoginForm next="/family" />);
    await userEvent.type(screen.getByLabelText("Email"), "Ann@Example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/family"));
    expect(client.signInWithEmail).toHaveBeenCalledWith("ann@example.com", "secret123");
  });

  it("sends unverified users to email verification", async () => {
    client.signInWithEmail.mockResolvedValue({ status: "verify_email" });
    render(<LoginForm next="/dashboard" />);
    await userEvent.type(screen.getByLabelText("Email"), "ann@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith("/verify-email"));
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("shows a generic message for bad credentials", async () => {
    client.signInWithEmail.mockRejectedValue({ code: "auth/user-not-found" });
    render(<LoginForm next="/dashboard" />);
    await userEvent.type(screen.getByLabelText("Email"), "ann@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Email or password is incorrect.")).toBeInTheDocument();
  });

  it("switches to phone OTP and validates the number", async () => {
    render(<LoginForm next="/dashboard" />);
    await userEvent.click(screen.getByRole("tab", { name: /phone/i }));
    await userEvent.type(screen.getByLabelText("Mobile number"), "12345");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText(/international format/)).toBeInTheDocument();
    expect(client.startPhoneSignIn).not.toHaveBeenCalled();
  });

  it("completes phone OTP sign-in", async () => {
    const confirmation = { confirm: vi.fn() };
    client.startPhoneSignIn.mockResolvedValue(confirmation);
    client.confirmPhoneCode.mockResolvedValue({ status: "signed_in" });
    render(<LoginForm next="/dashboard" />);
    await userEvent.click(screen.getByRole("tab", { name: /phone/i }));
    await userEvent.type(screen.getByLabelText("Mobile number"), "+91 98765 43210");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await userEvent.type(await screen.findByLabelText(/Code sent to/), "123456");
    await userEvent.click(screen.getByRole("button", { name: /verify/i }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/dashboard"));
    expect(client.startPhoneSignIn).toHaveBeenCalledWith("+919876543210", "recaptcha-container");
    expect(client.confirmPhoneCode).toHaveBeenCalledWith(confirmation, "123456");
  });
});

describe("RegisterForm", () => {
  async function fill(overrides: Partial<Record<string, string>> = {}) {
    const v = { name: "Ann Lee", email: "ann@example.com", pw: "safe1234", confirm: "safe1234", ...overrides };
    await userEvent.type(screen.getByLabelText("Your name"), v.name);
    await userEvent.type(screen.getByLabelText("Email"), v.email);
    await userEvent.type(screen.getByLabelText("Password"), v.pw);
    await userEvent.type(screen.getByLabelText("Confirm password"), v.confirm);
  }

  it("requires consent to the terms before creating an account", async () => {
    render(<RegisterForm />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText(/must accept the terms/)).toBeInTheDocument();
    expect(client.registerWithEmail).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords", async () => {
    render(<RegisterForm />);
    await fill({ confirm: "different1" });
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();
  });

  it("registers and routes to email verification", async () => {
    client.registerWithEmail.mockResolvedValue({});
    render(<RegisterForm />);
    await fill();
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith("/verify-email"));
    expect(client.registerWithEmail).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Ann Lee", email: "ann@example.com", password: "safe1234" }),
    );
  });
});
