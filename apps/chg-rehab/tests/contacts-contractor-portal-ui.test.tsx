// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactSidePanel } from "@/app/contacts/ContactSidePanel";
import type { DirectoryContact } from "@/app/contacts/contactDirectoryHelpers";

vi.mock("@/app/contacts/EmailOptOutToggle", () => ({ EmailOptOutToggle: () => null }));
vi.mock("@/app/contacts/[id]/ComplianceDocManager", () => ({
  AddComplianceDocButton: () => null,
  RenewComplianceDocButton: () => null,
  ComplianceDocVersions: () => null,
}));

const contact: DirectoryContact = {
  id: "contact-1",
  type: "Contractor",
  name: "Current Contractor",
  company: "Trade Co",
  email: "contractor@example.com",
  phone: null,
  address: null,
  title: null,
  website: null,
  tradeCategory: null,
  rating: null,
  status: "Active",
  emailOptOut: false,
  emailOptOutAt: null,
  notes: null,
  tags: [],
  compliance: null,
  managedDocs: [],
  contractorPortalAccountId: null,
  contractorPortalLinkStatus: "AccountFound",
};

describe("ContactSidePanel contractor portal linking", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
  });

  it("shows the successful status and notifies the parent to refresh directory data", async () => {
    const onPortalUpdated = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ contact: { contractorPortalLinkStatus: "Linked" } }),
    }));

    render(
      <ContactSidePanel
        contact={contact}
        isAdmin={false}
        canEdit
        canEditDocs={false}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onPortalUpdated={onPortalUpdated}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Check / link existing account" }));

    await waitFor(() => {
      expect(screen.getByText("Portal: linked")).toBeInTheDocument();
      expect(onPortalUpdated).toHaveBeenCalledTimes(1);
    });
  });
});
