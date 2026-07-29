"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import s from "@/components/workspace/styles.module.css";
import {
  type TaskSpace,
  type TeamMember,
  type WsStatus,
  type WsTaskDTO,
} from "@/lib/workspace/taskMeta";
import TaskListView from "@/components/workspace/tasks/TaskListView";
import TaskBoardView from "@/components/workspace/tasks/TaskBoardView";
import TaskGlassModal from "@/components/workspace/tasks/TaskGlassModal";

type Tab = "all" | "private" | "assignedOut";
type ViewMode = "list" | "board";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "private", label: "My Workspace" },
  { key: "assignedOut", label: "Assigned out" },
];

export default function MyTasksPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [view, setView] = useState<ViewMode>("list");
  const [personFilter, setPersonFilter] = useState("");
  const [tasks, setTasks] = useState<WsTaskDTO[]>([]);
  const [spaces, setSpaces] = useState<TaskSpace[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [creating, setCreating] = useState(false);
  const [createSpaceId, setCreateSpaceId] = useState<string>("");
  const [createPrivate, setCreatePrivate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Static lookups (departments + members).
  useEffect(() => {
    fetch("/api/pm/spaces", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setSpaces((d.spaces ?? []).map((sp: TaskSpace) => ({ id: sp.id, name: sp.name, color: sp.color ?? null }))))
      .catch(() => undefined);
    fetch("/api/workspace/mentions", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMembers(d.users ?? []))
      .catch(() => undefined);
  }, []);

  // Task list — refetched on tab / person filter / refreshKey.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams({ view: tab });
    if (personFilter) params.set("userId", personFilter);
    fetch(`/api/workspace/tasks?${params.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (alive) setTasks(d.tasks ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tab, personFilter, refreshKey]);

  const onStatusChange = useCallback((id: string, status: WsStatus) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status, done: status === "Done" } : t)));
    fetch(`/api/workspace/tasks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => refresh());
  }, [refresh]);

  const onMove = useCallback((id: string, spaceId: string | null) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, space: spaceId ? spaces.find((sp) => sp.id === spaceId) ?? null : null } : t,
      ),
    );
    fetch(`/api/workspace/tasks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spaceId }),
    }).catch(() => refresh());
  }, [spaces, refresh]);

  const onDelete = useCallback((id: string) => {
    if (!window.confirm("Delete this task?")) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    fetch(`/api/workspace/tasks/${id}`, { method: "DELETE" }).catch(() => refresh());
  }, [refresh]);

  const onDuplicate = useCallback((task: WsTaskDTO) => {
    fetch("/api/workspace/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: `${task.title} (copy)`,
        spaceId: task.space?.id ?? null,
        isPrivate: task.isPrivate,
        status: "NotStarted",
        priority: task.priority,
        dueDate: task.dueDate,
        assigneeIds: task.assignees.map((a) => a.user.id),
      }),
    })
      .then(() => refresh())
      .catch(() => undefined);
  }, [refresh]);

  const openCreate = useCallback(
    (spaceId: string | null) => {
      setCreateSpaceId(spaceId ?? "");
      setCreatePrivate(tab === "private");
      setCreating(true);
    },
    [tab],
  );

  const personOptions = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name)),
    [members],
  );

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Tasks</h1>
          <div className={s.subtitle}>Plan, assign and track work across departments</div>
        </div>
        <div className={s.actions}>
          <button type="button" className={s.btn} onClick={() => openCreate(tab === "private" ? null : "")}>
            + New task
          </button>
        </div>
      </div>

      {/* Toolbar: tabs · view toggle · person filter */}
      <div className={s.toolbar}>
        <div className={s.taskTabs}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`${s.taskTab} ${active ? s.taskTabActive : ""}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className={s.toolbarControls}>
          <select
            className={s.filterSelect}
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value)}
            aria-label="Filter by person"

          >
            <option value="">Everyone</option>
            {personOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <div className={s.viewToggle}>
            <ToggleBtn active={view === "list"} onClick={() => setView("list")} label="List" />
            <ToggleBtn active={view === "board"} onClick={() => setView("board")} label="Board" />
          </div>
        </div>
      </div>

      <div className={s.body}>
        {loading ? (
          <div className={s.empty}>Loading tasks…</div>
        ) : view === "list" ? (
          <TaskListView
            tab={tab}
            tasks={tasks}
            spaces={spaces}
            onOpen={setEditId}
            onStatusChange={onStatusChange}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
          />
        ) : (
          <TaskBoardView
            tasks={tasks}
            spaces={spaces}
            onOpen={setEditId}
            onStatusChange={onStatusChange}
            onMove={onMove}
            onAddInSpace={(spaceId) => {
              setCreateSpaceId(spaceId ?? "");
              setCreatePrivate(false);
              setCreating(true);
            }}
          />
        )}
      </div>

      {creating ? (
        <TaskGlassModal
          mode="create"
          spaces={spaces}
          members={members}
          initialSpaceId={createSpaceId}
          initialPrivate={createPrivate}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refresh();
          }}
        />
      ) : null}

      {editId ? (
        <TaskGlassModal
          mode="edit"
          taskId={editId}
          spaces={spaces}
          members={members}
          onClose={() => setEditId(null)}
          onSaved={() => {
            setEditId(null);
            refresh();
          }}
          onDeleted={() => {
            setEditId(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function ToggleBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${s.toggleButton} ${active ? s.toggleButtonActive : ""}`}
    >
      {label}
    </button>
  );
}
