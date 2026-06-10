"use client";

import { useCallback, useEffect, useState } from "react";
import PmQuickCreate from "./PmQuickCreate";
import PmTaskDetail from "./PmTaskDetail";
import PmBoardView from "./PmBoardView";
import { PRIORITY_COLORS, type PmStatus, type PmTaskRow } from "./types";

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function PmListView({
  tasks: initialTasks,
  statuses,
  listId,
  spaceId,
}: {
  tasks: PmTaskRow[];
  statuses: PmStatus[];
  listId: string;
  spaceId: string;
}) {
  const [tasks, setTasks] = useState<PmTaskRow[]>(initialTasks);
  const [view, setView] = useState<"list" | "board">("list");
  const [quickCreate, setQuickCreate] = useState<string | null>(null);
  const [taskDetailId, setTaskDetailId] = useState<string | null>(null);

  useEffect(() => { setTasks(initialTasks); }, [initialTasks]);

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/pm/lists/${listId}/tasks`, { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      setTasks(d.tasks ?? []);
    }
  }, [listId]);

  const defaultStatus = statuses.find((s) => s.isDefault)?.id ?? statuses[0]?.id ?? null;

  const onAddTask = (statusId: string) => {
    setView("list");
    setQuickCreate(statusId);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "0.5px solid var(--border-lo)" }}>
        <div style={{ display: "flex", border: "1px solid var(--border-mid)", borderRadius: 6, overflow: "hidden" }}>
          {(["list", "board"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              style={{ padding: "5px 12px", fontSize: 12, fontFamily: "inherit", textTransform: "capitalize", border: "none", cursor: "pointer", background: view === v ? "var(--marine)" : "var(--bg-primary)", color: view === v ? "#fff" : "var(--text-secondary)" }}
            >
              {v}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => onAddTask(defaultStatus ?? "")} style={{ padding: "6px 12px", fontSize: 12, fontFamily: "inherit", background: "var(--marine)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>+ New Task</button>
        <span style={{ flex: 1 }} />
        <button type="button" disabled style={btnMuted}>Filter</button>
        <button type="button" disabled style={btnMuted}>Group by Status</button>
      </div>

      {view === "board" ? (
        <PmBoardView tasks={tasks} statuses={statuses} listId={listId} onAddTask={onAddTask} onOpenTask={setTaskDetailId} />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 24px" }}>
          {statuses.map((st) => {
            const groupTasks = tasks.filter((t) => t.statusId === st.id);
            return (
              <div key={st.id} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: st.color }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{st.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{groupTasks.length}</span>
                  <button type="button" onClick={() => setQuickCreate(st.id)} style={{ fontSize: 12, color: "var(--marine)", background: "transparent", border: "none", cursor: "pointer", marginLeft: 4 }}>+ Add task</button>
                </div>

                <div style={{ border: "0.5px solid var(--border-lo)", borderRadius: 8, overflow: "hidden" }}>
                  {groupTasks.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => setTaskDetailId(t.id)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: "0.5px solid var(--border-lo)", cursor: "pointer", background: "var(--bg-primary)" }}
                    >
                      <span style={{ width: 14, color: "var(--text-tertiary)", fontSize: 11 }}>{t.subtaskCount > 0 ? "▸" : ""}</span>
                      <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)" }}>{t.name}</span>
                      <div style={{ display: "flex" }}>
                        {t.assignees.slice(0, 3).map((a, i) => (
                          <span key={a.id} title={a.name} style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--marine)", color: "#fff", fontSize: 9, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", marginLeft: i ? -6 : 0, border: "1.5px solid var(--bg-primary)" }}>{a.initials}</span>
                        ))}
                      </div>
                      {t.dueDate ? <span style={{ fontSize: 12, color: "var(--text-tertiary)", minWidth: 56, textAlign: "right" }}>{fmtDate(t.dueDate)}</span> : null}
                      {t.priority ? <span style={{ fontSize: 11, fontWeight: 600, color: PRIORITY_COLORS[t.priority] || "var(--text-tertiary)", textTransform: "capitalize" }}>{t.priority}</span> : null}
                      {t.status ? <span style={{ fontSize: 11, fontWeight: 600, color: t.status.color, background: `${t.status.color}1A`, padding: "2px 8px", borderRadius: 10 }}>{t.status.name}</span> : null}
                    </div>
                  ))}

                  {quickCreate === st.id ? (
                    <div style={{ padding: "8px 12px", background: "var(--bg-primary)" }}>
                      <PmQuickCreate listId={listId} statusId={st.id} defaultStatus={defaultStatus} onCreated={() => { refresh(); }} onCancel={() => setQuickCreate(null)} />
                    </div>
                  ) : groupTasks.length === 0 ? (
                    <div onClick={() => setQuickCreate(st.id)} style={{ padding: "9px 12px", fontSize: 12, color: "var(--text-tertiary)", cursor: "pointer", background: "var(--bg-primary)" }}>+ Add task</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {taskDetailId ? (
        <PmTaskDetail
          taskId={taskDetailId}
          onClose={() => setTaskDetailId(null)}
          onUpdated={() => { refresh(); }}
        />
      ) : null}
    </div>
  );
}

const btnMuted: React.CSSProperties = { padding: "6px 12px", fontSize: 12, fontFamily: "inherit", background: "var(--bg-secondary)", color: "var(--text-tertiary)", border: "1px solid var(--border-lo)", borderRadius: 6, cursor: "not-allowed" };
