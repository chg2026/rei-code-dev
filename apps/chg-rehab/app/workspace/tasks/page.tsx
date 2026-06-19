"use client";

import { useCallback, useState } from "react";
import s from "@/components/workspace/styles.module.css";
import TodoTab from "@/components/workspace/TodoTab";
import TaskDetailPanel from "@/components/workspace/TaskDetailPanel";

export default function MyTasksPage() {
  const [creatingTask, setCreatingTask] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const onTaskCreated = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>My Tasks</h1>
          <div className={s.subtitle}>All tasks assigned to you</div>
        </div>
        <div className={s.actions}>
          <button type="button" className={s.btn} onClick={() => setCreatingTask(true)}>+ New task</button>
        </div>
      </div>
      <div className={s.body}>
        <TodoTab refreshKey={refreshKey} />
      </div>
      {creatingTask && (
        <TaskDetailPanel
          mode="create"
          onCreated={(id) => { setCreatingTask(false); setDetailTaskId(id); onTaskCreated(); }}
          onClose={() => setCreatingTask(false)}
        />
      )}
      {detailTaskId && (
        <TaskDetailPanel
          mode="edit"
          taskId={detailTaskId}
          onClose={() => setDetailTaskId(null)}
          onDeleted={() => { setDetailTaskId(null); onTaskCreated(); }}
          onUpdated={() => onTaskCreated()}
        />
      )}
    </div>
  );
}
