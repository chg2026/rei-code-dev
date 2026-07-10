"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import s from "./styles.module.css";

export type ReminderDraft = {
  id: string;
  title: string;
  notes: string | null;
  tags: string[];
  dueDate: string | null;
  dueTime: string | null;
  urgency: string | null;
  assigneeId?: string | null;
};

export type ReminderModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  reminder?: ReminderDraft | null;
};

type Member = { id: string; name: string; email: string; firstName: string };

const URGENCIES: { id: string; label: string; color: string }[] = [
  { id: "low", label: "Low", color: "#10b981" },
  { id: "medium", label: "Medium", color: "#f59e0b" },
  { id: "high", label: "High", color: "#f97316" },
  { id: "urgent", label: "Urgent", color: "#ef4444" },
];

// UI-only presets (minutes before due). Labels for persistence are derived
// server-side, so the card only needs to send these numbers.
const SMS_PRESETS: { minutes: number; label: string }[] = [
  { minutes: 5, label: "5 min" },
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hr" },
  { minutes: 120, label: "2 hr" },
  { minutes: 180, label: "3 hr" },
  { minutes: 1440, label: "1 day" },
  { minutes: 2880, label: "2 days" },
];

const CUSTOM_UNIT_MULT: Record<string, number> = { minutes: 1, hours: 60, days: 1440 };

