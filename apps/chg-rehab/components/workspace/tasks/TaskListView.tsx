"use client";

import { useEffect, useRef, useState } from "react";
import {
  fmtDate,
  isOverdue,
  tint,
  type TaskSpace,
  type WsStatus,
  type WsTaskDTO,
} from "@/lib/workspace/taskMeta";
import StatusPill from "./StatusPill";
import PriorityFlag from "./PriorityFlag";
import AssigneeAvatars from "./AssigneeAvatars";

type Tab = "all" | "private" | "assignedOut";

const NO_DEPT = "__none__";

export default function TaskListView({
  tab,
  tasks,
  spaces,
  onOpen,
  onStatusChange,
  onDelete,
  onDuplicate,
}: {
  tab: Tab;
  tasks: WsTaskDTO[];
  spaces: TaskSpace[];
  onOpen: (id: string) => void;
  onStatusChange: (id: string, status: WsStatus) => void;
  onDelete: (id: string) => void;
  onDuplicate: (task: WsTaskDTO) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (tasks.length === 0) {
    return (
      <div style={emptyStyle}>
        No tasks here yet. Click <strong>+ New task</strong> to create one.
      </div>
    );
  }

  if (tab !== "all") {
    return (
      <div>
        {tab === "private" ? (
          <div style={bannerStyle}>Your private workspace — only you can see these tasks.</div>
        ) : null}
        <div style={{ display: "grid", gap: 6 }}>
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              showDept={tab === "assignedOut"}
              onOpen={onOpen}
              onStatusChange={onStatusChange}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
            />
          ))}
        </div>
      </div>
    );
  }

  // "all" tab — group by department.
  const groups: { key: string; name: string; color: string | null; tasks: WsTaskDTO[] }[] = [];
  for (const sp of spaces) {
    const inSpace = tasks.filter((t) => t.space?.id === sp.id);
    if (inSpace.length) groups.push({ key: sp.id, name: sp.name, color: sp.color, tasks: inSpace });
  }
  const noDept = tasks.filter((t) => !t.space);
  if (noDept.length) groups.push({ key: NO_DEPT, name: "No Department", color: null, tasks: noDept });

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key);
        const dot = g.color ?? "#A8A49C";
        return (
          <div key={g.key}>
            <button
              type="button"
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(g.key)) next.delete(g.key);
                  else next.add(g.key);
                  return next;
                })
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "8px 12px",
                background: tint(g.color, 0.1),
                border: "none",
                borderRadius: 10,
                cursor: "pointer",
                marginBottom: 6,
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: dot, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--slate, #2A2826)" }}>
                {g.name}
              </span>
              <span style={countBadge}>{g.tasks.length}</span>
              <span style={{ marginLeft: "auto", color: "var(--quill, #6B6862)", fontSize: 12, transform: isCollapsed ? "rotate(-90deg)" : "none", transition: "transform .15s" }}>
                ▾
              </span>
            </button>
            {!isCollapsed ? (
              <div style={{ display: "grid", gap: 6 }}>
                {g.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    showDept={false}
                    onOpen={onOpen}
                    onStatusChange={onStatusChange}
                    onDelete={onDelete}
                    onDuplicate={onDuplicate}
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function TaskRow({
  task,
  showDept,
  onOpen,
  onStatusChange,
  onDelete,
  onDuplicate,
}: {
  task: WsTaskDTO;
  showDept: boolean;
  onOpen: (id: string) => void;
  onStatusChange: (id: string, status: WsStatus) => void;
  onDelete: (id: string) => void;
  onDuplicate: (task: WsTaskDTO) => void;
}) {
  const overdue = isOverdue(task.dueDate, task.status);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 12px",
        background: "#fff",
        border: "1px solid var(--border-2, #DCD9D2)",
        borderRadius: 10,
      }}
    >
      <StatusPill value={task.status} onChange={(s) => onStatusChange(task.id, s)} size="sm" />
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 14,
          color: "var(--ink, #0A0A0A)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {task.title}
        {task.linkLabel ? <span style={{ color: "var(--quill, #6B6862)", fontWeight: 400 }}> · {task.linkLabel}</span> : null}
      </button>
      {showDept && task.space ? (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 999,
            color: task.space.color ?? "var(--marine, #1F4D5C)",
            background: tint(task.space.color, 0.14),
            whiteSpace: "nowrap",
          }}
        >
          {task.space.name}
        </span>
      ) : null}
      <PriorityFlag priority={task.priority} />
      <AssigneeAvatars assignees={task.assignees} size={24} />
      {task.dueDate ? (
        <span style={{ fontSize: 12, fontWeight: overdue ? 700 : 500, color: overdue ? "#dc2626" : "var(--quill, #6B6862)", whiteSpace: "nowrap" }}>
          {fmtDate(task.dueDate)}
        </span>
      ) : null}
      <RowMenu task={task} onOpen={onOpen} onDelete={onDelete} onDuplicate={onDuplicate} />
    </div>
  );
}

function RowMenu({
  task,
  onOpen,
  onDelete,
  onDuplicate,
}: {
  task: WsTaskDTO;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (task: WsTaskDTO) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Task actions"
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--quill, #6B6862)", fontSize: 16, padding: "0 4px", lineHeight: 1 }}
      >
        ⋯
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            minWidth: 130,
            background: "#fff",
            border: "1px solid var(--border-2, #DCD9D2)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
            zIndex: 70,
            padding: 4,
          }}
        >
          <button type="button" style={menuItem} onClick={() => { setOpen(false); onOpen(task.id); }}>Edit</button>
          <button type="button" style={menuItem} onClick={() => { setOpen(false); onDuplicate(task); }}>Duplicate</button>
          <button type="button" style={{ ...menuItem, color: "#dc2626" }} onClick={() => { setOpen(false); onDelete(task.id); }}>Delete</button>
        </div>
      ) : null}
    </div>
  );
}

const menuItem: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "7px 10px",
  fontSize: 13,
  textAlign: "left",
  background: "transparent",
  border: "none",
  borderRadius: 7,
  cursor: "pointer",
  color: "var(--slate, #2A2826)",
};

const countBadge: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--quill, #6B6862)",
  background: "rgba(255,255,255,0.7)",
  border: "1px solid var(--border-2, #DCD9D2)",
  borderRadius: 999,
  padding: "1px 8px",
};

const emptyStyle: React.CSSProperties = {
  padding: "40px 20px",
  textAlign: "center",
  color: "var(--quill, #6B6862)",
  fontSize: 14,
};

const bannerStyle: React.CSSProperties = {
  padding: "10px 14px",
  marginBottom: 12,
  background: "var(--bone, #F5F4F0)",
  border: "1px solid var(--border-2, #DCD9D2)",
  borderRadius: 10,
  fontSize: 13,
  color: "var(--quill, #6B6862)",
};
