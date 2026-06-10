"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import s from "./styles.module.css";

export type CreateTaskModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: (taskId: string) => void;
  initialTitle?: string;
  initialDueDate?: string;
  initialLinkType?: string;
  initialLinkId?: string;
  initialLinkLabel?: string;
  sourceMessageId?: string | null;
};

type Mention = { id: string; name: string; initials: string; email: string | null };
type LinkItem = { id: string; label: string; sublabel: string };

const PRIORITIES = ["Urgent", "Medium", "Low"] as const;

export default function CreateTaskModal({
  open,
  onClose,
  onCreated,
  initialTitle = "",
  initialDueDate,
  initialLinkType,
  initialLinkId,
  initialLinkLabel,
  sourceMessageId = null,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeIndex, setAssigneeIndex] = useState(0);
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("Medium");
  const [dueDate, setDueDate] = useState<string>(initialDueDate ?? "");
  const [linkValue, setLinkValue] = useState<string>("");
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [links, setLinks] = useState<{ deals: LinkItem[]; projects: LinkItem[] }>({ deals: [], projects: [] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    setAssigneeId("");
    setAssigneeQuery("");
    setAssigneeOpen(false);
    setPriority("Medium");
    setDueDate(initialDueDate ?? "");
    setLinkValue("");
    setErr(null);
    Promise.all([
      fetch("/api/workspace/mentions").then((r) => r.json()).catch(() => ({ users: [] })),
      fetch("/api/workspace/links").then((r) => r.json()).catch(() => ({ deals: [], projects: [] })),
    ]).then(([m, l]) => {
      setMentions(m.users ?? []);
      setLinks({ deals: l.deals ?? [], projects: l.projects ?? [] });
    });
  }, [open, initialTitle, initialDueDate]);

  const linkParts = useMemo(() => {
    if (!linkValue) return null;
    const [kind, id] = linkValue.split(":");
    const list = kind === "deal" ? links.deals : kind === "project" ? links.projects : [];
    const found = list.find((x) => x.id === id);
    if (!found) return null;
    return { type: kind, id, label: found.label };
  }, [linkValue, links]);

  const submit = useCallback(async () => {
    setErr(null);
    if (!title.trim()) {
      setErr("Task name is required.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/workspace/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          assigneeId: assigneeId || null,
          priority,
          dueDate: dueDate || null,
          linkType: initialLinkType ?? linkParts?.type ?? null,
          linkId: initialLinkId ?? linkParts?.id ?? null,
          linkLabel: initialLinkLabel ?? linkParts?.label ?? null,
          sourceMessageId,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Failed to create task");
      onCreated?.(data.id);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [title, assigneeId, priority, dueDate, linkParts, initialLinkType, initialLinkId, initialLinkLabel, sourceMessageId, onCreated, onClose]);

  const selectedAssignee = mentions.find((m) => m.id === assigneeId) ?? null;
  const assigneeQ = assigneeQuery.replace(/^@/, "").toLowerCase();
  const assigneeMatches = assigneeOpen
    ? mentions.filter((m) => m.name.toLowerCase().includes(assigneeQ)).slice(0, 6)
    : [];

  const pickAssignee = (m: Mention) => {
    setAssigneeId(m.id);
    setAssigneeQuery("");
    setAssigneeOpen(false);
  };

  if (!open) return null;

  return (
    <div className={s.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={s.modal}>
        <div className={s.modalHead}>
          <div className={s.modalTitle}>New task</div>
          <button type="button" className={s.modalClose} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className={s.modalBody}>
          <div className={s.field}>
            <label className={s.fieldLabel}>Task name</label>
            <input
              className={s.fieldInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Follow up with seller on 210 Harbour Ln"
              autoFocus
            />
          </div>
          <div className={s.field}>
            <label className={s.fieldLabel}>Assign to</label>
            {selectedAssignee ? (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 8px",
                  border: "1px solid var(--border-mid, #d0d4d9)",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <span className={s.avatar} style={{ width: 20, height: 20, fontSize: 9 }}>{selectedAssignee.initials}</span>
                <span>@{selectedAssignee.name}</span>
                <button
                  type="button"
                  onClick={() => setAssigneeId("")}
                  aria-label="Clear assignee"
                  style={{ background: "none", border: "none", color: "var(--stone, #888)", cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <input
                  className={s.fieldInput}
                  value={assigneeQuery}
                  onChange={(e) => { setAssigneeQuery(e.target.value); setAssigneeOpen(true); setAssigneeIndex(0); }}
                  onFocus={() => setAssigneeOpen(true)}
                  onBlur={() => window.setTimeout(() => setAssigneeOpen(false), 150)}
                  onKeyDown={(e) => {
                    if (!assigneeOpen || !assigneeMatches.length) return;
                    if (e.key === "ArrowDown") { e.preventDefault(); setAssigneeIndex((i) => (i + 1) % assigneeMatches.length); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setAssigneeIndex((i) => (i - 1 + assigneeMatches.length) % assigneeMatches.length); }
                    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickAssignee(assigneeMatches[assigneeIndex]); }
                    else if (e.key === "Escape") { e.preventDefault(); setAssigneeOpen(false); }
                  }}
                  placeholder="Type @ or a name to assign…"
                />
                {assigneeOpen && assigneeMatches.length ? (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      marginTop: 4,
                      width: "100%",
                      background: "#fff",
                      border: "1px solid var(--border-mid, #d0d4d9)",
                      borderRadius: 6,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                      zIndex: 30,
                      overflow: "hidden",
                    }}
                  >
                    {assigneeMatches.map((m, i) => (
                      <div
                        key={m.id}
                        onMouseDown={(e) => { e.preventDefault(); pickAssignee(m); }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 10px",
                          cursor: "pointer",
                          background: i === assigneeIndex ? "#f0f7ff" : "#fff",
                        }}
                      >
                        <span className={s.avatar} style={{ width: 20, height: 20, fontSize: 9 }}>{m.initials}</span>
                        <span style={{ fontSize: 12 }}>@{m.name}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.fieldLabel}>Due date</label>
              <input
                type="date"
                className={s.fieldInput}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className={s.field}>
              <label className={s.fieldLabel}>Priority</label>
              <select
                className={s.fieldSelect}
                value={priority}
                onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])}
              >
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className={s.field}>
            <label className={s.fieldLabel}>Link to (optional)</label>
            <select className={s.fieldSelect} value={linkValue} onChange={(e) => setLinkValue(e.target.value)}>
              <option value="">— None —</option>
              {links.deals.length ? <optgroup label="Active deals">
                {links.deals.map((d) => <option key={d.id} value={`deal:${d.id}`}>{d.label}</option>)}
              </optgroup> : null}
              {links.projects.length ? <optgroup label="Active rehabs">
                {links.projects.map((p) => <option key={p.id} value={`project:${p.id}`}>{p.label}</option>)}
              </optgroup> : null}
            </select>
          </div>
          {err ? <div className={s.error}>{err}</div> : null}
        </div>
        <div className={s.modalFoot}>
          <button type="button" className={`${s.btn} ${s.ghost}`} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={s.btn} onClick={submit} disabled={busy || !title.trim()}>
            {busy ? "Creating…" : "Create task"}
          </button>
        </div>
      </div>
    </div>
  );
}
