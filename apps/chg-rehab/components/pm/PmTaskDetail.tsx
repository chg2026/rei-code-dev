"use client";

import React from "react";

interface PmTaskDetailProps {
  taskId: string;
  onClose: () => void;
  onUpdated: (task: any) => void;
}

const MARINE = "#1F4D5C";

const PRIORITIES = ["urgent", "high", "normal", "low"] as const;
const TASK_TYPES = ["task", "bug", "feature", "milestone"] as const;
const PRIORITY_COLORS: Record<string, string> = { urgent: "#EF4444", high: "#F59E0B", normal: "#3B82F6", low: "#9CA3AF" };

export default function PmTaskDetail({ taskId, onClose, onUpdated }: PmTaskDetailProps) {
  const [task, setTask] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [commentText, setCommentText] = React.useState("");
  const [savingComment, setSavingComment] = React.useState(false);
  const [subtaskInput, setSubtaskInput] = React.useState("");
  const [addingSubtask, setAddingSubtask] = React.useState(false);

  const fetchTask = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pm/tasks/${taskId}`);
      const data = await res.json();
      if (data.task) setTask(data.task);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  React.useEffect(() => { fetchTask(); }, [fetchTask]);

  const patch = async (updates: Record<string, any>) => {
    const res = await fetch(`/api/pm/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (data.task) {
      setTask((prev: any) => ({ ...prev, ...data.task }));
      onUpdated({ ...task, ...data.task });
    }
  };

  const submitComment = async () => {
    if (!commentText.trim()) return;
    setSavingComment(true);
    try {
      const res = await fetch(`/api/pm/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentText.trim() }),
      });
      const data = await res.json();
      if (data.comment) {
        setTask((prev: any) => ({ ...prev, comments: [...(prev.comments ?? []), data.comment] }));
        setCommentText("");
      }
    } finally {
      setSavingComment(false);
    }
  };

  const addSubtask = async () => {
    if (!subtaskInput.trim() || !task) return;
    setAddingSubtask(true);
    try {
      const res = await fetch(`/api/pm/lists/${task.listId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: subtaskInput.trim(), statusId: task.statusId, parentTaskId: taskId }),
      });
      // Note: parentTaskId isn't directly on the create body in our API, but we add it via a separate patch
      const data = await res.json();
      if (data.task) {
        // Patch to set parentTaskId
        await fetch(`/api/pm/tasks/${data.task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentTaskId: taskId }),
        });
        setTask((prev: any) => ({ ...prev, subtasks: [...(prev.subtasks ?? []), data.task] }));
        setSubtaskInput("");
      }
    } finally {
      setAddingSubtask(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.15)", zIndex: 199 }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: 480,
          height: "100vh",
          background: "#FFFFFF",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
          zIndex: 200,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "#9CA3AF", fontSize: 13 }}>
            Loading…
          </div>
        ) : !task ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "#9CA3AF", fontSize: 13 }}>
            Task not found
          </div>
        ) : (
          <>
            {/* Header */}
            <div
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid #E5E7EB",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "#F3F4F6",
                  color: "#6B7280",
                  textTransform: "uppercase",
                  marginTop: 3,
                  flexShrink: 0,
                }}
              >
                {task.taskType ?? "task"}
              </span>
              <h1
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => {
                  const val = e.currentTarget.textContent?.trim();
                  if (val && val !== task.name) patch({ name: val });
                }}
                style={{
                  flex: 1,
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#111827",
                  lineHeight: 1.4,
                  outline: "none",
                  borderBottom: "1px solid transparent",
                }}
                onFocus={(e) => (e.currentTarget.style.borderBottomColor = MARINE)}
              >
                {task.name}
              </h1>
              <button
                onClick={onClose}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#6B7280", padding: 2, flexShrink: 0 }}
              >
                ✕
              </button>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
              {/* Fields grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  marginBottom: 16,
                  padding: 14,
                  background: "#F9FAFB",
                  borderRadius: 8,
                  border: "1px solid #E5E7EB",
                }}
              >
                <Field label="Status">
                  <select
                    value={task.statusId ?? ""}
                    onChange={(e) => patch({ statusId: e.target.value || null })}
                    style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4, border: "1px solid #D1D5DB", background: "#fff", width: "100%" }}
                  >
                    <option value="">— None —</option>
                    {(task.list?.space?.statuses ?? []).map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Priority">
                  <select
                    value={task.priority ?? "normal"}
                    onChange={(e) => patch({ priority: e.target.value })}
                    style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4, border: "1px solid #D1D5DB", background: "#fff", width: "100%" }}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p} style={{ color: PRIORITY_COLORS[p] }}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Start date">
                  <input
                    type="date"
                    value={task.startDate ? task.startDate.slice(0, 10) : ""}
                    onChange={(e) => patch({ startDate: e.target.value || null })}
                    style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4, border: "1px solid #D1D5DB", background: "#fff", width: "100%" }}
                  />
                </Field>

                <Field label="Due date">
                  <input
                    type="date"
                    value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
                    onChange={(e) => patch({ dueDate: e.target.value || null })}
                    style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4, border: "1px solid #D1D5DB", background: "#fff", width: "100%" }}
                  />
                </Field>

                <Field label="Task type">
                  <select
                    value={task.taskType ?? "task"}
                    onChange={(e) => patch({ taskType: e.target.value })}
                    style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4, border: "1px solid #D1D5DB", background: "#fff", width: "100%" }}
                  >
                    {TASK_TYPES.map((t) => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Sprint points">
                  <input
                    type="number"
                    min={0}
                    value={task.sprintPoints ?? ""}
                    onChange={(e) => patch({ sprintPoints: e.target.value ? Number(e.target.value) : null })}
                    style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4, border: "1px solid #D1D5DB", background: "#fff", width: "100%" }}
                  />
                </Field>

                <Field label="Time estimate (min)">
                  <input
                    type="number"
                    min={0}
                    value={task.timeEstimate ?? ""}
                    onChange={(e) => patch({ timeEstimate: e.target.value ? Number(e.target.value) : null })}
                    style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4, border: "1px solid #D1D5DB", background: "#fff", width: "100%" }}
                  />
                </Field>

                <Field label="Assignees">
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(task.assignees ?? []).map((a: any) => (
                      <div
                        key={a.userId}
                        title={`${a.user.firstName ?? ""} ${a.user.lastName ?? ""}`.trim()}
                        style={{
                          width: 22, height: 22, borderRadius: "50%",
                          background: MARINE, color: "#fff", fontSize: 9, fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "default",
                        }}
                      >
                        {a.user.initials ?? "?"}
                      </div>
                    ))}
                  </div>
                </Field>
              </div>

              {/* Description */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                  Description
                </label>
                <textarea
                  defaultValue={task.description ?? ""}
                  placeholder="Add description…"
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val !== (task.description ?? "")) patch({ description: val || null });
                  }}
                  rows={4}
                  style={{
                    width: "100%",
                    fontSize: 13,
                    padding: "8px 10px",
                    border: "1px solid #E5E7EB",
                    borderRadius: 6,
                    resize: "vertical",
                    outline: "none",
                    color: "#374151",
                    background: "#fff",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Subtasks */}
              <Section label={`Subtasks (${task.subtasks?.length ?? 0})`}>
                {(task.subtasks ?? []).map((sub: any) => (
                  <div
                    key={sub.id}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #F3F4F6" }}
                  >
                    <input
                      type="checkbox"
                      checked={sub.status?.type === "done"}
                      onChange={() => {}}
                      readOnly
                      style={{ flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 13, color: sub.status?.type === "done" ? "#9CA3AF" : "#111827", flex: 1, textDecoration: sub.status?.type === "done" ? "line-through" : "none" }}>
                      {sub.name}
                    </span>
                    {sub.assignees?.slice(0, 1).map((a: any) => (
                      <div
                        key={a.userId}
                        style={{ width: 18, height: 18, borderRadius: "50%", background: MARINE, color: "#fff", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        {a.user.initials ?? "?"}
                      </div>
                    ))}
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input
                    placeholder="+ Add subtask"
                    value={subtaskInput}
                    onChange={(e) => setSubtaskInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addSubtask(); }}
                    style={{ flex: 1, fontSize: 12, padding: "5px 8px", border: "1px solid #E5E7EB", borderRadius: 4, outline: "none" }}
                  />
                  {subtaskInput && (
                    <button
                      onClick={addSubtask}
                      disabled={addingSubtask}
                      style={{ fontSize: 11, fontWeight: 600, padding: "5px 10px", background: MARINE, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
                    >
                      Add
                    </button>
                  )}
                </div>
              </Section>

              {/* Comments */}
              <Section label={`Comments (${task.comments?.length ?? 0})`}>
                {(task.comments ?? []).map((c: any) => (
                  <div key={c.id} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: MARINE, color: "#fff", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {c.user.initials ?? "?"}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                        {[c.user.firstName, c.user.lastName].filter(Boolean).join(" ") || "User"}
                      </span>
                      <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                        {new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p style={{ margin: "0 0 0 26px", fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{c.body}</p>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <textarea
                    placeholder="Write a comment…"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) submitComment(); }}
                    rows={2}
                    style={{ flex: 1, fontSize: 12, padding: "6px 8px", border: "1px solid #E5E7EB", borderRadius: 4, resize: "none", outline: "none", fontFamily: "inherit" }}
                  />
                  <button
                    onClick={submitComment}
                    disabled={savingComment || !commentText.trim()}
                    style={{ fontSize: 11, fontWeight: 600, padding: "5px 10px", background: MARINE, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", alignSelf: "flex-end" }}
                  >
                    {savingComment ? "…" : "Send"}
                  </button>
                </div>
              </Section>

              {/* Activity */}
              <div style={{ marginBottom: 16 }}>
                <button
                  onClick={() => setActivityOpen((v) => !v)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", padding: 0 }}
                >
                  {activityOpen ? "▾" : "▸"} Activity ({task.activity?.length ?? 0})
                </button>
                {activityOpen && (
                  <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: "2px solid #E5E7EB" }}>
                    {(task.activity ?? []).map((a: any) => (
                      <div key={a.id} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#E5E7EB", color: "#6B7280", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                          {a.user?.initials ?? "?"}
                        </div>
                        <div>
                          <span style={{ fontSize: 12, color: "#374151" }}>
                            <strong>{[a.user?.firstName, a.user?.lastName].filter(Boolean).join(" ") || "User"}</strong>{" "}
                            {a.type.replace(/_/g, " ")}
                          </span>
                          <span style={{ display: "block", fontSize: 11, color: "#9CA3AF" }}>
                            {new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
