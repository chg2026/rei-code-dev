"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import TaskDetailPanel from "@/components/workspace/TaskDetailPanel";

type Task = {
  id: string; title: string; priority: string; dueDate: string | null;
  done: boolean; assignee: { id: string; name: string; initials: string } | null;
};

export default function PropertyTasksTab({ propertyId, propertyLabel }: { propertyId: string; propertyLabel: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/workspace/tasks?linkType=property&linkId=${propertyId}&done=1`, { cache: "no-store" });
    const d = await r.json();
    setTasks(d.tasks ?? []);
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setMounted(true); }, [load]);

  const toggleDone = async (t: Task) => {
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, done: !x.done } : x));
    await fetch(`/api/workspace/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: !t.done }),
    });
  };

  const open = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);

  return (
    <div style={{ padding: "24px 0", maxWidth: 680 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>Tasks <span style={{ color: "var(--quill)", fontWeight: 400, fontSize: 13 }}>({open.length} open)</span></div>
        <button className="btn-sm btn-primary" onClick={() => setCreating(true)}>+ New task</button>
      </div>

      {loading ? (
        <div style={{ color: "var(--quill)", fontSize: 14 }}>Loading…</div>
      ) : open.length === 0 && done.length === 0 ? (
        <div style={{ color: "var(--quill)", fontSize: 14 }}>No tasks yet for this property.</div>
      ) : (
        <>
          {open.map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border-1)" }}>
              <span
                role="checkbox" aria-checked={false} tabIndex={0}
                onClick={() => toggleDone(t)}
                onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleDone(t); } }}
                style={{ width: 16, height: 16, border: "2px solid var(--border-2)", borderRadius: 4, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
              />
              <span style={{ flex: 1, fontSize: 14, cursor: "pointer" }} onClick={() => setDetailTaskId(t.id)}>{t.title}</span>
              {t.dueDate ? <span style={{ fontSize: 12, color: "var(--quill)" }}>{new Date(t.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span> : null}
              <span style={{ fontSize: 12, color: t.priority === "Urgent" ? "#ef4444" : t.priority === "Low" ? "#10b981" : "#f59e0b" }}>{t.priority}</span>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm("Delete this task?")) return;
                  setTasks(prev => prev.filter(x => x.id !== t.id));
                  await fetch(`/api/workspace/tasks/${t.id}`, { method: "DELETE" });
                }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--quill)", fontSize: 14, padding: "0 4px", flexShrink: 0 }}
                title="Delete task"
              >✕</button>
            </div>
          ))}
          {done.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: "var(--stone)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "20px 0 8px" }}>Completed</div>
              {done.map(t => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border-1)", opacity: 0.5 }}>
                  <span
                    role="checkbox" aria-checked={true} tabIndex={0}
                    onClick={() => toggleDone(t)}
                    style={{ width: 16, height: 16, border: "2px solid var(--border-2)", borderRadius: 4, cursor: "pointer", flexShrink: 0, background: "var(--marine)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11 }}
                  >✓</span>
                  <span style={{ flex: 1, fontSize: 14, textDecoration: "line-through", cursor: "pointer" }} onClick={() => setDetailTaskId(t.id)}>{t.title}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm("Delete this task?")) return;
                      setTasks(prev => prev.filter(x => x.id !== t.id));
                      await fetch(`/api/workspace/tasks/${t.id}`, { method: "DELETE" });
                    }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--quill)", fontSize: 14, padding: "0 4px", flexShrink: 0 }}
                    title="Delete task"
                  >✕</button>
                </div>
              ))}
            </>
          )}
        </>
      )}
      {mounted && creating && createPortal(
        <TaskDetailPanel
          mode="create"
          linkType="property"
          linkId={propertyId}
          linkLabel={propertyLabel}
          onCreated={(id) => { setCreating(false); setDetailTaskId(id); load(); }}
          onClose={() => setCreating(false)}
        />,
        document.body
      )}
      {mounted && detailTaskId && createPortal(
        <TaskDetailPanel
          mode="edit"
          taskId={detailTaskId}
          onClose={() => setDetailTaskId(null)}
          onDeleted={() => { setDetailTaskId(null); load(); }}
          onUpdated={() => load()}
        />,
        document.body
      )}
    </div>
  );
}
