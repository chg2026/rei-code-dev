"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PRIORITY_ORDER,
  priorityMeta,
  statusMeta,
  tint,
  fmtDate,
  type TaskSpace,
  type TeamMember,
  type WsStatus,
} from "@/lib/workspace/taskMeta";
import StatusPill from "./StatusPill";
import AssigneeMultiSelect from "./AssigneeMultiSelect";

type ActivityItem = {
  id: string;
  action: string;
  detail: string | null;
  createdAt: string;
  user: { id: string; name: string; initials: string };
};

export type TaskGlassModalProps = {
  mode: "create" | "edit";
  taskId?: string;
  spaces: TaskSpace[];
  members: TeamMember[];
  initialSpaceId?: string;
  initialPrivate?: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
  onDeleted?: () => void;
};

export default function TaskGlassModal({
  mode,
  taskId,
  spaces,
  members,
  initialSpaceId = "",
  initialPrivate = false,
  onClose,
  onSaved,
  onDeleted,
}: TaskGlassModalProps) {
  const [title, setTitle] = useState("");
  const [spaceId, setSpaceId] = useState(initialPrivate ? "" : initialSpaceId);
  const [isPrivate, setIsPrivate] = useState(initialPrivate);
  const [status, setStatus] = useState<WsStatus>("NotStarted");
  const [priority, setPriority] = useState("Low");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [loading, setLoading] = useState(mode === "edit");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (mode !== "edit" || !taskId) return;
    let alive = true;
    setLoading(true);
    fetch(`/api/workspace/tasks/${taskId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d.task) return;
        const t = d.task;
        setTitle(t.title ?? "");
        setSpaceId(t.space?.id ?? "");
        setIsPrivate(Boolean(t.isPrivate));
        setStatus((t.status as WsStatus) ?? "NotStarted");
        setPriority(t.priority ?? "Low");
        setDueDate(t.dueDate ? t.dueDate.slice(0, 10) : "");
        setDescription(t.description ?? "");
        setAssigneeIds((t.assignees ?? []).map((a: { user: { id: string } }) => a.user.id));
        setActivity(t.activity ?? []);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [mode, taskId]);

  const selectedSpace = useMemo(() => spaces.find((s) => s.id === spaceId) ?? null, [spaces, spaceId]);

  const save = useCallback(async () => {
    setErr(null);
    if (!title.trim()) {
      setErr("Task name is required.");
      return;
    }
    if (!isPrivate && !spaceId) {
      setErr("Please select a department.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        spaceId: isPrivate ? null : spaceId || null,
        isPrivate,
        status,
        priority,
        dueDate: dueDate || null,
        description,
        assigneeIds,
      };
      const url = mode === "create" ? "/api/workspace/tasks" : `/api/workspace/tasks/${taskId}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const r = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Failed to save task");
      onSaved(data.id ?? taskId ?? "");
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [title, isPrivate, spaceId, status, priority, dueDate, description, assigneeIds, mode, taskId, onSaved, onClose]);

  const remove = useCallback(async () => {
    if (!taskId || !window.confirm("Delete this task?")) return;
    setBusy(true);
    try {
      await fetch(`/api/workspace/tasks/${taskId}`, { method: "DELETE" });
      onDeleted?.();
      onClose();
    } finally {
      setBusy(false);
    }
  }, [taskId, onDeleted, onClose]);

  const pMeta = priorityMeta(priority);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.3)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "6vh 16px 16px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.6)",
          borderRadius: 20,
          boxShadow: "0 24px 60px rgba(10,10,10,0.22)",
          padding: 22,
        }}
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--quill, #6B6862)" }}>Loading…</div>
        ) : (
          <>
            {/* Top row: scope badge | status | priority | close */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setScopeOpen((v) => !v)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "5px 11px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    color: isPrivate ? "var(--slate, #2A2826)" : selectedSpace?.color ?? "var(--marine, #1F4D5C)",
                    background: isPrivate ? "var(--bone, #F5F4F0)" : tint(selectedSpace?.color ?? null, 0.14),
                    border: `1px solid ${isPrivate ? "var(--border-2, #DCD9D2)" : tint(selectedSpace?.color ?? null, 0.34)}`,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: isPrivate ? "var(--stone, #A8A49C)" : selectedSpace?.color ?? "var(--marine, #1F4D5C)",
                    }}
                  />
                  {isPrivate ? "My Workspace (private)" : selectedSpace?.name ?? "Select department"}
                  <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
                </button>
                {scopeOpen ? (
                  <ScopeMenu
                    spaces={spaces}
                    isPrivate={isPrivate}
                    spaceId={spaceId}
                    onPickPrivate={() => {
                      setIsPrivate(true);
                      setSpaceId("");
                      setScopeOpen(false);
                    }}
                    onPickSpace={(id) => {
                      setIsPrivate(false);
                      setSpaceId(id);
                      setScopeOpen(false);
                    }}
                    onClose={() => setScopeOpen(false)}
                  />
                ) : null}
              </div>
              <StatusPill value={status} onChange={setStatus} size="sm" />
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                aria-label="Priority"
                style={{
                  padding: "4px 8px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: pMeta.color,
                  background: tint(pMeta.color, 0.12),
                  border: `1px solid ${tint(pMeta.color, 0.3)}`,
                  borderRadius: 999,
                  cursor: "pointer",
                }}
              >
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {priorityMeta(p).label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  marginLeft: "auto",
                  background: "none",
                  border: "none",
                  fontSize: 22,
                  lineHeight: 1,
                  color: "var(--quill, #6B6862)",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            {/* Title */}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task name"
              autoFocus
              style={{
                width: "100%",
                fontSize: 22,
                fontWeight: 700,
                color: "var(--ink, #0A0A0A)",
                border: "none",
                background: "transparent",
                outline: "none",
                marginBottom: 18,
              }}
            />

            {/* Fields grid */}
            <div style={{ display: "grid", gap: 16 }}>
              <Field label="Assignees">
                <AssigneeMultiSelect members={members} value={assigneeIds} onChange={setAssigneeIds} />
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <Field label="Due date">
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Department">
                  <button
                    type="button"
                    onClick={() => setScopeOpen((v) => !v)}
                    disabled={isPrivate}
                    style={{
                      ...inputStyle,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      textAlign: "left",
                      cursor: isPrivate ? "not-allowed" : "pointer",
                      color: isPrivate ? "var(--stone, #A8A49C)" : "var(--ink, #0A0A0A)",
                    }}
                  >
                    {isPrivate ? (
                      "— Private —"
                    ) : selectedSpace ? (
                      <>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: selectedSpace.color ?? "var(--marine, #1F4D5C)" }} />
                        {selectedSpace.name}
                      </>
                    ) : (
                      <span style={{ color: "var(--stone, #A8A49C)" }}>Select…</span>
                    )}
                  </button>
                </Field>
              </div>

              <Field label="Notes">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Add details…"
                  style={{ ...inputStyle, resize: "vertical", minHeight: 90 }}
                />
              </Field>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                  color: "var(--slate, #2A2826)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => {
                    setIsPrivate(e.target.checked);
                    if (e.target.checked) setSpaceId("");
                  }}
                />
                Only visible to me (private)
              </label>
            </div>

            {/* Activity */}
            {mode === "edit" ? (
              <div style={{ marginTop: 20, borderTop: "1px solid var(--border-2, #DCD9D2)", paddingTop: 14 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--stone, #A8A49C)", marginBottom: 8 }}>
                  Activity
                </div>
                {activity.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--quill, #6B6862)" }}>No activity yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    {activity.slice(0, 12).map((a) => (
                      <div key={a.id} style={{ fontSize: 12.5, color: "var(--quill, #6B6862)" }}>
                        <strong style={{ color: "var(--slate, #2A2826)" }}>{a.user.name}</strong> {actionText(a.action)}
                        {a.detail ? ` · ${a.detail}` : ""} <span style={{ opacity: 0.7 }}>· {fmtDate(a.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {err ? <div style={{ marginTop: 14, color: "#dc2626", fontSize: 13 }}>{err}</div> : null}

            {/* Footer */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 20 }}>
              {mode === "edit" ? (
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 13, padding: "8px 4px" }}
                >
                  Delete
                </button>
              ) : null}
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button type="button" onClick={onClose} disabled={busy} style={ghostBtn}>
                  Cancel
                </button>
                <button type="button" onClick={save} disabled={busy || !title.trim()} style={primaryBtn}>
                  {busy ? "Saving…" : mode === "create" ? "Create task" : "Save"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ScopeMenu({
  spaces,
  isPrivate,
  spaceId,
  onPickPrivate,
  onPickSpace,
  onClose,
}: {
  spaces: TaskSpace[];
  isPrivate: boolean;
  spaceId: string;
  onPickPrivate: () => void;
  onPickSpace: (id: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onDoc = () => onClose();
    const t = window.setTimeout(() => document.addEventListener("click", onDoc), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("click", onDoc);
    };
  }, [onClose]);
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        marginTop: 4,
        minWidth: 220,
        maxHeight: 280,
        overflowY: "auto",
        background: "#fff",
        border: "1px solid var(--border-2, #DCD9D2)",
        borderRadius: 12,
        boxShadow: "0 12px 32px rgba(0,0,0,0.16)",
        zIndex: 90,
        padding: 4,
      }}
    >
      <button type="button" onClick={onPickPrivate} style={scopeItem(isPrivate)}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--stone, #A8A49C)" }} />
        <span style={{ flex: 1 }}>My Workspace (private)</span>
        {isPrivate ? <span>✓</span> : null}
      </button>
      <div style={{ height: 1, background: "var(--border-2, #DCD9D2)", margin: "4px 0" }} />
      {spaces.length === 0 ? (
        <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--quill, #6B6862)" }}>No departments yet.</div>
      ) : (
        spaces.map((sp) => {
          const active = !isPrivate && sp.id === spaceId;
          return (
            <button key={sp.id} type="button" onClick={() => onPickSpace(sp.id)} style={scopeItem(active)}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: sp.color ?? "var(--marine, #1F4D5C)" }} />
              <span style={{ flex: 1 }}>{sp.name}</span>
              {active ? <span>✓</span> : null}
            </button>
          );
        })
      )}
    </div>
  );
}

