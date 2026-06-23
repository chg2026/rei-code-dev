"use client";

import { useCallback, useEffect, useState } from "react";

type QuickTask = {
  id: string;
  title: string;
  priority: string;
  dueDate: string | null;
  done: boolean;
  linkLabel: string | null;
  assignee: { id: string; name: string; initials: string } | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function priorityColor(p: string) {
  if (p === "Urgent") return "#dc2626";
  if (p === "Low") return "#16a34a";
  return "#d97706";
}

/**
 * Lightweight "Quick Tasks" panel for a department (PmSpace) overview — lists
 * the WsTasks tagged to this space (the same tasks that appear in My Tasks),
 * separate from the PM list/board tasks.
 */
export default function SpaceQuickTasks({ spaceId }: { spaceId: string }) {
  const [tasks, setTasks] = useState<QuickTask[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/workspace/tasks?spaceId=${spaceId}&done=1`, { cache: "no-store" });
      const d = await r.json();
      setTasks(d.tasks ?? []);
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (t: QuickTask) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await fetch(`/api/workspace/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: !t.done }),
    });
  };

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", width: "100%", padding: "24px 24px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary, #111)", margin: 0 }}>
          Quick Tasks{open.length ? ` (${open.length})` : ""}
        </h2>
        <span style={{ fontSize: 12, color: "var(--text-tertiary, #888)" }}>From My Tasks · tagged to this department</span>
      </div>
      {loading ? (
        <div style={{ fontSize: 13, color: "var(--text-tertiary, #888)" }}>Loading…</div>
      ) : tasks.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-tertiary, #888)", padding: "12px 0" }}>
          No quick tasks tagged to this department yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[...open, ...done].map((t) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                border: "1px solid var(--border-1, #e5e7eb)",
                borderRadius: 8,
                opacity: t.done ? 0.55 : 1,
              }}
            >
              <span
                role="checkbox"
                aria-checked={t.done}
                tabIndex={0}
                onClick={() => toggle(t)}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(t); } }}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  border: "1.5px solid var(--border-mid, #d0d4d9)",
                  background: t.done ? "var(--marine, #2563eb)" : "#fff",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >{t.done ? "✓" : ""}</span>
              <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary, #111)", textDecoration: t.done ? "line-through" : "none" }}>
                {t.title}
                {t.linkLabel ? <span style={{ color: "var(--text-tertiary, #888)" }}> · {t.linkLabel}</span> : null}
              </span>
              {t.assignee ? (
                <span style={{ fontSize: 11, color: "var(--text-tertiary, #888)" }}>{t.assignee.name.split(" ")[0]}</span>
              ) : null}
              <span style={{ fontSize: 11, fontWeight: 600, color: priorityColor(t.priority) }}>{t.priority}</span>
              {t.dueDate ? <span style={{ fontSize: 11, color: "var(--text-tertiary, #888)" }}>{fmtDate(t.dueDate)}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
