import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MobileNav } from "@/components/layout/MobileNav";
import { Sidebar } from "@/components/layout/Sidebar";

describe("app shell navigation", () => {
  it("marks the current page in the sidebar", () => {
    (globalThis as { __pathname?: string }).__pathname = "/family";
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Family" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });
  it("renders the mobile bar with SOS reachable", () => {
    (globalThis as { __pathname?: string }).__pathname = "/dashboard";
    render(<MobileNav />);
    expect(screen.getByRole("link", { name: /sos/i })).toHaveAttribute("href", "/sos");
  });
});