function actionText(action: string): string {
  switch (action) {
    case "created":
      return "created this task";
    case "completed":
      return "completed this task";
    case "status_changed":
      return "changed status to";
    case "assigned":
      return "assigned";
    case "due_date_set":
      return "set due date to";
    default:
      return action;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--stone, #A8A49C)", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  fontSize: 13,
  color: "var(--ink, #0A0A0A)",
  background: "#fff",
  border: "1px solid var(--border-2, #DCD9D2)",
  borderRadius: 8,
  outline: "none",
};

function scopeItem(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 9px",
    fontSize: 13,
    textAlign: "left",
    background: active ? "var(--bone, #F5F4F0)" : "transparent",
    border: "none",
    borderRadius: 7,
    cursor: "pointer",
    color: "var(--slate, #2A2826)",
  };
}

const ghostBtn: React.CSSProperties = {
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--slate, #2A2826)",
  background: "transparent",
  border: "1px solid var(--border-2, #DCD9D2)",
  borderRadius: 9,
  cursor: "pointer",
};

const primaryBtn: React.CSSProperties = {
  padding: "9px 18px",
  fontSize: 13,
  fontWeight: 600,
  color: "#fff",
  background: "var(--marine, #1F4D5C)",
  border: "1px solid var(--marine, #1F4D5C)",
  borderRadius: 9,
  cursor: "pointer",
};
