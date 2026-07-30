import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock("@/components/workspace/CreateTaskModal", () => ({
  default: () => null,
}));

import GoalsTab from "@/components/workspace/GoalsTab";
import MessagesPage from "@/app/messages/page";

const response = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const message = (id: string, body: string, createdAt: string) => ({
  id,
  body,
  createdAt,
  mine: false,
  authorName: "Alex Morgan",
  authorInitials: "AM",
  convertedTaskId: null,
  convertedTaskTitle: null,
});

function messageFetch(
  channels: unknown | Promise<never>,
  channelOk = true,
  role: string | Promise<never> = "Member",
  messages?: unknown | Promise<never>,
  messagesOk = true
) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/workspace/mentions") return response({ users: [] });
    if (url === "/api/auth/user") {
      if (role instanceof Promise) return role;
      if (role === "__ERROR__") return response({ error: "failed" }, false);
      return response({ user: { role } });
    }
    if (url === "/api/workspace/channels") {
      if (channels instanceof Promise) return channels;
      return response(channels, channelOk);
    }
    if (url.endsWith("/read")) return response({ ok: true });
    if (url.includes("/messages")) {
      if (messages instanceof Promise) return messages;
      return response(messages ?? { messages: [] }, messagesOk);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe("Goals workspace states", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("does not present an unresolved goals request as empty", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<GoalsTab />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading goals");
    expect(screen.queryByText("No company goals yet.")).not.toBeInTheDocument();
  });

  it("shows a failed state with the existing load retry path", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response({ error: "failed" }, false))
      .mockImplementationOnce(() => response({ goals: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<GoalsTab />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load goals");
    expect(screen.queryByText("No company goals yet.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No company goals yet.")).toBeInTheDocument();
  });

  it("shows distinct company and individual true-empty guidance", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ goals: [] })));
    render(<GoalsTab />);

    expect(await screen.findByText("No company goals yet.")).toBeInTheDocument();
    expect(screen.getByText("No individual goals yet.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "+ Goal" })).toHaveLength(2);
  });
});