function smsLabel(minutes: number): string {
  const preset = SMS_PRESETS.find((p) => p.minutes === minutes);
  if (preset) return preset.label + " before";
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes / 1440 === 1 ? "" : "s"} before`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes / 60 === 1 ? "" : "s"} before`;
  return `${minutes} minute${minutes === 1 ? "" : "s"} before`;
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export default function ReminderModal({ open, onClose, onSaved, reminder }: ReminderModalProps) {
  const isEdit = Boolean(reminder?.id);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [urgency, setUrgency] = useState("medium");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [members, setMembers] = useState<Member[]>([]);

  // SMS reminders
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [smsLeadTimes, setSmsLeadTimes] = useState<number[]>([]);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<"minutes" | "hours" | "days">("hours");

  // Assignee combobox
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const assigneeWrapRef = useRef<HTMLDivElement | null>(null);

  // @mention dropdown
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionAnchor, setMentionAnchor] = useState(0);

  useEffect(() => {
    if (!open) return;
    setTitle(reminder?.title ?? "");
    setNotes(reminder?.notes ?? "");
    setTags(reminder?.tags ?? []);
    setTagInput("");
    setDueDate(reminder?.dueDate ?? "");
    setDueTime(reminder?.dueTime ?? "");
    setUrgency(reminder?.urgency ?? "medium");
    setAssigneeId(reminder?.assigneeId ?? null);
    setAssigneeQuery("");
    setAssigneeOpen(false);
    setMentionQuery(null);
    setErr(null);
    setSmsLeadTimes([]);
    setCustomValue("");
    setCustomUnit("hours");
  }, [open, reminder]);

  // Load SMS phone-verification state whenever the card opens, plus any
  // existing pending lead times for the reminder being edited.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/account/sms-status", { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled) setPhoneVerified(Boolean(data.phoneVerified));
      } catch {
        /* ignore */
      }
      if (reminder?.id) {
        try {
          const r = await fetch(`/api/workspace/reminders/${reminder.id}/sms`, { cache: "no-store" });
          if (!r.ok) return;
          const data = await r.json();
          if (cancelled) return;
          const mins = (data.leadTimes ?? [])
            .map((l: { minutesBefore: number }) => l.minutesBefore)
            .filter((m: number) => Number.isFinite(m));
          setSmsLeadTimes(Array.from(new Set<number>(mins)).sort((a, b) => a - b));
        } catch {
          /* ignore */
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, reminder]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/settings/team/members", { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json();
        if (cancelled) return;
        const list: Member[] = (data.members ?? []).map((m: { id: string; name: string; email: string }) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          firstName: firstNameOf(m.name),
        }));
        setMembers(list);
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!assigneeOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (assigneeWrapRef.current && !assigneeWrapRef.current.contains(e.target as Node)) {
        setAssigneeOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [assigneeOpen]);

  const assignee = useMemo(() => members.find((m) => m.id === assigneeId) ?? null, [members, assigneeId]);

  const filteredAssignees = useMemo(() => {
    const q = assigneeQuery.trim().toLowerCase();
    if (!q) return members.slice(0, 8);
    return members
      .filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [members, assigneeQuery]);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members
      .filter((m) => m.firstName.toLowerCase().startsWith(q))
      .slice(0, 6);
  }, [members, mentionQuery]);

  const addTag = useCallback((raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setTagInput("");
  }, []);

  // Detect @mention token immediately before the caret.
  const onNotesChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNotes(value);
    const caret = e.target.selectionStart ?? value.length;
    const upToCaret = value.slice(0, caret);
    const m = /(?:^|\s)@([A-Za-z][A-Za-z0-9_'-]*)?$/.exec(upToCaret);
    if (m) {
      setMentionQuery(m[1] ?? "");
      // anchor = index of the '@'
      setMentionAnchor(caret - (m[1]?.length ?? 0) - 1);
    } else {
      setMentionQuery(null);
    }
  }, []);

  const insertMention = useCallback((member: Member) => {
    setNotes((prev) => {
      const caret = notesRef.current?.selectionStart ?? prev.length;
      const before = prev.slice(0, mentionAnchor);
      const after = prev.slice(caret);
      const insert = `@${member.firstName} `;
      const next = before + insert + after;
      // Restore caret after the inserted mention on next tick.
      requestAnimationFrame(() => {
        const pos = (before + insert).length;
        if (notesRef.current) {
          notesRef.current.focus();
          notesRef.current.setSelectionRange(pos, pos);
        }
      });
      return next;
    });
    setMentionQuery(null);
  }, [mentionAnchor]);

  const toggleLeadTime = useCallback((minutes: number) => {
    setSmsLeadTimes((prev) =>
      prev.includes(minutes)
        ? prev.filter((m) => m !== minutes)
        : [...prev, minutes].sort((a, b) => a - b)
    );
  }, []);

  const addCustomLeadTime = useCallback(() => {
    const n = Number(customValue);
    if (!Number.isFinite(n) || n <= 0) return;
    const minutes = Math.round(n) * CUSTOM_UNIT_MULT[customUnit];
    if (minutes <= 0 || minutes > 43_200) return; // cap at 30 days
    setSmsLeadTimes((prev) =>
      prev.includes(minutes) ? prev : [...prev, minutes].sort((a, b) => a - b)
    );
    setCustomValue("");
  }, [customValue, customUnit]);

  const submit = useCallback(async () => {
    setErr(null);
    if (!title.trim()) {
      setErr("Title is required.");
      return;
    }
    if (!dueDate) {
      setErr("A date is required.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        notes: notes.trim() || null,
        tags,
        dueDate,
        dueTime: dueTime || null,
        urgency,
        assigneeId: assigneeId || null,
      };
      const url = isEdit
        ? `/api/workspace/reminders/${reminder!.id}`
        : "/api/workspace/reminders";
      const r = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Failed to save reminder");

      // Persist SMS lead times against the saved reminder. Only meaningful for
      // a verified phone; the reconcile endpoint upserts/removes pending rows
      // and never touches already-sent ones.
      if (phoneVerified) {
        const reminderId: string | undefined = isEdit ? reminder!.id : data.id;
        if (reminderId) {
          await fetch(`/api/workspace/reminders/${reminderId}/sms`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ leadTimes: smsLeadTimes }),
          }).catch(() => undefined);
        }
      }

      onSaved?.();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [title, notes, tags, dueDate, dueTime, urgency, assigneeId, isEdit, reminder, phoneVerified, smsLeadTimes, onSaved, onClose]);

  if (!open) return null;

  return (
    <div className={s.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={s.modal}>
        <div className={s.modalHead}>
          <div className={s.modalTitle}>{isEdit ? "Edit reminder" : "New reminder"}</div>
          <button type="button" className={s.modalClose} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className={s.modalBody}>
          <div className={s.field}>
            <label className={s.fieldLabel}>Title</label>
            <input
              className={s.fieldInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Call insurer about COI renewal"
              autoFocus
            />
          </div>
          <div className={s.field} style={{ position: "relative" }}>
            <label className={s.fieldLabel}>Notes</label>
            <textarea
              ref={notesRef}
              className={s.fieldInput}
              value={notes}
              onChange={onNotesChange}
              onBlur={() => { window.setTimeout(() => setMentionQuery(null), 150); }}
              placeholder="Optional details… type @ to mention a teammate"
              rows={3}
              style={{ resize: "vertical", fontFamily: "inherit" }}
            />
            {mentionQuery !== null && mentionMatches.length > 0 ? (
              <div
                style={{
                  position: "absolute",
                  left: 8,
                  right: 8,
                  zIndex: 30,
                  background: "#fff",
                  border: "1px solid var(--border-mid, #d0d4d9)",
                  borderRadius: 6,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  overflow: "hidden",
                  marginTop: 2,
                }}
              >
                {mentionMatches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                    style={{
                      display: "flex",
                      width: "100%",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 10px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                      fontSize: 13,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bone, #f1efe9)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <Avatar name={m.name} />
                    <span style={{ fontWeight: 600 }}>@{m.firstName}</span>
                    <span style={{ color: "var(--quill, #888)", fontSize: 12 }}>{m.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className={s.field} ref={assigneeWrapRef} style={{ position: "relative" }}>
            <label className={s.fieldLabel}>Assign to</label>
            {assignee ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  border: "1px solid var(--border-mid, #d0d4d9)",
                  borderRadius: 6,
                  padding: "5px 8px",
                  minHeight: 34,
                }}
              >
                <Avatar name={assignee.name} />
                <span style={{ fontSize: 13, flex: 1 }}>{assignee.name}</span>
                <button
                  type="button"
                  onClick={() => { setAssigneeId(null); setAssigneeQuery(""); }}
                  aria-label="Unassign"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--stone, #888)", fontSize: 15, lineHeight: 1, padding: 0 }}
                >
                  ×
                </button>
              </div>
            ) : (
              <input
                className={s.fieldInput}
                value={assigneeQuery}
                onChange={(e) => { setAssigneeQuery(e.target.value); setAssigneeOpen(true); }}
                onFocus={() => setAssigneeOpen(true)}
                placeholder="Search team members (optional)"
              />
            )}
            {assigneeOpen && !assignee && filteredAssignees.length > 0 ? (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  zIndex: 30,
                  background: "#fff",
                  border: "1px solid var(--border-mid, #d0d4d9)",
                  borderRadius: 6,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  overflow: "hidden",
                  marginTop: 2,
                }}
              >
                {filteredAssignees.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setAssigneeId(m.id); setAssigneeOpen(false); setAssigneeQuery(""); }}
                    style={{
                      display: "flex",
                      width: "100%",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 10px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                      fontSize: 13,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bone, #f1efe9)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <Avatar name={m.name} />
                    <span style={{ flex: 1 }}>{m.name}</span>
                    <span style={{ color: "var(--quill, #888)", fontSize: 12 }}>{m.email}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className={s.field}>
            <label className={s.fieldLabel}>Tags</label>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                alignItems: "center",
                border: "1px solid var(--border-mid, #d0d4d9)",
                borderRadius: 6,
                padding: "5px 8px",
                minHeight: 34,
              }}
            >
              {tags.map((t) => (
                <span
                  key={t}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: "var(--bone, #f1efe9)",
                    borderRadius: 12,
                    padding: "2px 8px",
                    fontSize: 12,
                  }}
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                    aria-label={`Remove ${t}`}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--stone, #888)", fontSize: 13, lineHeight: 1, padding: 0 }}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); }
                  else if (e.key === "Backspace" && !tagInput && tags.length) {
                    setTags((prev) => prev.slice(0, -1));
                  }
                }}
                onBlur={() => addTag(tagInput)}
                placeholder={tags.length ? "" : "Type a tag and press Enter"}
                style={{ flex: 1, minWidth: 120, border: "none", outline: "none", fontSize: 13, background: "transparent", fontFamily: "inherit" }}
              />
            </div>
          </div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.fieldLabel}>Date</label>
              <input
                type="date"
                className={s.fieldInput}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className={s.field}>
              <label className={s.fieldLabel}>Time / alarm (optional)</label>
              <input
                type="time"
                className={s.fieldInput}
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
              />
            </div>
          </div>
          <div className={s.field}>
            <label className={s.fieldLabel}>Urgency</label>
            <div style={{ display: "flex", gap: 6 }}>
              {URGENCIES.map((u) => {
                const active = urgency === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setUrgency(u.id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      flex: 1,
                      justifyContent: "center",
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: active ? `1.5px solid ${u.color}` : "1px solid var(--border-mid, #d0d4d9)",
                      background: active ? `${u.color}1a` : "transparent",
                      color: active ? "var(--ink)" : "var(--quill, #666)",
                      fontWeight: active ? 600 : 400,
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: u.color }} />
                    {u.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className={s.field}>
            <label className={s.fieldLabel}>SMS reminders</label>
            {phoneVerified ? (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {SMS_PRESETS.map((p) => {
                    const active = smsLeadTimes.includes(p.minutes);
                    return (
                      <button
                        key={p.minutes}
                        type="button"
                        onClick={() => toggleLeadTime(p.minutes)}
                        style={{
                          padding: "5px 10px",
                          borderRadius: 999,
                          border: active ? "1.5px solid var(--marine, #2f5d8a)" : "1px solid var(--border-mid, #d0d4d9)",
                          background: active ? "var(--marine, #2f5d8a)" : "transparent",
                          color: active ? "#fff" : "var(--quill, #555)",
                          fontSize: 12,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                {/* Custom lead times not covered by a preset (chips to remove). */}
                {smsLeadTimes.filter((m) => !SMS_PRESETS.some((p) => p.minutes === m)).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {smsLeadTimes
                      .filter((m) => !SMS_PRESETS.some((p) => p.minutes === m))
                      .map((m) => (
                        <span
                          key={m}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            background: "var(--bone, #f1efe9)",
                            borderRadius: 12,
                            padding: "3px 9px",
                            fontSize: 12,
                          }}
                        >
                          {smsLabel(m)}
                          <button
                            type="button"
                            onClick={() => toggleLeadTime(m)}
                            aria-label={`Remove ${smsLabel(m)}`}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--stone, #888)", fontSize: 13, lineHeight: 1, padding: 0 }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
                  <input
                    type="number"
                    min={1}
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomLeadTime(); } }}
                    placeholder="Custom"
                    style={{ width: 80, padding: "5px 8px", fontSize: 13, border: "1px solid var(--border-mid, #d0d4d9)", borderRadius: 6, fontFamily: "inherit" }}
                  />
                  <select
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value as "minutes" | "hours" | "days")}
                    style={{ padding: "5px 8px", fontSize: 13, border: "1px solid var(--border-mid, #d0d4d9)", borderRadius: 6, fontFamily: "inherit" }}
                  >
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                  <button type="button" className={`${s.btn} ${s.ghost}`} onClick={addCustomLeadTime} style={{ padding: "5px 12px" }}>
                    Add
                  </button>
                  <span style={{ fontSize: 11, color: "var(--quill, #888)" }}>before the reminder</span>
                </div>
                {!dueDate && (
                  <div style={{ fontSize: 11, color: "var(--quill, #888)", marginTop: 6 }}>
                    Set a date{dueTime ? "" : " (and optionally a time)"} above so we know when to text you.
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--quill, #666)", lineHeight: 1.5 }}>
                Text reminders need a verified mobile number.{" "}
                <a href="/account" style={{ color: "var(--marine, #2f5d8a)", textDecoration: "underline" }}>
                  Verify your phone in Profile settings
                </a>{" "}
                to turn these on.
              </div>
            )}
          </div>
          {err ? <div className={s.error}>{err}</div> : null}
        </div>
        <div className={s.modalFoot}>
          <button type="button" className={`${s.btn} ${s.ghost}`} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={s.btn} onClick={submit} disabled={busy || !title.trim()}>
            {busy ? "Saving…" : "Save reminder"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.length === 0
    ? "?"
    : parts.length === 1
      ? parts[0].slice(0, 2).toUpperCase()
      : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: "var(--marine, #2f5d8a)",
        color: "#fff",
        fontSize: 10,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}
