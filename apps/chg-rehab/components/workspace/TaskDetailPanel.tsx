"use client";
import { useEffect, useState } from "react";

type TeamMember = { id: string; name: string; initials: string };
type TaskDetail = {
  id: string; title: string; priority: string; dueDate: string | null;
  done: boolean; description: string | null;
  assignee: { id: string; name: string; initials: string } | null;
  linkLabel: string | null; createdAt: string;
};

export default function TaskDetailPanel({
  taskId, onClose, onDeleted, onUpdated,
}: { taskId: string; onClose: () => void; onDeleted: () => void; onUpdated: () => void }) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/workspace/tasks/${taskId}`)
      .then(r => r.json()).then(d => setTask(d.task ?? null));
    fetch("/api/workspace/mentions")
      .then(r => r.json()).then(d => setMembers(d.users ?? []));
  }, [taskId]);

  const save = async (patch: Record<string, unknown>) => {
    if (!task) return;
    setSaving(true);
    setTask(prev => (prev ? ({ ...prev, ...patch } as TaskDetail) : prev));
    await fetch(`/api/workspace/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    onUpdated();
  };

  const deleteTask = async () => {
    if (!window.confirm("Delete this task?")) return;
    await fetch(`/api/workspace/tasks/${taskId}`, { method: "DELETE" });
    onDeleted();
  };

  if (!task) return (
    <div style={panelStyle}>
      <div style={{ padding: 24, color: "var(--quill)" }}>Loading…</div>
    </div>
  );

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--border-1)" }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>Task detail</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={deleteTask} style={ghostBtn} title="Delete">🗑</button>
          <button type="button" onClick={onClose} style={ghostBtn}>✕</button>
        </div>
      </div>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", flex: 1 }}>
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
          <select className="input" style={{ width: "100%" }}
            value={task.assignee?.id ?? ""}
            onChange={e => {
              const id = e.target.value || null;
              const m = id ? members.find(mm => mm.id === id) ?? null : null;
              setTask({ ...task, assignee: m });
              save({ assigneeId: id });
            }}>
            <option value="">Unassigned</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Notes</label>
          <textarea className="input" style={{ width: "100%", minHeight: 100, resize: "vertical" }}
            value={task.description ?? ""}
            onChange={e => setTask({ ...task, description: e.target.value })}
            onBlur={e => save({ description: e.target.value })}
            placeholder="Add notes…"
          />
        </div>
        {task.linkLabel && (
          <div style={{ fontSize: 12, color: "var(--quill)" }}>
            Linked to: <span style={{ color: "var(--ink)" }}>{task.linkLabel}</span>
          </div>
        )}
        {saving && <div style={{ fontSize: 12, color: "var(--quill)" }}>Saving…</div>}
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: "fixed", top: 0, right: 0, width: 380, height: "100vh",
  background: "#fff", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
  zIndex: 500, display: "flex", flexDirection: "column",
  borderLeft: "1px solid var(--border-1)",
};
const ghostBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  color: "var(--quill)", fontSize: 16, padding: "4px 6px", borderRadius: 4,
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, color: "var(--quill)",
  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4,
};