describe("Messages workspace states", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("does not present an unresolved channel request as empty", () => {
    const pending = new Promise<never>(() => undefined);
    vi.stubGlobal("fetch", vi.fn(() => pending));
    render(<MessagesPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading conversations");
    expect(screen.queryByText("Pick a channel to start chatting.")).not.toBeInTheDocument();
  });

  it("shows a channel failure separately from a true-empty workspace", async () => {
    vi.stubGlobal("fetch", messageFetch({ error: "failed" }, false));
    render(<MessagesPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load conversations");
    expect(screen.queryByText("No conversations yet.")).not.toBeInTheDocument();
  });

  it("shows permission-aware guidance when no channels exist", async () => {
    vi.stubGlobal("fetch", messageFetch({ team: [], contractors: [], investors: [] }));
    render(<MessagesPage />);

    expect(await screen.findByText("No conversations yet.")).toBeInTheDocument();
    expect(screen.getByText("Ask an administrator to create a team channel.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create team channel" })).not.toBeInTheDocument();
  });

  it("reuses the existing channel creation path for administrators", async () => {
    vi.stubGlobal("fetch", messageFetch({ team: [], contractors: [], investors: [] }, true, "Admin"));
    render(<MessagesPage />);

    expect(await screen.findByRole("button", { name: "Create team channel" })).toBeInTheDocument();
    expect(screen.queryByText("Ask an administrator to create a team channel.")).not.toBeInTheDocument();
  });

  it("does not treat unresolved channel permission as denial", async () => {
    const pending = new Promise<never>(() => undefined);
    vi.stubGlobal("fetch", messageFetch({ team: [], contractors: [], investors: [] }, true, pending));
    render(<MessagesPage />);

    expect(await screen.findByText("Checking channel creation access…")).toBeInTheDocument();
    expect(screen.queryByText("Ask an administrator to create a team channel.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create team channel" })).not.toBeInTheDocument();
  });

  it("distinguishes unavailable permission lookup from non-admin access", async () => {
    vi.stubGlobal("fetch", messageFetch({ team: [], contractors: [], investors: [] }, true, "__ERROR__"));
    render(<MessagesPage />);

    expect(await screen.findByText("Channel creation access could not be verified. Refresh to try again.")).toBeInTheDocument();
    expect(screen.queryByText("Ask an administrator to create a team channel.")).not.toBeInTheDocument();
  });

  it("does not present an unresolved message request as an empty thread", async () => {
    const pending = new Promise<never>(() => undefined);
    const channels = {
      team: [{ id: "channel-1", kind: "team", name: "Operations", preview: null, previewAt: null, unread: 0 }],
      contractors: [],
      investors: [],
    };
    vi.stubGlobal("fetch", messageFetch(channels, true, "Member", pending));
    render(<MessagesPage />);

    expect(await screen.findByText("Loading messages…")).toBeInTheDocument();
    expect(screen.queryByText("No messages yet.")).not.toBeInTheDocument();
  });

  it("shows a message failure separately from an empty thread", async () => {
    const channels = {
      team: [{ id: "channel-1", kind: "team", name: "Operations", preview: null, previewAt: null, unread: 0 }],
      contractors: [],
      investors: [],
    };
    vi.stubGlobal("fetch", messageFetch(channels, true, "Member", { error: "failed" }, false));
    render(<MessagesPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load messages");
    expect(screen.queryByText("No messages yet.")).not.toBeInTheDocument();
  });

  it("ignores a stale full response after switching channels", async () => {
    const user = userEvent.setup();
    const channelA = deferred<Response>();
    const channelB = deferred<Response>();
    const channels = {
      team: [
        { id: "channel-a", kind: "team", name: "Channel A", preview: null, previewAt: null, unread: 0 },
        { id: "channel-b", kind: "team", name: "Channel B", preview: null, previewAt: null, unread: 0 },
      ],
      contractors: [],
      investors: [],
    };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/workspace/mentions") return response({ users: [] });
      if (url === "/api/auth/user") return response({ user: { role: "Member" } });
      if (url === "/api/workspace/channels") return response(channels);
      if (url.endsWith("/read")) return response({ ok: true });
      if (url.includes("channel-a/messages")) return channelA.promise;
      if (url.includes("channel-b/messages")) return channelB.promise;
      throw new Error(`Unexpected fetch: ${url}`);
    }));
    render(<MessagesPage />);

    await screen.findByText("Loading messages…");
    await user.click(screen.getByText("Channel B"));

    channelB.resolve({
      ok: true,
      json: () => Promise.resolve({ messages: [message("message-b", "Message B", "2026-07-30T15:00:00.000Z")] }),
    } as Response);
    expect(await screen.findByText("Message B")).toBeInTheDocument();

    await act(async () => {
      channelA.resolve({
        ok: true,
        json: () => Promise.resolve({ messages: [message("message-a", "Message A", "2026-07-30T14:00:00.000Z")] }),
      } as Response);
      await Promise.resolve();
    });

    expect(screen.getByText("Message B")).toBeInTheDocument();
    expect(screen.queryByText("Message A")).not.toBeInTheDocument();
  });

  it("prevents overlapping polls and deduplicates incremental messages", async () => {
    vi.useFakeTimers();
    const poll = deferred<Response>();
    let incrementalCalls = 0;
    const channels = {
      team: [{ id: "channel-1", kind: "team", name: "Operations", preview: null, previewAt: null, unread: 0 }],
      contractors: [],
      investors: [],
    };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/workspace/mentions") return response({ users: [] });
      if (url === "/api/auth/user") return response({ user: { role: "Member" } });
      if (url === "/api/workspace/channels") return response(channels);
      if (url.endsWith("/read")) return response({ ok: true });
      if (url.includes("?after=")) { incrementalCalls += 1; return poll.promise; }
      if (url.includes("/messages")) {
        return response({ messages: [message("message-1", "Message 1", "2026-07-30T15:00:00.000Z")] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));
    render(<MessagesPage />);

    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByText("Message 1")).toBeInTheDocument();

    await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve(); });
    expect(incrementalCalls).toBe(1);

    await act(async () => {
      poll.resolve({
        ok: true,
        json: () => Promise.resolve({ messages: [
          message("message-1", "Message 1", "2026-07-30T15:00:00.000Z"),
          message("message-2", "Message 2", "2026-07-30T15:01:00.000Z"),
        ] }),
      } as Response);
      await Promise.resolve();
    });

    expect(screen.getAllByText("Message 1")).toHaveLength(1);
    expect(screen.getByText("Message 2")).toBeInTheDocument();
    vi.useRealTimers();
  });
});
