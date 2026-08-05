import { afterEach, describe, expect, it, vi } from "vitest";

const sendInviteEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendInviteEmail }));

import {
  buildContractorInviteJoinUrl,
  createContractorInviteToken,
  sendContractorProjectInvitationEmail,
} from "./contractorProjectInvitationEmail";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("contractor invitation delivery", () => {
  it("hashes a random token without persisting the raw token", () => {
    const token = createContractorInviteToken();
    expect(token.rawToken).toHaveLength(64);
    expect(token.tokenHash).toHaveLength(64);
    expect(token.tokenHash).not.toContain(token.rawToken);
  });

  it("uses the configured portal URL and safely defaults", () => {
    vi.stubEnv("CONTRACTOR_PORTAL_URL", "https://portal.example.test/base");
    expect(buildContractorInviteJoinUrl("abc token")).toBe("https://portal.example.test/accept-invite?token=abc+token");
    vi.stubEnv("CONTRACTOR_PORTAL_URL", "");
    expect(buildContractorInviteJoinUrl("abc")).toBe("https://contractor.doorine.com/accept-invite?token=abc");
  });

  it("passes project-specific delivery details to the established email helper", async () => {
    sendInviteEmail.mockResolvedValue({ delivered: true, messageId: "m-1" });
    const result = await sendContractorProjectInvitationEmail({
      to: "contractor@example.com",
      inviterName: "Admin User",
      companyName: "CHG Company",
      projectCode: "CHG-1",
      projectName: "Project One",
      role: "GC",
      joinUrl: "https://contractor.doorine.com/accept-invite?token=abc",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    });
    expect(result).toEqual({ delivered: true, messageId: "m-1" });
    expect(sendInviteEmail).toHaveBeenCalledWith(expect.objectContaining({ projectCode: "CHG-1", projectName: "Project One", role: "GC" }));
  });
});
