import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

vi.mock("@/components/workspace/tasks/TaskBoardView", () => ({ default: () => <div>Task board</div> }));
vi.mock("@/components/workspace/tasks/TaskGlassModal", () => ({ default: () => null }));
vi.mock("@/components/workspace/tasks/TaskListView", () => ({
  default: ({ tasks }: { tasks: unknown[] }) => (
    <div>{tasks.length === 0 ? "No tasks here yet." : `${tasks.length} tasks`}</div>
  ),
}));
vi.mock("@/components/workspace/CreateTaskModal", () => ({ default: () => null }));
vi.mock("@/components/workspace/ReminderModal", () => ({ default: () => null }));

import MyTasksPage from "@/app/workspace/tasks/page";
import CalendarTab from "@/components/workspace/CalendarTab";
import RemindersTab from "@/components/workspace/RemindersTab";
import { propertyTitle } from "@/lib/propertyTitle";

const response = (body: unknown, ok = true, status = ok ? 200 : 500) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("property title normalization", () => {
  it("does not duplicate a city already present in the address", () => {
    expect(propertyTitle({
      address: "123 Main St, Springfield",
      city: "Springfield",
      state: "IL",
    })).toBe("123 Main St, Springfield, IL");
  });

  it("does not append location parts already present as normalized tokens", () => {
    expect(propertyTitle({
      address: "123 Main St, Springfield, IL",
      city: "Springfield",
      state: "IL",
    })).toBe("123 Main St, Springfield, IL");
  });

  it("does not treat an ordinary word as a state suffix", () => {
    expect(propertyTitle({
      address: "123 Main St in Gary",
      city: "Gary",
      state: "IN",
    })).toBe("123 Main St in Gary, IN");
  });

  it("recognizes punctuated state abbreviations and ZIP suffixes", () => {
    expect(propertyTitle({ address: "12 State St, Albany, N.Y.", city: "Albany", state: "NY" }))
      .toBe("12 State St, Albany, N.Y.");
    expect(propertyTitle({ address: "123 Main St, Springfield, IL 62704", city: "Springfield", state: "IL" }))
      .toBe("123 Main St, Springfield, IL 62704");
  });
});

