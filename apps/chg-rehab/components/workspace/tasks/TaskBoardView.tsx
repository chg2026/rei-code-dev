"use client";

import { useState } from "react";
import {
  fmtDate,
  isOverdue,
  priorityMeta,
  tint,
  type TaskSpace,
  type WsStatus,
  type WsTaskDTO,
} from "@/lib/workspace/taskMeta";
import StatusPill from "./StatusPill";
import AssigneeAvatars from "./AssigneeAvatars";
import s from "../styles.module.css";

const NO_DEPT = "__none__";

export default function TaskBoardView({
  tasks,
  spaces,
  onOpen,
  onStatusChange,
  onMove,
  onAddInSpace,
}: {
  tasks: WsTaskDTO[];
  spaces: TaskSpace[];
  onOpen: (id: string) => void;
  onStatusChange: (id: string, status: WsStatus) => void;
  onMove: (taskId: string, spaceId: string | null) => void;
  onAddInSpace: (spaceId: string | null) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const columns: { key: string; name: string; color: string | null; spaceId: string | null }[] = spaces.map((s) => ({
    key: s.id,
    name: s.name,
    color: s.color,
    spaceId: s.id,
  }));
  const hasNoDept = tasks.some((t) => !t.space);
  if (hasNoDept) columns.push({ key: NO_DEPT, name: "No Department", color: null, spaceId: null });

  const colTasks = (spaceId: string | null) =>
    tasks.filter((t) => (spaceId === null ? !t.space : t.space?.id === spaceId));

  return (
    <div className={s.taskBoard} aria-label="Task board">
      {columns.map((col) => {
        const list = colTasks(col.spaceId);
        const dot = col.color ?? "#A8A49C";
        const isOver = overCol === col.key;
        return (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(col.key);
            }}
            onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain") || dragId;
              if (id) onMove(id, col.spaceId);
              setOverCol(null);
              setDragId(null);
            }}
            style={{
              width: 296,
              flexShrink: 0,
              background: isOver ? tint(col.color, 0.12) : "var(--chg-glass-surface-2)",
              border: isOver ? `1.5px dashed ${dot}` : "1px solid var(--chg-glass-line)",
              borderRadius: 14,
              padding: 10,
              transition: "background .12s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px 10px" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: dot, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--slate, #2A2826)" }}>
                {col.name}
              </span>
              <span style={countBadge}>{list.length}</span>
              <button
                type="button"
                onClick={() => onAddInSpace(col.spaceId)}
                aria-label={`Add task to ${col.name}`}
                style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--quill, #6B6862)", fontSize: 18, lineHeight: 1 }}
              >
                +
              </button>
            </div>

            <div style={{ display: "grid", gap: 8, minHeight: 24 }}>
              {list.map((t) => {
                const overdue = isOverdue(t.dueDate, t.status);
                const showPriority = t.priority === "Urgent" || t.priority === "High";
                const pMeta = priorityMeta(t.priority);
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", t.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(t.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => onOpen(t.id)}
                    style={{
                      background: "var(--chg-glass-surface-1)",
                      borderRadius: "var(--chg-radius-sm)",
                      border: "1px solid var(--chg-glass-line)",
                      borderLeft: `3px solid ${dot}`,
                      padding: 11,
                      cursor: "pointer",
                      opacity: dragId === t.id ? 0.45 : 1,
                      boxShadow: "0 1px 2px rgba(10,10,10,0.04)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(t.id);
                      }}
                      aria-label={`Open task: ${t.title}`}
                      style={{
                        width: "100%",
                        padding: 0,
                        background: "none",
                        border: 0,
                        font: "inherit",
                        textAlign: "left",
                        cursor: "pointer",
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: "var(--ink, #0A0A0A)",
                        marginBottom: 8,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {t.title}
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }} onClick={(e) => e.stopPropagation()}>
                      <StatusPill value={t.status} onChange={(s) => onStatusChange(t.id, s)} size="sm" />
                      {showPriority ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: pMeta.color, background: tint(pMeta.color, 0.14), borderRadius: 999, padding: "2px 8px" }}>
                          {pMeta.label}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <AssigneeAvatars assignees={t.assignees} size={22} />
                      {t.dueDate ? (
                        <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: overdue ? 700 : 500, color: overdue ? "#dc2626" : "var(--quill, #6B6862)" }}>
                          {fmtDate(t.dueDate)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => onAddInSpace(col.spaceId)}
                style={{
                  width: "100%",
                  padding: "8px",
                  fontSize: 13,
                  color: "var(--quill, #6B6862)",
                  background: "transparent",
                  border: "1px dashed var(--border-2, #DCD9D2)",
                  borderRadius: 9,
                  cursor: "pointer",
                  marginTop: 2,
                }}
              >
                + Add task
              </button>
            </div>
          </div>
        );
      })}

      {columns.length === 0 ? (
        <div style={{ padding: "40px 20px", color: "var(--quill, #6B6862)", fontSize: 14 }}>
          No departments yet. Create one under Company Departments to use the board.
        </div>
      ) : null}
    </div>
  );
}

const countBadge: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--quill, #6B6862)",
  background: "rgba(255,255,255,0.7)",
  border: "1px solid var(--border-2, #DCD9D2)",
  borderRadius: 999,
  padding: "1px 8px",
};
