"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ActiveReminder = {
  id: string;
  title: string;
  notes: string | null;
  tags: string[];
  dueDate: string | null;
  dueTime: string | null;
  urgency: string | null;
};

const URGENCY_COLORS: Record<string, string> = {
  low: "#10b981",
  medium: "#f59e0b",
  high: "#f97316",
  urgent: "#ef4444",
};

const TZ = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;

function todayYmd(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function nowHhmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function parseLocalDate(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fmtTime(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  let h = Number(m[1]);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ampm}`;
}

/** Due "now" in the user's local clock. */
function isDue(r: ActiveReminder): boolean {
  if (!r.dueDate) return false;
  const today = todayYmd();
  if (r.dueDate < today) return true;
  if (r.dueDate === today) return !r.dueTime || r.dueTime <= nowHhmm();
  return false;
}

export default function ReminderPopups() {
  const [reminders, setReminders] = useState<ActiveReminder[]>([]);
  // Reminders the user closed (×) for this session only — re-appear on reload.
  const hidden = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace/reminders/active", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const due: ActiveReminder[] = (data.reminders ?? []).filter(
        (r: ActiveReminder) => isDue(r) && !hidden.current.has(r.id),
      );
      setReminders(due);
    } catch {
      /* network hiccup — try again next tick */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const dismiss = async (id: string) => {
    hidden.current.add(id);
    setReminders((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/workspace/reminders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dismissed: true }),
    }).catch(() => {});
  };

  const snooze = async (id: string) => {
    const next = new Date(Date.now() + 60 * 60 * 1000);
    // Derive BOTH date and time from the same instant so a near-midnight
    // snooze (e.g. 23:30 -> 00:30) rolls the date forward too.
    const dueDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    const dueTime = `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
    hidden.current.add(id);
    setReminders((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/workspace/reminders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dueDate, dueTime }),
    }).catch(() => {});
    // Allow it to surface again once the snooze elapses.
    window.setTimeout(() => hidden.current.delete(id), 60 * 60 * 1000);
  };

  if (!reminders.length) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: 340,
        maxWidth: "calc(100vw - 40px)",
      }}
    >
      {reminders.map((r) => {
        const color = URGENCY_COLORS[r.urgency ?? "medium"] ?? URGENCY_COLORS.medium;
        const d = r.dueDate ? parseLocalDate(r.dueDate) : null;
        const dateStr =
          r.dueDate === todayYmd()
            ? "Today"
            : d
              ? d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: TZ })
              : r.dueDate;
        const when = `${dateStr}${r.dueTime ? ` · ${fmtTime(r.dueTime)}` : ""}`;
        return (
          <div
            key={r.id}
            style={{
              background: "var(--paper, #fbf8f2)",
              border: "1px solid var(--border-1, #e7e1d6)",
              borderLeft: `4px solid ${color}`,
              borderRadius: 14,
              boxShadow: "0 12px 32px rgba(60, 50, 30, 0.18)",
              padding: "14px 16px",
              color: "var(--ink, #2a2620)",
              fontFamily: "inherit",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ fontSize: 16, lineHeight: "20px" }}>🔔</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: "var(--quill, #7a7264)", marginTop: 2 }}>{when}</div>
              </div>
              <button
                type="button"
                onClick={() => { hidden.current.add(r.id); setReminders((prev) => prev.filter((x) => x.id !== r.id)); }}
                aria-label="Close"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--stone, #a59b88)", fontSize: 16, lineHeight: 1, padding: 0 }}
              >×</button>
            </div>
            {r.notes ? (
              <div style={{ fontSize: 12.5, color: "var(--ink, #2a2620)", marginTop: 8, whiteSpace: "pre-wrap" }}>{r.notes}</div>
            ) : null}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => dismiss(r.id)}
                style={{
                  flex: 1,
                  padding: "7px 10px",
                  borderRadius: 8,
                  border: "none",
                  background: color,
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 12.5,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >Dismiss</button>
              <button
                type="button"
                onClick={() => snooze(r.id)}
                style={{
                  flex: 1,
                  padding: "7px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border-1, #e7e1d6)",
                  background: "transparent",
                  color: "var(--ink, #2a2620)",
                  fontWeight: 600,
                  fontSize: 12.5,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >Snooze 1 hour</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
