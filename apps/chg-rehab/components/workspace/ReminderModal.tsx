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
      onSaved?.();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [title, notes, tags, dueDate, dueTime, urgency, assigneeId, isEdit, reminder, onSaved, onClose]);

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
