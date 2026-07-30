import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import TeamSettingsClient from "@/app/settings/team/Client";
import DepartmentsPanel from "@/app/admin/DepartmentsPanel";

const response = (body: unknown, ok = true, status = ok ? 200 : 500) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Team settings states", () => {
  const props = { userName: "Nicole Gomez", userEmail: "nicole@example.com", role: "Admin" };

  it("does not present an unresolved team request as empty", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<TeamSettingsClient {...props} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading team");
    expect(screen.queryByText("Your team is ready to grow.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send invite" })).not.toBeInTheDocument();
  });

  it("renders load failure instead of empty member and invite states", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ error: "Database unavailable" }, false)));
    render(<TeamSettingsClient {...props} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load team");
    expect(screen.queryByText("Your team is ready to grow.")).not.toBeInTheDocument();
    expect(screen.queryByText("No invitations are waiting.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send invite" })).not.toBeInTheDocument();
  });

  it("keeps the existing Admin invitation path in the true-empty state", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ members: [], pendingInvites: [], customRoles: [] })));
    render(<TeamSettingsClient {...props} />);

    expect(await screen.findByText("Your team is ready to grow.")).toBeInTheDocument();
    expect(screen.getByText("No invitations are waiting.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("teammate@company.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send invite" })).toBeInTheDocument();
  });

  it("keeps non-Admin empty states permission-limited", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ members: [], pendingInvites: [], customRoles: [] })));
    render(<TeamSettingsClient {...props} role="ProjectManager" />);

    expect(await screen.findByText("Your team is ready to grow.")).toBeInTheDocument();
    expect(screen.getByText("Only account admins can invite teammates.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send invite" })).not.toBeInTheDocument();
  });

  it("retains populated team data and Admin role controls", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({
      members: [{ id: "member-1", email: "alex@example.com", name: "Alex Morgan", role: "ProjectManager", customRoleId: null, joinedAt: "2026-07-01T00:00:00.000Z" }],
      pendingInvites: [],
      customRoles: [],
    })));
    render(<TeamSettingsClient {...props} />);

    expect(await screen.findByText("Alex Morgan")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(screen.queryByText("Your team is ready to grow.")).not.toBeInTheDocument();
  });

  it("recovers from a failed team load through the existing retry", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response({ error: "Temporary failure" }, false))
      .mockImplementationOnce(() => response({ members: [], pendingInvites: [], customRoles: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<TeamSettingsClient {...props} />);

    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Your team is ready to grow.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("Departments states", () => {
  it("does not present an unresolved departments request as empty", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<DepartmentsPanel />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading departments");
    expect(screen.queryByText("No departments yet.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New Department/ })).not.toBeInTheDocument();
  });

  it("renders a retryable load failure instead of the empty state", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ error: "Database unavailable" }, false)));
    render(<DepartmentsPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load departments");
    expect(screen.queryByText("No departments yet.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New Department/ })).not.toBeInTheDocument();
  });

  it("renders load failure when a successful response contains invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    } as Response)));
    render(<DepartmentsPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load departments");
    expect(screen.queryByText("No departments yet.")).not.toBeInTheDocument();
  });

  it("renders load failure when a successful response has a malformed spaces payload", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ spaces: [{ id: "space-1", name: 42, color: null }] })));
    render(<DepartmentsPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load departments");
    expect(screen.queryByText("No departments yet.")).not.toBeInTheDocument();
  });

  it("reuses the existing New Department path in the true-empty state", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ spaces: [] })));
    render(<DepartmentsPanel />);

    expect(await screen.findByText("No departments yet.")).toBeInTheDocument();
    expect(screen.getByText("Create your first department to organize lists, statuses, and workspace tasks.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New Department/ })).toBeInTheDocument();
  });

  it("retains populated departments and management controls", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ spaces: [{ id: "space-1", name: "Acquisitions", color: "#1F4D5C" }] })));
    render(<DepartmentsPanel />);

    expect(await screen.findByText("Acquisitions")).toBeInTheDocument();
    expect(screen.getByTitle("Rename department")).toBeInTheDocument();
    expect(screen.getByTitle("Delete department")).toBeInTheDocument();
    expect(screen.queryByText("No departments yet.")).not.toBeInTheDocument();
  });

  it("recovers from a failed departments load through retry", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response({ error: "Temporary failure" }, false))
      .mockImplementationOnce(() => response({ spaces: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DepartmentsPanel />);

    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No departments yet.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
