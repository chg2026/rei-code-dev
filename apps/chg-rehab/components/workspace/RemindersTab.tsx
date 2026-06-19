"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import s from "./styles.module.css";
import ReminderModal, { ReminderDraft } from "./ReminderModal";

type Reminder = {
  id: string;
  title: string;
  source: string;
  link: string | null;
  when: string | null;
  urgent: boolean;
  kind: "doc" | "task" | "manual" | "deal";
  reminderId?: string;
  notes?: string | null;
  tags?: string[];
  dueDate?: string | null;
  dueTime?: string | null;
  urgency?: string | null;
};

const URGENCY_COLORS: Record<string, string> = {
  low: "#10b981",
  medium: "#f59e0b",
  high: "#f97316",
  urgent: "#ef4444",
};

const TZ = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;

/** Parse a date-only YYYY-MM-DD string in the *local* timezone (never UTC). */
function parseLocalDate(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function todayYmd(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function fmtTime(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  let h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

function manualDue(r: Reminder): { text: string; overdue: boolean; today: boolean } {
  if (!r.dueDate) return { text: "No date", overdue: false, today: false };
  const d = parseLocalDate(r.dueDate);
  const today = r.dueDate === todayYmd();
  const overdue = r.dueDate < todayYmd();
  const dateStr = d
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: TZ })
    : r.dueDate;
  const text = (today ? "Today" : dateStr) + (r.dueTime ? ` · ${fmtTime(r.dueTime)}` : "");
  return { text, overdue, today };
}

function derivedPill(r: Reminder) {
  if (!r.when) return r.urgent ? { label: "Urgent", cls: s.pillRed } : { label: "—", cls: s.pillGrey };
  const d = new Date(r.when);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return { label: "Overdue", cls: s.pillRed };
  if (diffDays === 0) return { label: "Today", cls: s.pillRed };
  if (r.urgent) return { label: `${diffDays}d · Urgent`, cls: s.pillRed };
  return { label: d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: TZ }), cls: s.pillAmber };
}

function derivedIcon(r: Reminder) {
  if (r.kind === "doc") return "📄";
  if (r.kind === "task") return "⏰";
  if (r.kind === "deal") return "📉";
  return "🔔";
}

export default function RemindersTab({ refreshKey = 0 }: { refreshKey?: number }) {
  const [items, setItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ReminderDraft | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/workspace/reminders", { cache: "no-store" });
      const data = await r.json();
      setItems(data.items ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const openEdit = (r: Reminder) => {
    setEditing({
      id: r.reminderId ?? r.id,
      title: r.title,
      notes: r.notes ?? null,
      tags: r.tags ?? [],
      dueDate: r.dueDate ?? null,
      dueTime: r.dueTime ?? null,
      urgency: r.urgency ?? "medium",
    });
    setModalOpen(true);
  };

  const dismiss = async (r: Reminder) => {
    const id = r.reminderId ?? r.id;
    setItems((prev) => prev.filter((x) => x.id !== r.id));
    await fetch(`/api/workspace/reminders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dismissed: true }),
    });
  };

  const manual = items.filter((r) => r.kind === "manual");
  const derived = items.filter((r) => r.kind !== "manual");

  return (
    <div className={s.card}>
      <div className={s.cardTitle}>Active reminders</div>
      {loading ? (
        <div className={s.empty} style={{ padding: 20 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div className={s.empty} style={{ padding: 20 }}>You&apos;re all caught up. ✨</div>
      ) : (
        <>
          {manual.map((r) => {
            const due = manualDue(r);
            const color = URGENCY_COLORS[r.urgency ?? "medium"] ?? URGENCY_COLORS.medium;
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "stretch", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => openEdit(r)}
                  style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                  title="Edit reminder"
                >
                  <div className={s.row} style={{ marginBottom: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 4 }} title={r.urgency ?? "medium"} />
                    <div className={s.rowMain}>
                      <div className={s.rowTitle}>{r.title}</div>
                      <div className={s.rowMeta} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ color: due.overdue ? "#ef4444" : undefined, fontWeight: due.overdue ? 600 : undefined }}>
                          {due.overdue ? `Overdue · ${due.text}` : due.text}
                        </span>
                        {(r.tags ?? []).map((t) => (
                          <span key={t} style={{ background: "var(--bone, #f1efe9)", borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(r)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--quill, #666)", fontSize: 15, padding: "0 8px", flexShrink: 0 }}
                  title="Mark done / dismiss"
                >✓</button>
              </div>
            );
          })}
          {derived.map((r) => {
            const pill = derivedPill(r);
            const content = (
              <div className={s.row} style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>{derivedIcon(r)}</span>
                <div className={s.rowMain}>
                  <div className={s.rowTitle}>{r.title}</div>
                  <div className={s.rowMeta}>{r.source}</div>
                </div>
                <div className={s.rowRight}>
                  <span className={`${s.pill} ${pill.cls}`}>{pill.label}</span>
                </div>
              </div>
            );
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "stretch", gap: 4 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {r.link ? (
                    <Link href={r.link} style={{ display: "block", textDecoration: "none", color: "inherit" }}>{content}</Link>
                  ) : content}
                </div>
              </div>
            );
          })}
        </>
      )}
      <ReminderModal
        open={modalOpen}
        reminder={editing}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSaved={load}
      />
    </div>
  );
}
