"use client";

import { useCallback, useEffect, useState } from "react";
import s from "./styles.module.css";

type Task = {
  id: string;
  title: string;
  priority: "Urgent" | "Medium" | "Low" | string;
  dueDate: string | null;
  done: boolean;
  linkLabel: string | null;
  assignee: { id: string; name: string; initials: string } | null;
};

type PmTask = {
  id: string;
  name: string;
  priority: string | null;
  dueDate: string | null;
  done: boolean;
  listName: string;
  spaceName: string;
  listHref: string;
  assignees: { id: string; name: string; initials: string }[];
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "assigned-out", label: "Assigned out" },
] as const;

function priorityClass(p: string) {
  if (p === "Urgent") return s.pillRed;
  if (p === "Low") return s.pillGreen;
  return s.pillAmber;
}

function fmtDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function TodoTab({ refreshKey }: { refreshKey?: number }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pmTasks, setPmTasks] = useState<PmTask[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/workspace/tasks?filter=${filter}&done=1`, { cache: "no-store" }),
        fetch("/api/pm/tasks", { cache: "no-store" }),
      ]);
      const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
      setTasks(d1.tasks ?? []);
      setPmTasks(d2.tasks ?? []);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const toggleDone = async (t: Task) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await fetch(`/api/workspace/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: !t.done }),
    });
  };

  const togglePmDone = async (t: PmTask) => {
    const newDone = !t.done;
    setPmTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: newDone } : x)));
    await fetch(`/api/pm/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ doneDate: newDone ? new Date().toISOString() : null }),
    });
  };

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div>
      <div className={s.filterBar}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`${s.filterBtn} ${filter === f.id ? s.active : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className={s.empty}>Loading…</div>
      ) : open.length === 0 && done.length === 0 && pmTasks.length === 0 ? (
        <div className={s.empty}>No tasks yet. Click <strong>+ New task</strong> to create one.</div>
      ) : (
        <>
          {open.map((t) => (
            <div key={t.id} className={s.row}>
              <span
                role="checkbox"
                aria-checked={t.done}
                tabIndex={0}
                className={`${s.checkbox} ${t.done ? s.checked : ""}`}
                onClick={() => toggleDone(t)}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleDone(t); } }}
              >{t.done ? "✓" : ""}</span>
              <div className={s.rowMain}>
                <div className={`${s.rowTitle} ${t.done ? s.done : ""}`}>
                  {t.title}{t.linkLabel ? <span style={{ color: "var(--quill)", fontWeight: 400 }}> · {t.linkLabel}</span> : null}
                </div>
              </div>
              <div className={s.rowRight}>
                {t.assignee ? (
                  <span className={s.avatarChip}>
                    <span className={s.avatar}>{t.assignee.initials}</span>
                    <span style={{ fontSize: 12 }}>{t.assignee.name.split(" ")[0]}</span>
                  </span>
                ) : null}
                <span className={`${s.pill} ${priorityClass(t.priority)}`}>{t.priority}</span>
                {t.dueDate ? <span className={`${s.pill} ${s.pillGrey}`}>{fmtDate(t.dueDate)}</span> : null}
              </div>
            </div>
          ))}
          {pmTasks.length > 0 ? (
            <>
              <div style={{ fontSize: 11, color: "var(--stone)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "20px 0 8px" }}>
                Project Manager Tasks
              </div>
              {pmTasks.map((t) => (
                <div key={t.id} className={s.row} style={t.done ? { opacity: 0.6 } : undefined}>
                  <span
                    role="checkbox"
                    aria-checked={t.done}
                    tabIndex={0}
                    className={`${s.checkbox} ${t.done ? s.checked : ""}`}
                    onClick={() => togglePmDone(t)}
                    onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); togglePmDone(t); } }}
                  >{t.done ? "✓" : ""}</span>
                  <div className={s.rowMain}>
                    <div className={`${s.rowTitle} ${t.done ? s.done : ""}`}>{t.name}</div>
                  </div>
                  <div className={s.rowRight}>
                    {t.assignees.length > 0 ? (
                      <span className={s.avatarChip}>
                        <span className={s.avatar}>{t.assignees[0].initials}</span>
                        <span style={{ fontSize: 12 }}>{t.assignees[0].name.split(" ")[0]}</span>
                      </span>
                    ) : null}
                    <a href={t.listHref} style={{ textDecoration: "none" }}>
                      <span className={`${s.pill} ${s.pillGrey}`}>{t.spaceName} · {t.listName}</span>
                    </a>
                    {t.priority ? <span className={`${s.pill} ${priorityClass(t.priority)}`}>{t.priority}</span> : null}
                    {t.dueDate ? <span className={`${s.pill} ${s.pillGrey}`}>{fmtDate(t.dueDate)}</span> : null}
                  </div>
                </div>
              ))}
            </>
          ) : null}
          {done.length > 0 ? (
            <>
              <div style={{ fontSize: 11, color: "var(--stone)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "20px 0 8px" }}>
                Completed
              </div>
              {done.map((t) => (
                <div key={t.id} className={s.row} style={{ opacity: 0.6 }}>
                  <span
                    role="checkbox"
                    aria-checked
                    tabIndex={0}
                    className={`${s.checkbox} ${s.checked}`}
                    onClick={() => toggleDone(t)}
                  >✓</span>
                  <div className={s.rowMain}>
                    <div className={`${s.rowTitle} ${s.done}`}>{t.title}</div>
                  </div>
                </div>
              ))}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
