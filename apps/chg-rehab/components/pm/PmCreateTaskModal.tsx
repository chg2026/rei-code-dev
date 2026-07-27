"use client";

import React from "react";

const MARINE = "#1F4D5C";
const PRIORITIES = ["urgent", "high", "normal", "low"];
const TASK_TYPES = ["task", "bug", "feature", "milestone"];

type Props = {
  listId: string;
  statuses: any[];
  defaultStatusId?: string;
  onCreated: (task: any) => void;
  onClose: () => void;
};

type User = { id: string; name: string; initials: string };

export default function PmCreateTaskModal({ listId, statuses, defaultStatusId, onCreated, onClose }: Props) {
  const defaultStatus = defaultStatusId ?? statuses.find((s) => s.isDefault)?.id ?? statuses[0]?.id ?? "";
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [statusId, setStatusId] = React.useState(defaultStatus);
  const [priority, setPriority] = React.useState("normal");
  const [taskType, setTaskType] = React.useState("task");
  const [startDate, setStartDate] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [timeEstimate, setTimeEstimate] = React.useState("");
  const [sprintPoints, setSprintPoints] = React.useState("");
  const [users, setUsers] = React.useState<User[]>([]);
  const [assigneeIds, setAssigneeIds] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/workspace/mentions", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setUsers(data.users ?? []))
      .catch(() => setUsers([]));
  }, []);

  const submit = async () => {
    if (!name.trim()) { setError("Task name is required."); return; }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/pm/lists/${listId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          statusId: statusId || null,
          priority,
          taskType,
          startDate: startDate || null,
          dueDate: dueDate || null,
          timeEstimate: timeEstimate ? Math.round(Number(timeEstimate) * 60) : null,
          sprintPoints: sprintPoints ? Number(sprintPoints) : null,
          assigneeIds,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.task) throw new Error(data.error || "Could not create task");
      onCreated(data.task);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create task");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(15,23,42,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="pm-create-title" style={{ width: "min(620px, 100%)", maxHeight: "calc(100vh - 32px)", overflowY: "auto", background: "#fff", borderRadius: 10, boxShadow: "0 20px 50px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #E5E7EB" }}>
          <h2 id="pm-create-title" style={{ margin: 0, fontSize: 18, color: "#111827" }}>New task</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: 0, background: "none", fontSize: 24, color: "#6B7280", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <label style={labelStyle}>Task name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="What needs to be done?" style={inputStyle} /></label>
          <label style={labelStyle}>Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add details…" rows={4} style={{ ...inputStyle, resize: "vertical" }} /></label>
          <div style={rowStyle}>
            <label style={labelStyle}>Status<select value={statusId} onChange={(e) => setStatusId(e.target.value)} style={inputStyle}>{statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label style={labelStyle}>Priority<select value={priority} onChange={(e) => setPriority(e.target.value)} style={inputStyle}>{PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select></label>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Task type<select value={taskType} onChange={(e) => setTaskType(e.target.value)} style={inputStyle}>{TASK_TYPES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select></label>
            <label style={labelStyle}>Assignees<select multiple value={assigneeIds} onChange={(e) => setAssigneeIds(Array.from(e.target.selectedOptions, (o) => o.value))} style={{ ...inputStyle, minHeight: 76 }}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Start date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} /></label>
            <label style={labelStyle}>Due date<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} /></label>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Time estimate (hours)<input type="number" min="0" step="0.5" value={timeEstimate} onChange={(e) => setTimeEstimate(e.target.value)} style={inputStyle} /></label>
            <label style={labelStyle}>Sprint points<input type="number" min="0" step="1" value={sprintPoints} onChange={(e) => setSprintPoints(e.target.value)} style={inputStyle} /></label>
          </div>
          {error ? <div role="alert" style={{ color: "#B91C1C", background: "#FEF2F2", padding: "9px 10px", borderRadius: 6, fontSize: 13 }}>{error}</div> : null}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 20px", borderTop: "1px solid #E5E7EB" }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ ...buttonStyle, background: "#fff", color: "#4B5563", border: "1px solid #D1D5DB" }}>Cancel</button>
          <button type="button" onClick={submit} disabled={saving || !name.trim()} style={{ ...buttonStyle, background: MARINE, color: "#fff", border: "1px solid" + MARINE }}>{saving ? "Saving…" : "Save task"}</button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "grid", gap: 6, fontSize: 12, color: "#64748B", fontWeight: 600 };
const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "9px 10px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 14, color: "#111827", background: "#fff", fontWeight: 400 };
const rowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 };
const buttonStyle: React.CSSProperties = { borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
