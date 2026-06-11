"use client";

import PmQuickCreate from "./PmQuickCreate";
import { PRIORITY_COLORS, type PmStatus, type PmTaskRow } from "./types";

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function PmBoardView({
  tasks,
  statuses,
  listId,
  onAddTask,
  onOpenTask,
  quickCreateStatusId,
  onQuickCreateDone,
  onQuickCreateCancel,
}: {
  tasks: PmTaskRow[];
  statuses: PmStatus[];
  listId: string;
  onAddTask: (statusId: string) => void;
  onOpenTask: (taskId: string) => void;
  quickCreateStatusId?: string | null;
  onQuickCreateDone?: () => void;
  onQuickCreateCancel?: () => void;
}) {
  return (
    <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", display: "flex", alignItems: "flex-start", padding: 8 }}>
      {statuses.map((st) => {
        const colTasks = tasks.filter((t) => t.statusId === st.id);
        return (
          <div key={st.id} style={{ minWidth: 240, maxWidth: 240, background: "var(--bg-secondary)", borderRadius: 8, margin: 8, display: "flex", flexDirection: "column", maxHeight: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 12px" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: st.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{st.name}</span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{colTasks.length}</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
              {colTasks.map((t) => (
                <div
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  style={{ background: "var(--bg-primary)", borderRadius: 6, padding: 10, boxShadow: "var(--shadow-sm)", border: "0.5px solid var(--border-lo)", cursor: "pointer" }}
                >
                  <div style={{ fontSize: 13, color: "var(--text-primary)", marginBottom: 8, lineHeight: 1.35 }}>{t.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {t.priority ? <span title={t.priority} style={{ width: 8, height: 8, borderRadius: "50%", background: PRIORITY_COLORS[t.priority] || "var(--text-tertiary)" }} /> : null}
                    {t.dueDate ? <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{fmtDate(t.dueDate)}</span> : null}
                    <span style={{ flex: 1 }} />
                    <div style={{ display: "flex" }}>
                      {t.assignees.slice(0, 3).map((a, i) => (
                        <span key={a.id} title={a.name} style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--marine)", color: "#fff", fontSize: 9, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", marginLeft: i ? -6 : 0, border: "1.5px solid var(--bg-primary)" }}>{a.initials}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {quickCreateStatusId === st.id && (
                <div style={{ padding: "4px 8px" }}>
                  <PmQuickCreate
                    listId={listId}
                    statusId={st.id}
                    defaultStatus={st.id}
                    onCreated={(newId?: string) => {
                      onQuickCreateDone?.();
                      if (newId) onOpenTask(newId);
                    }}
                    onCancel={() => onQuickCreateCancel?.()}
                  />
                </div>
              )}
              <button type="button" onClick={() => onAddTask(st.id)} style={{ textAlign: "left", padding: "6px 8px", fontSize: 12, color: "var(--text-tertiary)", background: "transparent", border: "none", cursor: "pointer", borderRadius: 6 }}>+ Add task</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
