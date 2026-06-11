"use client";
import { useEffect, useRef, useState } from "react";

type Mode = "create" | "edit";
type TeamMember = { id: string; name: string; initials: string };
type Comment = {
  id: string; body: string; createdAt: string;
  author: { id: string; name: string; initials: string };
};
type TaskDetail = {
  id: string; title: string; priority: string; dueDate: string | null;
  done: boolean; description: string | null;
  assignee: { id: string; name: string; initials: string } | null;
  linkLabel: string | null; createdAt: string;
};

export default function TaskDetailPanel({
  mode: modeProp, taskId, linkType, linkId, linkLabel, defaultStatus,
  onClose, onDeleted, onUpdated, onCreated,
}: {
  mode?: Mode;
  taskId?: string;
  linkType?: string | null;
  linkId?: string;
  linkLabel?: string | null;
  defaultStatus?: string;
  onClose: () => void;
  onDeleted?: () => void;
  onUpdated?: () => void;
  onCreated?: (newId: string) => void;
}) {
  const [mode, setMode] = useState<Mode>(modeProp ?? (taskId ? "edit" : "create"));
  const [activeTaskId, setActiveTaskId] = useState<string | null>(taskId ?? null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [comment, setComment] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create-mode draft fields.
  const [cTitle, setCTitle] = useState("");
  const [cPriority, setCPriority] = useState("Medium");
  const [cDue, setCDue] = useState("");
  const [cDescription, setCDescription] = useState("");
  const [cAssignee, setCAssignee] = useState<TeamMember | null>(null);
  const [creating, setCreating] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Re-sync local mode/active task when the controlling props change while
  // the panel stays mounted (e.g. selecting a different task in a list).
  useEffect(() => {
    setActiveTaskId(taskId ?? null);
    setMode(modeProp ?? (taskId ? "edit" : "create"));
  }, [taskId, modeProp]);

  // Load team members for the assignee picker (both modes).
  useEffect(() => {
    fetch("/api/workspace/mentions")
      .then(r => (r.ok ? r.json() : { users: [] }))
      .then(d => setMembers(d.users ?? []))
      .catch(() => undefined);
  }, []);

  // Load the task + comments in edit mode.
  useEffect(() => {
    if (mode !== "edit" || !activeTaskId) return;
    fetch(`/api/workspace/tasks/${activeTaskId}`)
      .then(r => r.json()).then(d => setTask(d.task ?? null));
    fetch(`/api/workspace/tasks/${activeTaskId}/comments`)
      .then(r => (r.ok ? r.json() : { comments: [] }))
      .then(d => setComments(d.comments ?? []));
  }, [mode, activeTaskId]);

  // Focus the title in create mode.
  useEffect(() => {
    if (mode === "create") titleRef.current?.focus();
  }, [mode]);

  const save = async (patch: Record<string, unknown>) => {
    if (!activeTaskId || !task) return;
    setSaving(true);
    setTask(prev => (prev ? ({ ...prev, ...patch } as TaskDetail) : prev));
    await fetch(`/api/workspace/tasks/${activeTaskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    onUpdated?.();
  };

  const setAssignee = (m: TeamMember | null) => {
    if (!task) return;
    setTask({ ...task, assignee: m });
    setShowMembers(false);
    save({ assigneeId: m?.id ?? null });
  };

  const submitCreate = async () => {
    const title = cTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    const r = await fetch("/api/workspace/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        priority: cPriority,
        dueDate: cDue || null,
        assigneeId: cAssignee?.id ?? null,
        linkType: linkType ?? null,
        linkId: linkId ?? null,
        linkLabel: linkLabel ?? null,
        description: cDescription || null,
      }),
    });
    setCreating(false);
    if (r.ok) {
      const d = await r.json().catch(() => null);
      const id: string | undefined = d?.id;
      if (id) {
        setActiveTaskId(id);
        setMode("edit");
        onCreated?.(id);
      }
    }
  };

  const addComment = async () => {
    const text = comment.trim();
    if (!text || !activeTaskId) return;
    setComment("");
    const r = await fetch(`/api/workspace/tasks/${activeTaskId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    if (r.ok) {
      const d = await r.json();
      if (d.comment) setComments(prev => [...prev, d.comment as Comment]);
    }
  };

  const deleteTask = async () => {
    if (!activeTaskId) return;
    if (!window.confirm("Delete this task?")) return;
    await fetch(`/api/workspace/tasks/${activeTaskId}`, { method: "DELETE" });
    onDeleted?.();
    onClose();
  };

  // ---- Create mode -------------------------------------------------------
  if (mode === "create") {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>New task</span>
          <button type="button" onClick={onClose} style={ghostBtn} title="Close">✕</button>
        </div>
        <div style={bodyStyle}>
          <div>
            <label style={labelStyle}>Title</label>
            <input
              ref={titleRef}
              className="input"
              style={{ width: "100%" }}
              value={cTitle}
              onChange={e => setCTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submitCreate(); } }}
              placeholder="Task title…"
            />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Priority</label>
              <select className="input" style={{ width: "100%" }} value={cPriority}
                onChange={e => setCPriority(e.target.value)}>
                <option>Urgent</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Due date</label>
              <input type="date" className="input" style={{ width: "100%" }}
                value={cDue} onChange={e => setCDue(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Assignee</label>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {cAssignee ? (
                <span style={chipStyle}>
                  <span style={avatarStyle}>{cAssignee.initials}</span>
                  {cAssignee.name}
                  <button type="button" onClick={() => setCAssignee(null)} style={chipRemoveBtn} title="Remove assignee">×</button>
                </span>
              ) : (
                <span style={{ fontSize: 13, color: "var(--quill)" }}>Unassigned</span>
              )}
              <button type="button" onClick={() => setShowMembers(s => !s)} style={addBtn}>
                + {cAssignee ? "Change" : "Add assignee"}
              </button>
            </div>
            {showMembers && (
              <div style={pickerStyle}>
                {members.length === 0 && (
                  <div style={{ padding: 10, fontSize: 12, color: "var(--quill)" }}>No team members.</div>
                )}
                {members.map(m => (
                  <button key={m.id} type="button" onClick={() => { setCAssignee(m); setShowMembers(false); }} style={pickerRow}>
                    <span style={avatarStyle}>{m.initials}</span>
                    <span style={{ flex: 1, textAlign: "left" }}>{m.name}</span>
                    {cAssignee?.id === m.id ? <span style={{ color: "var(--marine, #2563eb)" }}>✓</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea className="input" style={{ width: "100%", minHeight: 100, resize: "vertical" }}
              value={cDescription}
              onChange={e => setCDescription(e.target.value)}
              placeholder="Add a description…"
            />
          </div>
          {linkLabel && (
            <div style={{ fontSize: 12, color: "var(--quill)" }}>
              Linking to: <span style={{ color: "var(--ink)" }}>{linkLabel}</span>
            </div>
          )}
        </div>
        <div style={footStyle}>
          <button type="button" className="btn-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-sm btn-primary" onClick={submitCreate} disabled={!cTitle.trim() || creating}>
            {creating ? "Creating…" : "Create task"}
          </button>
        </div>
      </div>
    );
  }

  // ---- Edit mode ---------------------------------------------------------
  if (!task) return (
    <div style={panelStyle}>
      <div style={{ padding: 24, color: "var(--quill)" }}>Loading…</div>
    </div>
  );

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>Task detail</span>
        <div style={{ display: "flex", gap: 8 }}>
          {onDeleted && (
            <button type="button" onClick={deleteTask} style={ghostBtn} title="Delete task">🗑</button>
          )}
          <button type="button" onClick={onClose} style={ghostBtn} title="Close">✕</button>
        </div>
      </div>
      <div style={bodyStyle}>
        <div>
          <label style={labelStyle}>Title</label>
          <input
            className="input"
            style={{ width: "100%" }}
            value={task.title}
            onChange={e => setTask({ ...task, title: e.target.value })}
            onBlur={e => save({ title: e.target.value })}
          />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Priority</label>
            <select className="input" style={{ width: "100%" }} value={task.priority}
              onChange={e => { setTask({ ...task, priority: e.target.value }); save({ priority: e.target.value }); }}>
              <option>Urgent</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Due date</label>
            <input type="date" className="input" style={{ width: "100%" }}
              value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
              onChange={e => { const v = e.target.value || null; setTask({ ...task, dueDate: v }); save({ dueDate: v }); }} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Assignee</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {task.assignee ? (
              <span style={chipStyle}>
                <span style={avatarStyle}>{task.assignee.initials}</span>
                {task.assignee.name}
                <button type="button" onClick={() => setAssignee(null)} style={chipRemoveBtn} title="Remove assignee">×</button>
              </span>
            ) : (
              <span style={{ fontSize: 13, color: "var(--quill)" }}>Unassigned</span>
            )}
            <button type="button" onClick={() => setShowMembers(s => !s)} style={addBtn}>
              + {task.assignee ? "Change" : "Add assignee"}
            </button>
          </div>
          {showMembers && (
            <div style={pickerStyle}>
              {members.length === 0 && (
                <div style={{ padding: 10, fontSize: 12, color: "var(--quill)" }}>No team members.</div>
              )}
              {members.map(m => (
                <button key={m.id} type="button" onClick={() => setAssignee(m)} style={pickerRow}>
                  <span style={avatarStyle}>{m.initials}</span>
                  <span style={{ flex: 1, textAlign: "left" }}>{m.name}</span>
                  {task.assignee?.id === m.id ? <span style={{ color: "var(--marine, #2563eb)" }}>✓</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label style={labelStyle}>Description</label>
          <textarea className="input" style={{ width: "100%", minHeight: 100, resize: "vertical" }}
            value={task.description ?? ""}
            onChange={e => setTask({ ...task, description: e.target.value })}
            onBlur={e => save({ description: e.target.value })}
            placeholder="Add a description…"
          />
        </div>
        {task.linkLabel && (
          <div style={{ fontSize: 12, color: "var(--quill)" }}>
            Linked to: <span style={{ color: "var(--ink)" }}>{task.linkLabel}</span>
          </div>
        )}
        {saving && <div style={{ fontSize: 12, color: "var(--quill)" }}>Saving…</div>}

        <div style={{ borderTop: "1px solid var(--border-1)", paddingTop: 14 }}>
          <label style={labelStyle}>Comments</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
            {comments.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--quill)" }}>No comments yet.</div>
            )}
            {comments.map(c => (
              <div key={c.id} style={{ display: "flex", gap: 8 }}>
                <span style={avatarStyle}>{c.author.initials}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12 }}>
                    <strong>{c.author.name}</strong>{" "}
                    <span style={{ color: "var(--quill)" }}>{fmtTime(c.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{c.body}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" style={{ flex: 1 }} value={comment}
              onChange={e => setComment(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }}
              placeholder="Write a comment…" />
            <button type="button" onClick={addComment} className="btn-sm btn-primary" disabled={!comment.trim()}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const panelStyle: React.CSSProperties = {
  position: "fixed", top: 0, right: 0, width: 380, height: "100vh",
  background: "#fff", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
  zIndex: 500, display: "flex", flexDirection: "column",
  borderLeft: "1px solid var(--border-1)",
};
const headerStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "16px 20px", borderBottom: "1px solid var(--border-1)",
};
const bodyStyle: React.CSSProperties = {
  padding: 20, display: "flex", flexDirection: "column", gap: 16,
  overflowY: "auto", flex: 1,
};
const footStyle: React.CSSProperties = {
  display: "flex", justifyContent: "flex-end", gap: 8,
  padding: "12px 20px", borderTop: "1px solid var(--border-1)",
};
const ghostBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  color: "var(--quill)", fontSize: 16, padding: "4px 6px", borderRadius: 4,
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, color: "var(--quill)",
  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4,
};
const avatarStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
  background: "var(--border-1)", color: "var(--ink)", fontSize: 10, fontWeight: 600,
};
const chipStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  background: "var(--border-1)", borderRadius: 999, padding: "3px 8px 3px 3px",
  fontSize: 13,
};
const chipRemoveBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  color: "var(--quill)", fontSize: 14, lineHeight: 1, padding: "0 2px",
};
const addBtn: React.CSSProperties = {
  background: "none", border: "1px dashed var(--border-1)", cursor: "pointer",
  color: "var(--quill)", fontSize: 12, padding: "4px 10px", borderRadius: 999,
};
const pickerStyle: React.CSSProperties = {
  marginTop: 8, border: "1px solid var(--border-1)", borderRadius: 8,
  maxHeight: 200, overflowY: "auto", background: "#fff",
};
const pickerRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, width: "100%",
  background: "none", border: "none", cursor: "pointer",
  padding: "8px 10px", fontSize: 13, color: "var(--ink)",
};
