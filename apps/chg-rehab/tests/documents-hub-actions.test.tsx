import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock("@/lib/useBillingHealth", () => ({
  useBillingGateProps: () => ({
    disabled: false,
    title: undefined,
    style: undefined,
  }),
}));

import DocsClient from "@/app/docs/Client";

const baseProps = {
  thresholdDays: 30,
  projects: [],
  properties: [],
  contacts: [],
  canEdit: true,
  filters: {
    level: "Property" as const,
    status: "all-status" as const,
    cat: "cat-all",
    q: "",
  },
  counts: {
    levelCounts: { Project: 0, Property: 1, Company: 0, Contact: 0 },
    statusCounts: { "all-status": 1, active: 1, expiring: 0, expired: 0 },
    catCounts: { "cat-all": 1, contracts: 1 },
  },
};

describe("Documents Hub action layout contract", () => {
  it("owns its table geometry and exposes named file actions", () => {
    const { container } = render(
      <DocsClient
        {...baseProps}
        docs={[
          {
            id: "doc-1",
            name: "A very long property document name that must not push actions into other columns.pdf",
            level: "Property",
            category: "contracts",
            status: "Active",
            expiresAt: null,
            uploadedAt: "2026-07-30T12:00:00.000Z",
            fileKey: "documents/doc-1.pdf",
            meta: "PROP-001",
            projectId: null,
            propertyId: "property-1",
            contactId: null,
            eff: "active",
          },
        ]}
      />
    );

    expect(container.querySelector(".documents-hub")).toBeInTheDocument();
    expect(container.querySelector(".documents-hub-table-scroll")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View A very long property document name that must not push actions into other columns.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview A very long property document name that must not push actions into other columns.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download A very long property document name that must not push actions into other columns.pdf" })).toHaveAttribute(
      "href",
      "/api/documents/doc-1/download"
    );
    expect(screen.getByRole("button", { name: "Delete A very long property document name that must not push actions into other columns.pdf" })).toBeInTheDocument();
  });
});
