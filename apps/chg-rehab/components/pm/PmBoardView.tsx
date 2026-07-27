"use client";

import React from "react";
import PmQuickCreate from "./PmQuickCreate";

interface PmBoardViewProps {
  tasks: any[];
  statuses: any[];
  listId: string;
  onTaskClick: (taskId: string) => void;
  onTaskCreated: (task: any) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#EF4444",
  high: "#F59E0B",
  normal: "#3B82F6",
  low: "#9CA3AF",
};

export default function PmBoardView({ tasks, statuses, listId, onTaskClick, onTaskCreated }: PmBoardViewProps) {
  const [quickCreate, setQuickCreate] = React.useState<string | null>(null);

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

  return (
    <div style={{ display: "flex", gap: 12, padding: 16, overflowX: "auto", flex: 1, alignItems: "flex-start" }}>
      {statuses.map((status) => {
        const colTasks = tasksByStatus[status.id] ?? [];
        return (
          <div
            key={status.id}
            style={{
              minWidth: 220,
              width: 220,
              background: "#F9FAFB",
              borderRadius: 8,
              border: "1px solid #E5E7EB",
              display: "flex",
              flexDirection: "column",
              maxHeight: "100%",
              overflow: "hidden",
            }}
          >
            {/* Column header */}
            <div
              style={{
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                gap: 6,
                borderBottom: "1px solid #E5E7EB",
              }}
            >
              <span
                style={{ width: 8, height: 8, borderRadius: "50%", background: status.color, flexShrink: 0 }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", flex: 1 }}>{status.name}</span>
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>{colTasks.length}</span>
            </div>

            {/* Cards */}
            <div style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {colTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => onTaskClick(task.id)}
                  style={{
                    background: "#FFFFFF",
                    borderRadius: 6,
                    padding: 10,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                    cursor: "pointer",
                    border: "1px solid #E5E7EB",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#111827", marginBottom: 8 }}>{task.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {task.assignees?.slice(0, 2).map((a: any) => (
                      <div
                        key={a.userId}
                        title={`${a.user.firstName ?? ""} ${a.user.lastName ?? ""}`.trim()}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "#1F4D5C",
                          color: "#fff",
                          fontSize: 9,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {a.user.initials ?? "?"}
                      </div>
                    ))}
                    {task.dueDate && (
                      <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: "auto" }}>
                        {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                    {task.priority && task.priority !== "normal" && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: PRIORITY_COLORS[task.priority] ?? "#9CA3AF",
                        }}
                      />
                    )}
                  </div>
                </div>
              ))}

              {/* Quick create */}
              {quickCreate === status.id ? (
                <PmQuickCreate
                  listId={listId}
                  statusId={status.id}
                  defaultStatus={status}
                  onCreated={(t) => { onTaskCreated(t); setQuickCreate(null); }}
                  onCancel={() => setQuickCreate(null)}
                />
              ) : (
                <button
                  onClick={() => setQuickCreate(status.id)}
                  style={{
                    background: "none",
                    border: "1px dashed #D1D5DB",
                    borderRadius: 6,
                    padding: "7px 10px",
                    fontSize: 12,
                    color: "#9CA3AF",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  + Add task
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
