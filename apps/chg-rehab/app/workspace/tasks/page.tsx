"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import s from "@/components/workspace/styles.module.css";
import {
  STATUS_ORDER,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isTaskSpace(value: unknown): value is TaskSpace {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && isNullableString(value.color);
}

function isTaskAssignee(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.user)) return false;
  const user = value.user;
  return typeof user.id === "string" && typeof user.name === "string" && typeof user.initials === "string" && isNullableString(user.avatarUrl);
}

function isOptionalPerson(value: unknown, includeInitials = false): boolean {
  if (value === null) return true;
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && (!includeInitials || typeof value.initials === "string");
}

function isWorkspaceTask(value: unknown): value is WsTaskDTO {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.priority === "string"
    && typeof value.status === "string"
    && STATUS_ORDER.includes(value.status as WsStatus)
    && typeof value.isPrivate === "boolean"
    && isNullableString(value.dueDate)
    && typeof value.done === "boolean"
    && isNullableString(value.linkLabel)
    && (value.space === null || isTaskSpace(value.space))
    && Array.isArray(value.assignees)
    && value.assignees.every(isTaskAssignee)
    && isOptionalPerson(value.assignee, true)
    && isOptionalPerson(value.createdBy)
    && typeof value.createdAt === "string";
}

export default function MyTasksPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [view, setView] = useState<ViewMode>("list");
  const [personFilter, setPersonFilter] = useState("");
  const [tasks, setTasks] = useState<WsTaskDTO[]>([]);
  const [spaces, setSpaces] = useState<TaskSpace[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    setLoadError(null);
    const params = new URLSearchParams({ view: tab });
    if (personFilter) params.set("userId", personFilter);
    fetch(`/api/workspace/tasks?${params.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Unable to load tasks right now.");
        return r.json();
      })
      .then((d) => {
        if (!Array.isArray(d.tasks) || !d.tasks.every(isWorkspaceTask)) throw new Error("The task response was incomplete.");
        if (alive) setTasks(d.tasks);
      })
      .catch((error: unknown) => {
        if (alive) setLoadError(error instanceof Error ? error.message : "Unable to load tasks right now.");
      })
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
          <section className={s.workspaceState} role="status" aria-live="polite">
            <div className={s.workspaceStateIcon} aria-hidden="true">◎</div>
            <h2 className={s.workspaceStateTitle}>Loading tasks…</h2>
            <p className={s.workspaceStateCopy}>Gathering work across your departments.</p>
          </section>
        ) : loadError ? (
          <section className={`${s.workspaceState} ${s.workspaceStateError}`} role="alert">
            <div className={s.workspaceStateIcon} aria-hidden="true">!</div>
            <h2 className={s.workspaceStateTitle}>Unable to load tasks</h2>
            <p className={s.workspaceStateCopy}>{loadError}</p>
            <button type="button" className={s.btn} onClick={refresh}>Try again</button>
          </section>
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
