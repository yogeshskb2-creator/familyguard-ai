import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

export const routerMock = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() };

vi.mock("next/navigation", () => ({
  usePathname: () => (globalThis as { __pathname?: string }).__pathname ?? "/dashboard",
  useRouter: () => routerMock,
}));
