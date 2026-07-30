import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import BillingPage from "@/app/billing/page";

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.redirect.mockClear();
});

describe("legacy billing route", () => {
  it("preserves login enforcement", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    await expect(BillingPage()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("keeps non-Admins out of the Admin billing workflow", async () => {
    mocks.getCurrentUser.mockResolvedValue({ role: "ProjectManager" });

    await expect(BillingPage()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("forwards Admins to the authoritative same-origin billing panel", async () => {
    mocks.getCurrentUser.mockResolvedValue({ role: "Admin" });

    await expect(BillingPage()).rejects.toThrow("NEXT_REDIRECT:/admin?panel=billing");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin?panel=billing");
  });
});
