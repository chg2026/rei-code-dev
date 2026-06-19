"use client";

import { useCallback, useEffect, useState } from "react";
import s from "./styles.module.css";

export type ReminderDraft = {
  id: string;
  title: string;
  notes: string | null;
  tags: string[];
  dueDate: string | null;
  dueTime: string | null;
  urgency: string | null;
};

export type ReminderModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  reminder?: ReminderDraft | null;
};

const URGENCIES: { id: string; label: string; color: string }[] = [
  { id: "low", label: "Low", color: "#10b981" },
  { id: "medium", label: "Medium", color: "#f59e0b" },
  { id: "high", label: "High", color: "#f97316" },
  { id: "urgent", label: "Urgent", color: "#ef4444" },
];

export default function ReminderModal({ open, onClose, onSaved, reminder }: ReminderModalProps) {
  const isEdit = Boolean(reminder?.id);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [urgency, setUrgency] = useState("medium");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(reminder?.title ?? "");
    setNotes(reminder?.notes ?? "");
    setTags(reminder?.tags ?? []);
    setTagInput("");
    setDueDate(reminder?.dueDate ?? "");
    setDueTime(reminder?.dueTime ?? "");
    setUrgency(reminder?.urgency ?? "medium");
    setErr(null);
  }, [open, reminder]);

  const addTag = useCallback((raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setTagInput("");
  }, []);

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
  }, [title, notes, tags, dueDate, dueTime, urgency, isEdit, reminder, onSaved, onClose]);

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
          <div className={s.field}>
            <label className={s.fieldLabel}>Notes</label>
            <textarea
              className={s.fieldInput}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional details…"
              rows={3}
              style={{ resize: "vertical", fontFamily: "inherit" }}
            />
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
