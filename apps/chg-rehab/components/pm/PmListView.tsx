"use client";

import React from "react";
import PmBoardView from "./PmBoardView";
import PmQuickCreate from "./PmQuickCreate";
import PmTaskDetail from "./PmTaskDetail";

interface PmListViewProps {
  tasks: any[];
  statuses: any[];
  listId: string;
  spaceId: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#EF4444",
  high: "#F59E0B",
  normal: "#3B82F6",
  low: "#9CA3AF",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

const MARINE = "#1F4D5C";

export default function PmListView({ tasks: initialTasks, statuses, listId, spaceId }: PmListViewProps) {
  const [view, setView] = React.useState<"list" | "board">("list");
  const [tasks, setTasks] = React.useState<any[]>(initialTasks);
  const [quickCreate, setQuickCreate] = React.useState<string | null>(null);
  const [taskDetailId, setTaskDetailId] = React.useState<string | null>(null);

  const tasksByStatus = React.useMemo(() => {
    const map: Record<string, any[]> = {};
    statuses.forEach((s) => { map[s.id] = []; });
    tasks.forEach((t) => {
      const sid = t.statusId ?? "__none__";
      if (!map[sid]) map[sid] = [];
      map[sid].push(t);
    });
    return map;
  }, [tasks, statuses]);

  const handleTaskCreated = (task: any) => {
    setTasks((prev) => [...prev, task]);
  };

  const handleTaskUpdated = (updated: any) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
  };

  if (view === "board") {
    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
        <Toolbar view={view} onViewChange={setView} listId={listId} onTaskCreated={handleTaskCreated} />
        <div style={{ flex: 1, overflow: "hidden" }}>
          <PmBoardView
            tasks={tasks}
            statuses={statuses}
            listId={listId}
            onTaskClick={setTaskDetailId}
            onTaskCreated={handleTaskCreated}
          />
        </div>
        {taskDetailId && (
          <PmTaskDetail
            taskId={taskDetailId}
            onClose={() => setTaskDetailId(null)}
            onUpdated={handleTaskUpdated}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <Toolbar view={view} onViewChange={setView} listId={listId} onTaskCreated={handleTaskCreated} />

      <div style={{ flex: 1, overflowY: "auto" }}>
        {statuses.map((status) => {
          const groupTasks = tasksByStatus[status.id] ?? [];
          return (
            <div key={status.id} style={{ marginBottom: 2 }}>
              {/* Group header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 16px",
                  background: "#F9FAFB",
                  borderTop: "1px solid #E5E7EB",
                  borderBottom: "1px solid #E5E7EB",
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                }}
              >
                <span
                  style={{ width: 8, height: 8, borderRadius: "50%", background: status.color, flexShrink: 0 }}
                />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", flex: 1 }}>
                  {status.name}
                  <span style={{ fontWeight: 400, color: "#9CA3AF", marginLeft: 6 }}>{groupTasks.length}</span>
                </span>
                <button
                  onClick={() => setQuickCreate(status.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#9CA3AF", padding: "2px 4px" }}
                >
                  + Add task
                </button>
              </div>

              {/* Task rows */}
              {groupTasks.map((task) => (
                <TaskRow key={task.id} task={task} onClick={() => setTaskDetailId(task.id)} />
              ))}

              {/* Quick create in this group */}
              {quickCreate === status.id && (
                <div style={{ padding: "6px 16px", borderBottom: "1px solid #E5E7EB" }}>
                  <PmQuickCreate
                    listId={listId}
                    statusId={status.id}
                    defaultStatus={status}
                    onCreated={(t) => { handleTaskCreated(t); setQuickCreate(null); }}
                    onCancel={() => setQuickCreate(null)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {taskDetailId && (
        <PmTaskDetail
          taskId={taskDetailId}
          onClose={() => setTaskDetailId(null)}
          onUpdated={handleTaskUpdated}
        />
      )}
    </div>
  );
}

function Toolbar({
  view,
  onViewChange,
  listId,
  onTaskCreated,
}: {
  view: "list" | "board";
  onViewChange: (v: "list" | "board") => void;
  listId: string;
  onTaskCreated: (t: any) => void;
}) {
  const [showCreate, setShowCreate] = React.useState(false);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        borderBottom: "1px solid #E5E7EB",
        background: "#FFFFFF",
        flexShrink: 0,
      }}
    >
      {/* View toggle */}
      <div style={{ display: "flex", border: "1px solid #E5E7EB", borderRadius: 6, overflow: "hidden" }}>
        {(["list", "board"] as const).map((v) => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: view === v ? 600 : 400,
              background: view === v ? MARINE : "#fff",
              color: view === v ? "#fff" : "#6B7280",
              border: "none",
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {v === "list" ? "≡ List" : "⬛ Board"}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {showCreate ? (
        <div style={{ width: 280 }}>
          <PmQuickCreate
            listId={listId}
            onCreated={(t) => { onTaskCreated(t); setShowCreate(false); }}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "5px 12px",
            background: MARINE,
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          + New Task
        </button>
      )}
    </div>
  );
}

function TaskRow({ task, onClick }: { task: any; onClick: () => void }) {
  const hasSubtasks = task._count?.subtasks > 0;
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = dueDate && dueDate < new Date() && task.status?.type !== "done";

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        borderBottom: "1px solid #F3F4F6",
        cursor: "pointer",
        background: "#fff",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#F9FAFB")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#fff")}
    >
      {/* Expand arrow placeholder */}
      <span style={{ width: 14, color: "#D1D5DB", fontSize: 10 }}>{hasSubtasks ? "▸" : ""}</span>

      {/* Task type icon */}
      <span style={{ fontSize: 13 }}>
        {task.taskType === "bug" ? "🐛" : task.taskType === "feature" ? "✨" : task.taskType === "milestone" ? "🎯" : "☐"}
      </span>

      {/* Name */}
      <span style={{ flex: 1, fontSize: 13, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {task.name}
      </span>

      {/* Assignee avatars */}
      <div style={{ display: "flex", gap: 2 }}>
        {(task.assignees ?? []).slice(0, 3).map((a: any) => (
          <div
            key={a.userId}
            title={`${a.user.firstName ?? ""} ${a.user.lastName ?? ""}`.trim()}
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: MARINE,
              color: "#fff",
              fontSize: 8,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {a.user.initials ?? "?"}
          </div>
        ))}
      </div>

      {/* Due date */}
      {dueDate && (
        <span style={{ fontSize: 11, color: isOverdue ? "#EF4444" : "#9CA3AF", minWidth: 60, textAlign: "right" }}>
          {dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      )}

      {/* Priority */}
      {task.priority && task.priority !== "normal" && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 4,
            background: `${PRIORITY_COLORS[task.priority]}20`,
            color: PRIORITY_COLORS[task.priority],
          }}
        >
          {PRIORITY_LABELS[task.priority]}
        </span>
      )}

      {/* Status chip */}
      {task.status && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 10,
            background: `${task.status.color}20`,
            color: task.status.color,
            minWidth: 60,
            textAlign: "center",
          }}
        >
          {task.status.name}
        </span>
      )}
    </div>
  );
}
