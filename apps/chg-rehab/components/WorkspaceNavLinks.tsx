"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import WorkspaceNewPill from "./WorkspaceNewPill";

type ChannelListItem = { unread: number };
type Channels = {
  team: ChannelListItem[];
  contractors: ChannelListItem[];
  investors: ChannelListItem[];
};
type ReminderFeed = { items: { id: string }[] };

const POLL_MS = 60_000;

function Badge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={label}
      style={{
        marginLeft: 6,
        minWidth: 16,
        height: 16,
        padding: "0 4px",
        background: "#d92626",
        color: "#fff",
        borderRadius: 8,
        fontSize: 10,
        lineHeight: "16px",
        fontWeight: 600,
        display: "inline-block",
        textAlign: "center",
        verticalAlign: "middle",
      }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * The WORKSPACE group in the top nav: an explicit group header followed by the
 * Command center + Messages links with active-state highlighting, the "NEW"
 * discovery pill, a live unread badge on Messages (from
 * /api/workspace/channels), and a reminder count on Command center (from
 * /api/workspace/reminders).
 */
export default function WorkspaceNavLinks() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [reminders, setReminders] = useState(0);

  const load = useCallback(async () => {
    try {
      const [chRes, remRes] = await Promise.all([
        fetch("/api/workspace/channels", { cache: "no-store" }),
        fetch("/api/workspace/reminders", { cache: "no-store" }),
      ]);
      if (chRes.ok) {
        const data = (await chRes.json()) as Channels;
        const total = [...(data.team ?? []), ...(data.contractors ?? []), ...(data.investors ?? [])].reduce(
          (sum, c) => sum + (c.unread || 0),
          0,
        );
        setUnread(total);
      }
      if (remRes.ok) {
        const data = (await remRes.json()) as ReminderFeed;
        setReminders((data.items ?? []).length);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  // Refresh promptly when the user navigates (e.g. after reading a channel).
  useEffect(() => {
    load();
  }, [pathname, load]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <span className="ws-nav-group" style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
      <span
        className="ws-nav-header"
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--stone, #8a8f98)",
          padding: "0 6px",
          whiteSpace: "nowrap",
        }}
      >
        Workspace
      </span>
      <Link
        href="/command-center"
        className={isActive("/command-center") ? "mnav-btn active" : "mnav-btn"}
      >
        Command center
        <Badge count={reminders} label={`${reminders} reminders`} />
      </Link>
      <Link
        href="/messages"
        className={isActive("/messages") ? "mnav-btn active" : "mnav-btn"}
      >
        Messages
        <Badge count={unread} label={`${unread} unread messages`} />
      </Link>
      <WorkspaceNewPill />
    </span>
  );
}
