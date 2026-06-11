"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PRIORITIES, type PmStatus } from "./types";

type Member = { id: string; name: string; initials: string; email: string | null };
type Assignee = { id: string; name: string; initials: string };
type Comment = { id: string; body: string; createdAt: string; author: Assignee };
type Activity = { id: string; type: string; createdAt: string; user: Assignee };
type Subtask = { id: string; name: string; statusId: string | null; status: PmStatus | null; doneDate: string | null; assignees: Assignee[] };
type TaskDetail = {
  id: string;
  name: string;
  description: string | null;
  taskType: string;
  priority: string | null;
  statusId: string | null;
  status: PmStatus | null;
  listId: string;
  timeEstimate: number | null;
  sprintPoints: number | null;
  startDate: string | null;
  dueDate: string | null;
  assignees: Assignee[];
  subtasks: Subtask[];
  comments: Comment[];
  activity: Activity[];
  statuses: PmStatus[];
};

function dateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function PmTaskDetail({ taskId, listId, defaultStatusId, onClose, onUpdated, onCreated }: {
  taskId?: string | null;
  listId?: string;
  defaultStatusId?: string | null;
  onClose: () => void;
  onUpdated: () => void;
  onCreated?: (id: string) => void;
}) {
  const isCreate = !taskId;
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");
  const [subtaskName, setSubtaskName] = useState("");
  const [showActivity, setShowActivity] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Create-mode state.
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const newNameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (isCreate && mounted) newNameRef.current?.focus(); }, [isCreate, mounted]);

  const createTask = async () => {
    const n = newName.trim();
    if (!n || !listId || creating) return;
    setCreating(true);
    try {
      const r = await fetch(`/api/pm/lists/${listId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: n, statusId: defaultStatusId ?? undefined }),
      });
      if (r.ok) {
        const d = await r.json().catch(() => null);
        const id: string | undefined = d?.task?.id ?? d?.id;
        if (id) onCreated?.(id);
      }
    } finally {
      setCreating(false);
    }
  };

  const load = useCallback(async () => {
    if (!taskId) return;
    const r = await fetch(`/api/pm/tasks/${taskId}`, { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      setTask(d.task);
      setName(d.task.name);
      setDescription(d.task.description ?? "");
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/workspace/mentions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setMembers(d.users ?? []))
      .catch(() => undefined);
  }, []);

  const patch = useCallback(async (data: Record<string, unknown>) => {
    await fetch(`/api/pm/tasks/${taskId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    await load();
    onUpdated();
  }, [taskId, load, onUpdated]);

  const toggleAssignee = async (userId: string, has: boolean) => {
    await fetch(`/api/pm/tasks/${taskId}/assignees`, {
      method: has ? "DELETE" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    await load();
    onUpdated();
  };

  const addComment = async () => {
    const body = comment.trim();
    if (!body) return;
    await fetch(`/api/pm/tasks/${taskId}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
    setComment("");
    await load();
  };

  const addSubtask = async () => {
    const n = subtaskName.trim();
    if (!n || !task) return;
    await fetch(`/api/pm/lists/${task.listId}/tasks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: n, parentTaskId: task.id }) });
    setSubtaskName("");
    await load();
    onUpdated();
  };

  const toggleSubtask = async (st: Subtask) => {
    if (!task) return;
    const done = !!st.doneDate;
    const target = done
      ? task.statuses.find((s) => s.type === "open" || s.isDefault) ?? task.statuses[0]
      : task.statuses.find((s) => s.type === "done" || s.type === "closed");
    if (!target) return;
    await fetch(`/api/pm/tasks/${st.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ statusId: target.id }) });
    await load();
    onUpdated();
  };

  const deleteTask = async () => {
    if (!window.confirm("Delete this task?")) return;
    await fetch(`/api/pm/tasks/${taskId}`, { method: "DELETE" });
    onUpdated();
    onClose();
  };

  if (!mounted) return null;

  if (isCreate) {
    return createPortal(
      <>
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.20)", zIndex: 190 }} />
        <div style={{ position: "fixed", top: 0, right: 0, width: 480, maxWidth: "100vw", height: "100%", background: "var(--bg-primary)", boxShadow: "var(--shadow-md)", zIndex: 200, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "0.5px solid var(--border-lo)" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>New task</span>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-tertiary)", lineHeight: 1 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            <Label>Task name</Label>
            <input
              ref={newNameRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createTask(); if (e.key === "Escape") onClose(); }}
              placeholder="What needs to be done?"
              style={{ width: "100%", fontSize: 19, fontWeight: 600, fontFamily: "inherit", color: "var(--text-primary)", border: "none", outline: "none", marginBottom: 16, background: "transparent" }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: "0.5px solid var(--border-lo)" }}>
            <button type="button" onClick={onClose} style={{ padding: "7px 14px", fontSize: 13, background: "var(--bg-secondary)", color: "var(--text-secondary)", border: "0.5px solid var(--border-lo)", borderRadius: 6, cursor: "pointer" }}>Cancel</button>
            <button type="button" onClick={createTask} disabled={!newName.trim() || creating} style={{ padding: "7px 14px", fontSize: 13, background: "var(--marine)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", opacity: !newName.trim() || creating ? 0.6 : 1 }}>
              {creating ? "Creating…" : "Create task"}
            </button>
          </div>
        </div>
      </>,
      document.body
    );
  }

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.20)", zIndex: 190 }} />
      <div style={{ position: "fixed", top: 0, right: 0, width: 480, maxWidth: "100vw", height: "100%", background: "var(--bg-primary)", boxShadow: "var(--shadow-md)", zIndex: 200, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!task ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "0.5px solid var(--border-lo)" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--marine-ink)", background: "var(--marine-soft)", padding: "2px 8px", borderRadius: 4, textTransform: "capitalize" }}>{task.taskType}</span>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={deleteTask} aria-label="Delete task" title="Delete task" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", lineHeight: 1, padding: "2px 4px" }}>🗑</button>
              <button type="button" onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-tertiary)", lineHeight: 1 }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => { if (name.trim() && name !== task.name) patch({ name: name.trim() }); }}
                style={{ width: "100%", fontSize: 19, fontWeight: 600, fontFamily: "inherit", color: "var(--text-primary)", border: "none", outline: "none", marginBottom: 16, background: "transparent" }}
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <Field label="Status">
                  <select value={task.statusId ?? ""} onChange={(e) => patch({ statusId: e.target.value || null })} style={selectStyle}>
                    <option value="">No status</option>
                    {task.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
                <Field label="Priority">
                  <select value={task.priority ?? ""} onChange={(e) => patch({ priority: e.target.value || null })} style={selectStyle}>
                    <option value="">None</option>
                    {PRIORITIES.map((p) => <option key={p} value={p} style={{ textTransform: "capitalize" }}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Start date">
                  <input type="date" value={dateInput(task.startDate)} onChange={(e) => patch({ startDate: e.target.value || null })} style={selectStyle} />
                </Field>
                <Field label="Due date">
                  <input type="date" value={dateInput(task.dueDate)} onChange={(e) => patch({ dueDate: e.target.value || null })} style={selectStyle} />
                </Field>
                <Field label="Time estimate (h)">
                  <input type="number" min={0} defaultValue={task.timeEstimate ?? ""} onBlur={(e) => patch({ timeEstimate: e.target.value === "" ? null : Number(e.target.value) })} style={selectStyle} />
                </Field>
                <Field label="Sprint points">
                  <input type="number" min={0} defaultValue={task.sprintPoints ?? ""} onBlur={(e) => patch({ sprintPoints: e.target.value === "" ? null : Number(e.target.value) })} style={selectStyle} />
                </Field>
              </div>

              <Field label="Assignees">
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {task.assignees.map((a) => (
                    <span key={a.id} title={a.name} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--bg-secondary)", borderRadius: 12, padding: "2px 8px 2px 2px", fontSize: 12 }}>
                      <span style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--marine)", color: "#fff", fontSize: 9, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>{a.initials}</span>
                      {a.name}
                      <button type="button" onClick={() => toggleAssignee(a.id, true)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: 13 }}>×</button>
                    </span>
                  ))}
                  <button type="button" onClick={() => setShowMembers((s) => !s)} style={{ fontSize: 12, color: "var(--marine)", background: "transparent", border: "1px dashed var(--border-mid)", borderRadius: 12, padding: "3px 10px", cursor: "pointer" }}>+ Assign</button>
                </div>
                {showMembers ? (
                  <div style={{ marginTop: 8, border: "0.5px solid var(--border-lo)", borderRadius: 6, maxHeight: 160, overflowY: "auto" }}>
                    {members.map((m) => {
                      const has = task.assignees.some((a) => a.id === m.id);
                      return (
                        <div key={m.id} onClick={() => toggleAssignee(m.id, has)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer", fontSize: 13, background: has ? "var(--marine-soft)" : "transparent" }}>
                          <span style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--marine)", color: "#fff", fontSize: 9, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>{m.initials}</span>
                          {m.name}
                          {has ? <span style={{ marginLeft: "auto", color: "var(--marine)" }}>✓</span> : null}
                        </div>
                      );
                    })}
                    {members.length === 0 ? <div style={{ padding: 10, fontSize: 12, color: "var(--text-tertiary)" }}>No team members.</div> : null}
                  </div>
                ) : null}
              </Field>

              <div style={{ marginTop: 16 }}>
                <Label>Description</Label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => { if (description !== (task.description ?? "")) patch({ description: description || null }); }}
                  placeholder="Add description…"
                  rows={4}
                  style={{ width: "100%", fontSize: 13, fontFamily: "inherit", color: "var(--text-primary)", border: "0.5px solid var(--border-lo)", borderRadius: 6, padding: 10, outline: "none", resize: "vertical", background: "var(--bg-primary)" }}
                />
              </div>

              <div style={{ marginTop: 20 }}>
                <Label>Subtasks</Label>
                {task.subtasks.map((st) => (
                  <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 13 }}>
                    <input type="checkbox" checked={!!st.doneDate} onChange={() => toggleSubtask(st)} />
                    <span style={{ textDecoration: st.doneDate ? "line-through" : "none", color: st.doneDate ? "var(--text-tertiary)" : "var(--text-primary)" }}>{st.name}</span>
                  </div>
                ))}
                <input
                  value={subtaskName}
                  onChange={(e) => setSubtaskName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addSubtask(); }}
                  placeholder="+ Add subtask"
                  style={{ width: "100%", marginTop: 6, padding: "6px 8px", fontSize: 13, fontFamily: "inherit", border: "0.5px solid var(--border-lo)", borderRadius: 6, outline: "none" }}
                />
              </div>

              <div style={{ marginTop: 20 }}>
                <Label>Comments</Label>
                {task.comments.map((c) => (
                  <div key={c.id} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--marine)", color: "#fff", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.author.initials}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12 }}><strong>{c.author.name}</strong> <span style={{ color: "var(--text-tertiary)" }}>{fmtTime(c.createdAt)}</span></div>
                      <div style={{ fontSize: 13, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{c.body}</div>
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addComment(); }}
                    placeholder="Write a comment…"
                    style={{ flex: 1, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", border: "0.5px solid var(--border-lo)", borderRadius: 6, outline: "none" }}
                  />
                  <button type="button" onClick={addComment} style={{ padding: "7px 14px", fontSize: 13, background: "var(--marine)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>Send</button>
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <button type="button" onClick={() => setShowActivity((s) => !s)} style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                  {showActivity ? "▾" : "▸"} Activity ({task.activity.length})
                </button>
                {showActivity ? (
                  <div style={{ marginTop: 8 }}>
                    {task.activity.map((a) => (
                      <div key={a.id} style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "3px 0" }}>
                        <strong style={{ color: "var(--text-secondary)" }}>{a.user.name}</strong> {a.type.replace(/_/g, " ")} · {fmtTime(a.createdAt)}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
    </>,
    document.body
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 5 }}>{children}</div>;
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  fontSize: 13,
  fontFamily: "inherit",
  color: "var(--text-primary)",
  border: "0.5px solid var(--border-lo)",
  borderRadius: 6,
  outline: "none",
  background: "var(--bg-primary)",
};
