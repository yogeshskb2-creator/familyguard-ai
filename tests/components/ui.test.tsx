import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button, Input } from "@/components/ui";
import { SharingIndicator } from "@/components/layout/SharingIndicator";
import { LocationSharingProvider } from "@/components/location/LocationSharingProvider";
import { NO_CONSENT } from "@/lib/location/consent";

describe("Button", () => {
  it("fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Share</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
  it("is disabled and busy while loading", async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });
  it("defaults to type=button so it never submits forms by accident", () => {
    render(<Button>X</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});

describe("Input", () => {
  it("links label and error message accessibly", () => {
    render(<Input label="Email" error="Enter a valid email" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a valid email");
  });
});

describe("SharingIndicator", () => {
  const consent = (active: boolean) => ({ ...NO_CONSENT, active });
  const renderWith = (active: boolean) =>
    render(
      <LocationSharingProvider enabled={false} initialConsent={consent(active)}>
        <SharingIndicator />
      </LocationSharingProvider>,
    );

  it("clearly announces when location sharing is off", () => {
    renderWith(false);
    const link = screen.getByRole("link", { name: /location sharing is off/i });
    expect(link).toHaveAttribute("href", "/settings#location");
    expect(link).toHaveAttribute("data-status", "off");
  });

  it("never looks 'off' while consent is active, even if this device isn't sending", () => {
    renderWith(true);
    const link = screen.getByRole("link", { name: /location sharing is on but paused on this device/i });
    expect(link).toHaveAttribute("data-status", "paused");
  });
});