describe("workspace request failures", () => {
  it("does not present a failed Tasks request as empty", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/workspace/tasks?")) {
        attempts += 1;
        return attempts === 1 ? response({ error: "Tasks unavailable" }, false) : response({ tasks: [] });
      }
      if (url === "/api/pm/spaces") return response({ spaces: [] });
      if (url === "/api/workspace/mentions") return response({ users: [] });
      return response({});
    }));

    render(<MyTasksPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load tasks");
    expect(screen.queryByText("No tasks here yet.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No tasks here yet.")).toBeInTheDocument();
  });

  it("rejects malformed task records instead of rendering or false-emptying", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/workspace/tasks?")) return response({ tasks: [null] });
      if (url === "/api/pm/spaces") return response({ spaces: [] });
      if (url === "/api/workspace/mentions") return response({ users: [] });
      return response({});
    }));

    render(<MyTasksPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load tasks");
    expect(screen.queryByText("No tasks here yet.")).not.toBeInTheDocument();
  });

  it("does not present a failed Calendar request as empty", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/workspace/calendar?")) {
        attempts += 1;
        return attempts === 1 ? response({ error: "Calendar unavailable" }, false) : response({ events: [] });
      }
      if (url === "/api/pm/spaces") return response({ spaces: [] });
      return response({});
    }));

    render(<CalendarTab />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load calendar");
    expect(screen.queryByText("No upcoming events this month")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No upcoming events this month")).toBeInTheDocument();
  });

  it("rejects malformed calendar records instead of rendering or false-emptying", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/workspace/calendar?")) return response({ events: [null] });
      if (url === "/api/pm/spaces") return response({ spaces: [] });
      return response({});
    }));

    render(<CalendarTab />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load calendar");
    expect(screen.queryByText("No upcoming events this month")).not.toBeInTheDocument();
  });

  it("rejects reminder calendar events without their editable payload", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/workspace/calendar?")) {
        return response({ events: [{ id: "reminder:1", title: "Call owner", when: new Date().toISOString(), kind: "reminder", link: null }] });
      }
      if (url === "/api/pm/spaces") return response({ spaces: [] });
      return response({});
    }));

    render(<CalendarTab />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load calendar");
  });

  it("ignores a stale Calendar response after a newer refresh completes", async () => {
    const first = deferred<Response>();
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/workspace/calendar?")) {
        attempts += 1;
        return attempts === 1 ? first.promise : response({ events: [] });
      }
      if (url === "/api/pm/spaces") return response({ spaces: [] });
      return response({});
    }));

    const { rerender } = render(<CalendarTab refreshKey={0} />);
    await waitFor(() => expect(attempts).toBe(1));
    rerender(<CalendarTab refreshKey={1} />);
    expect(await screen.findByText("No upcoming events this month")).toBeInTheDocument();

    await act(async () => {
      first.resolve(await response({ events: [{ id: "stale", title: "Stale event", when: new Date().toISOString(), kind: "event", link: null }] }));
    });
    expect(screen.queryByText("Stale event")).not.toBeInTheDocument();
  });

  it("keeps Calendar loading when a stale request finishes before the current request", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/workspace/calendar?")) {
        attempts += 1;
        return attempts === 1 ? first.promise : second.promise;
      }
      if (url === "/api/pm/spaces") return response({ spaces: [] });
      return response({});
    }));

    const { rerender } = render(<CalendarTab refreshKey={0} />);
    await waitFor(() => expect(attempts).toBe(1));
    rerender(<CalendarTab refreshKey={1} />);
    await waitFor(() => expect(attempts).toBe(2));

    await act(async () => {
      first.resolve(await response({ events: [] }));
    });
    expect(screen.getByRole("heading", { name: "Loading calendar…" })).toBeInTheDocument();

    await act(async () => {
      second.resolve(await response({ events: [] }));
    });
    expect(await screen.findByText("No upcoming events this month")).toBeInTheDocument();
  });

  it("does not present a failed Reminders request as all caught up", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(() => {
      attempts += 1;
      return attempts === 1 ? response({ error: "Reminders unavailable" }, false) : response({ items: [] });
    }));

    render(<RemindersTab />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load reminders");
    expect(screen.queryByText("You're all caught up. ✨")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("You're all caught up. ✨")).toBeInTheDocument();
  });

  it("rejects malformed reminder records instead of rendering or false-emptying", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ items: [null] })));

    render(<RemindersTab />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load reminders");
    expect(screen.queryByText("You're all caught up. ✨")).not.toBeInTheDocument();
  });

  it("rejects manual reminders without their real mutation id", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ items: [{
      id: "manual:1",
      title: "Call owner",
      source: "Reminder",
      link: null,
      when: null,
      urgent: false,
      kind: "manual",
      notes: null,
      tags: [],
      dueDate: null,
      dueTime: null,
      urgency: "medium",
      assigneeId: null,
      assigneeName: null,
      assigneeInitials: null,
    }] })));

    render(<RemindersTab />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load reminders");
  });

  it("ignores a stale Reminders response after a newer refresh completes", async () => {
    const first = deferred<Response>();
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(() => {
      attempts += 1;
      return attempts === 1 ? first.promise : response({ items: [] });
    }));

    const { rerender } = render(<RemindersTab refreshKey={0} />);
    await waitFor(() => expect(attempts).toBe(1));
    rerender(<RemindersTab refreshKey={1} />);
    expect(await screen.findByText("You're all caught up. ✨")).toBeInTheDocument();

    await act(async () => {
      first.resolve(await response({ items: [{ id: "stale", title: "Stale reminder", source: "Tasks", link: null, when: null, urgent: false, kind: "task" }] }));
    });
    expect(screen.queryByText("Stale reminder")).not.toBeInTheDocument();
  });

  it("keeps Reminders loading when a stale request finishes before the current request", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(() => {
      attempts += 1;
      return attempts === 1 ? first.promise : second.promise;
    }));

    const { rerender } = render(<RemindersTab refreshKey={0} />);
    await waitFor(() => expect(attempts).toBe(1));
    rerender(<RemindersTab refreshKey={1} />);
    await waitFor(() => expect(attempts).toBe(2));

    await act(async () => {
      first.resolve(await response({ items: [] }));
    });
    expect(screen.getByText("Loading reminders…")).toBeInTheDocument();

    await act(async () => {
      second.resolve(await response({ items: [] }));
    });
    expect(await screen.findByText("You're all caught up. ✨")).toBeInTheDocument();
  });
});
