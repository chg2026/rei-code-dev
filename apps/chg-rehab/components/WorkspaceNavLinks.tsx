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

const POLL_MS = 60_000;

/**
 * The WORKSPACE group in the top nav: Command center + Messages links with
 * active-state highlighting, the "NEW" discovery pill, and a live unread
 * badge on Messages sourced from /api/workspace/channels.
 */
export default function WorkspaceNavLinks() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  const loadUnread = useCallback(async () => {
    try {
      const r = await fetch("/api/workspace/channels", { cache: "no-store" });
      if (!r.ok) return;
      const data = (await r.json()) as Channels;
      const total = [...(data.team ?? []), ...(data.contractors ?? []), ...(data.investors ?? [])].reduce(
        (sum, c) => sum + (c.unread || 0),
        0,
      );
      setUnread(total);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadUnread();
    const id = window.setInterval(loadUnread, POLL_MS);
    return () => window.clearInterval(id);
  }, [loadUnread]);

  // Refresh the badge promptly when the user navigates (e.g. after reading a channel).
  useEffect(() => {
    loadUnread();
  }, [pathname, loadUnread]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <span className="ws-nav-group" style={{ display: "inline-flex", alignItems: "center" }}>
      <Link
        href="/command-center"
        className={isActive("/command-center") ? "mnav-btn active" : "mnav-btn"}
      >
        Command center
      </Link>
      <Link
        href="/messages"
        className={isActive("/messages") ? "mnav-btn active" : "mnav-btn"}
        style={{ position: "relative" }}
      >
        Messages
        {unread > 0 ? (
          <span
            aria-label={`${unread} unread messages`}
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
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Link>
      <WorkspaceNewPill />
    </span>
  );
}
