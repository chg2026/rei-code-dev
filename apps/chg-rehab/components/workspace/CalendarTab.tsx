"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import s from "./styles.module.css";
import CreateTaskModal from "./CreateTaskModal";
import ReminderModal, { ReminderDraft } from "./ReminderModal";

type ReminderPayload = {
  id: string;
  title: string;
  notes: string | null;
  tags: string[];
  dueDate: string | null;
  dueTime: string | null;
  urgency: string | null;
  assigneeId: string | null;
  assigneeName?: string | null;
  assigneeInitials?: string | null;
};
type Ev = { id: string; title: string; when: string; kind: string; link: string | null; color?: string | null; reminder?: ReminderPayload };
type SpaceLite = { id: string; name: string; color: string | null };

const KIND_LABELS: Record<string, string> = {
  task: "Task due",
  "pm-task": "PM Task",
  deal: "Pipeline",
  project: "Rehab",
  milestone: "Milestone",
  doc: "Document",
  distribution: "Distribution",
  event: "Event",
  reminder: "Reminder",
};

const KIND_COLORS: Record<string, string> = {
  task: "#6366f1",
  "pm-task": "#f59e0b",
  deal: "#10b981",
  project: "#3b82f6",
  milestone: "#8b5cf6",
  doc: "#ef4444",
  distribution: "#06b6d4",
  event: "#6b7280",
  reminder: "#f97316",
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarTab({
  refreshKey = 0,
  onReminderSaved,
}: {
  refreshKey?: number;
  onReminderSaved?: () => void;
} = {}) {
  // Initialised on the client only (in useEffect) to avoid SSR/CSR TZ drift.
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDate, setCreateDate] = useState<string | null>(null);
  const [editingReminder, setEditingReminder] = useState<ReminderDraft | null>(null);
  const [spaces, setSpaces] = useState<SpaceLite[]>([]);

  useEffect(() => {
    const n = new Date();
    setCursor({ y: n.getFullYear(), m: n.getMonth() + 1 });
  }, []);

  useEffect(() => {
    fetch("/api/pm/spaces")
      .then((r) => (r.ok ? r.json() : { spaces: [] }))
      .then((d) => setSpaces((d.spaces ?? []).map((x: { id: string; name: string; color?: string | null }) => ({ id: x.id, name: x.name, color: x.color ?? null }))))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    if (!cursor) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/workspace/calendar?month=${cursor.y}-${String(cursor.m).padStart(2, "0")}`, { cache: "no-store" });
      const data = await r.json();
      setEvents(data.events ?? []);
    } finally { setLoading(false); }
  }, [cursor]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const openReminder = useCallback((ev: Ev) => {
    if (!ev.reminder) return;
    setEditingReminder({
      id: ev.reminder.id,
      title: ev.reminder.title,
      notes: ev.reminder.notes,
      tags: ev.reminder.tags ?? [],
      dueDate: ev.reminder.dueDate,
      dueTime: ev.reminder.dueTime,
      urgency: ev.reminder.urgency ?? "medium",
      assigneeId: ev.reminder.assigneeId,
    });
  }, []);

  const { cells, byDay } = useMemo(() => {
    if (!cursor) return { cells: [] as { date: Date; inMonth: boolean }[], byDay: new Map<string, Ev[]>() };
    const first = new Date(cursor.y, cursor.m - 1, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(cursor.y, cursor.m, 0).getDate();
    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < startDow; i++) {
      cells.push({ date: new Date(cursor.y, cursor.m - 1, -(startDow - 1 - i)), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(cursor.y, cursor.m - 1, d), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ date: new Date(cursor.y, cursor.m - 1, daysInMonth + (cells.length - startDow - daysInMonth + 1)), inMonth: false });
    }
    const byDay = new Map<string, Ev[]>();
    for (const e of events) {
      const d = new Date(e.when);
      const key = ymd(d);
      const arr = byDay.get(key) ?? [];
      arr.push(e);
      byDay.set(key, arr);
    }
    return { cells, byDay };
  }, [cursor, events]);

  const monthLabel = useMemo(() => {
    if (!cursor) return "";
    return new Date(cursor.y, cursor.m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [cursor]);
  const todayKey = cursor ? ymd(new Date()) : "";

  const upcoming = useMemo(() => {
    if (!cursor) return [] as Ev[];
    const now = new Date();
    return events.filter((e) => new Date(e.when) >= now).slice(0, 8);
  }, [cursor, events]);

  // Render nothing on the server / first client paint to keep markup identical.
  if (!cursor) return <div className={s.calWrap}><div className={s.empty}>Loading calendar…</div></div>;

  return (
    <div className={s.calWrap}>
      <div>
        {spaces.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "0 0 10px", fontSize: 12, color: "var(--quill)" }}>
            <span style={{ fontWeight: 600 }}>Departments:</span>
            {spaces.map((sp) => (
              <span key={sp.id} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: sp.color ?? "#6366f1", display: "inline-block" }} />
                {sp.name}
              </span>
            ))}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: KIND_COLORS.reminder, display: "inline-block" }} />
              Reminder
            </span>
          </div>
        ) : null}
        <div className={s.calGrid}>
          <div className={s.calNav}>
            <button type="button" className={`${s.btn} ${s.ghost} ${s.small}`} onClick={() => {
              setCursor((c) => !c ? c : (c.m === 1 ? { y: c.y - 1, m: 12 } : { y: c.y, m: c.m - 1 }));
            }}>‹</button>
            <span className={s.calMonth}>{monthLabel}</span>
            <button type="button" className={`${s.btn} ${s.ghost} ${s.small}`} onClick={() => {
              setCursor((c) => !c ? c : (c.m === 12 ? { y: c.y + 1, m: 1 } : { y: c.y, m: c.m + 1 }));
            }}>›</button>
          </div>
          <div className={s.calHead}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className={s.calBody}>
            {cells.map((c, i) => {
              const key = ymd(c.date);
              const dayEvents = byDay.get(key) ?? [];
              return (
                <div
                  key={i}
                  className={`${s.calCell} ${c.inMonth ? "" : s.muted} ${key === todayKey ? s.today : ""}`}
                  style={{ cursor: "default" }}
                  onMouseEnter={c.inMonth ? (e) => { e.currentTarget.style.background = "rgba(0,0,0,0.03)"; } : undefined}
                  onMouseLeave={c.inMonth ? (e) => { e.currentTarget.style.background = ""; } : undefined}
                >
                  <div>{c.date.getDate()}</div>
                  {c.inMonth ? (
                    <button
                      type="button"
                      className={s.calAddBtn}
                      title="New task"
                      onClick={(ev) => { ev.stopPropagation(); setCreateDate(ymd(c.date)); }}
                    >+</button>
                  ) : null}
                  {dayEvents.length > 0 ? (
                    <div className={s.calDots}>
                      {dayEvents.slice(0, 3).map((e) => {
                        const label = e.title.length > 22 ? `${e.title.slice(0, 22)}…` : e.title;
                        const chipStyle = { borderLeft: `3px solid ${e.color ?? KIND_COLORS[e.kind] ?? "#6366f1"}` };
                        if (e.kind === "reminder" && e.reminder) {
                          const initials = e.reminder.assigneeInitials;
                          return (
                            <button
                              key={e.id}
                              type="button"
                              className={s.calEventChip}
                              title={e.reminder.assigneeName ? `${e.title} · ${e.reminder.assigneeName}` : e.title}
                              style={{ ...chipStyle, cursor: "pointer", background: "transparent", textAlign: "left", width: "100%", font: "inherit", display: "flex", alignItems: "center", gap: 4 }}
                              onClick={(ev) => { ev.stopPropagation(); openReminder(e); }}
                            >
                              <span>🔔</span>
                              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                              {initials ? (
                                <span
                                  aria-hidden
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: 14,
                                    height: 14,
                                    borderRadius: "50%",
                                    background: "var(--marine, #2f5d8a)",
                                    color: "#fff",
                                    fontSize: 7,
                                    fontWeight: 600,
                                    flexShrink: 0,
                                  }}
                                >{initials}</span>
                              ) : null}
                            </button>
                          );
                        }
                        return e.link ? (
                          <Link
                            key={e.id}
                            href={e.link}
                            className={s.calEventChip}
                            title={e.title}
                            style={chipStyle}
                            onClick={(ev) => ev.stopPropagation()}
                          >{label}</Link>
                        ) : (
                          <span
                            key={e.id}
                            className={s.calEventChip}
                            title={e.title}
                            style={chipStyle}
                            onClick={(ev) => ev.stopPropagation()}
                          >{label}</span>
                        );
                      })}
                      {dayEvents.length > 3 ? <span style={{ fontSize: 9, color: "var(--quill)" }}>+{dayEvents.length - 3} more</span> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div>
        <div className={s.card}>
          <div className={s.cardTitle}>Upcoming events</div>
          {loading ? (
            <div className={s.empty} style={{ padding: 20 }}>Loading…</div>
          ) : upcoming.length === 0 ? (
            <div className={s.empty} style={{ padding: 20 }}>No upcoming events this month</div>
          ) : upcoming.map((e) => {
            const d = new Date(e.when);
            const content = (
              <div style={{ padding: "8px 0 8px 10px", borderBottom: "1px solid var(--border-1)", borderLeft: `3px solid ${e.color ?? KIND_COLORS[e.kind] ?? "var(--marine)"}`, marginBottom: 2 }}>
                <div style={{ fontSize: 12, color: "var(--quill)" }}>
                  {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {KIND_LABELS[e.kind] ?? e.kind}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink)", marginTop: 2 }}>{e.title}</div>
              </div>
            );
            return e.link ? (
              <Link key={e.id} href={e.link} style={{ display: "block", textDecoration: "none", color: "inherit" }}>{content}</Link>
            ) : <div key={e.id}>{content}</div>;
          })}
        </div>
      </div>
      {createDate && (
        <CreateTaskModal
          open
          initialDueDate={createDate}
          onCreated={() => { setCreateDate(null); load(); }}
          onClose={() => setCreateDate(null)}
        />
      )}
      <ReminderModal
        open={Boolean(editingReminder)}
        reminder={editingReminder}
        onClose={() => setEditingReminder(null)}
        onSaved={() => { setEditingReminder(null); load(); onReminderSaved?.(); }}
      />
    </div>
  );
}
