"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import PhotoAttachButton from "./PhotoAttachButton";
import PhotoStrip, { type StripPhoto } from "./PhotoStrip";
import {
  BILLING_BLOCKED_CODE,
  notifyBillingBlocked,
} from "@/lib/billing-blocked-client";

export type IssueRow = {
  id: string;
  type: "Issue" | "Question";
  title: string;
  description: string | null;
  status: "Open" | "InProgress" | "Resolved";
  phaseId: string | null;
  phaseLabel: string | null;
  assigneeId: string | null;
  assignee: string | null;
  createdBy: string | null;
  createdAtLabel: string;
  resolvedAtLabel: string | null;
  photos: StripPhoto[];
};

export type PhaseOption = { id: string; number: number; name: string };
export type TeamOption = { id: string; name: string };

const STATUS_LABEL: Record<IssueRow["status"], string> = {
  Open: "Open",
  InProgress: "In Progress",
  Resolved: "Resolved",
};

const STATUS_FILTERS = ["All", "Open", "InProgress", "Resolved"] as const;
const TYPE_FILTERS = ["All", "Issue", "Question"] as const;

function statusChipStyle(status: IssueRow["status"]): React.CSSProperties {
  if (status === "Resolved") return { background: "var(--green-bg)", color: "var(--green-txt)" };
  if (status === "InProgress") return { background: "var(--amber-bg)", color: "var(--amber-txt)" };
  return { background: "var(--red-bg)", color: "var(--red-txt)" };
}

export default function IssuesBoardClient({
  projectCode,
  issues,
  phases,
  team,
  canEdit,
}: {
  projectCode: string;
  issues: IssueRow[];
  phases: PhaseOption[];
  team: TeamOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("All");
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]>("All");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ type: "Issue", title: "", description: "", phaseId: "", assigneeId: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const base = `/api/rehab/${encodeURIComponent(projectCode)}/issues`;

  async function apiJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      if (res.status === 402 || body?.code === BILLING_BLOCKED_CODE) notifyBillingBlocked();
      throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${res.status})`);
    }
    return body;
  }

  const filtered = useMemo(
    () =>
      issues.filter(
        (i) =>
          (statusFilter === "All" || i.status === statusFilter) &&
          (typeFilter === "All" || i.type === typeFilter)
      ),
    [issues, statusFilter, typeFilter]
  );

  const openCount = issues.filter((i) => i.status !== "Resolved").length;

  function submit() {
    setError(null);
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    startTransition(async () => {
      try {
        await apiJson(base, {
          method: "POST",
          body: JSON.stringify({
            type: form.type,
            title: form.title,
            description: form.description,
            phaseId: form.phaseId || null,
            assigneeId: form.assigneeId || null,
          }),
        });
        setForm({ type: "Issue", title: "", description: "", phaseId: "", assigneeId: "" });
        setFormOpen(false);
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to create");
      }
    });
  }

  function setStatus(issueId: string, status: string) {
    setError(null);
    startTransition(async () => {
      try {
        await apiJson(`${base}/${issueId}`, { method: "PATCH", body: JSON.stringify({ status }) });
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to update status");
      }
    });
  }

  function remove(issueId: string) {
    if (!window.confirm("Delete this item?")) return;
    startTransition(async () => {
      try {
        await apiJson(`${base}/${issueId}`, { method: "DELETE" });
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to delete");
      }
    });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "5px 8px",
    fontSize: 11,
    border: "0.5px solid var(--border-mid)",
    borderRadius: 3,
  };

  const chip = (active: boolean): React.CSSProperties => ({
    padding: "2px 9px",
    borderRadius: 999,
    fontSize: 10,
    cursor: "pointer",
    border: "0.5px solid var(--border-mid)",
    background: active ? "var(--marine, var(--blue))" : "transparent",
    color: active ? "#fff" : "var(--text-secondary)",
  });

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div className="proj-bar" style={{ borderTop: "0.5px solid var(--border-lo)" }}>
        <div className="proj-l" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span className="proj-addr" style={{ fontSize: 11, marginRight: 6 }}>
            {openCount} open · {issues.length} total
          </span>
          {STATUS_FILTERS.map((s) => (
            <button key={s} style={chip(statusFilter === s)} onClick={() => setStatusFilter(s)}>
              {s === "InProgress" ? "In Progress" : s}
            </button>
          ))}
          <span style={{ width: 8 }} />
          {TYPE_FILTERS.map((t) => (
            <button key={t} style={chip(typeFilter === t)} onClick={() => setTypeFilter(t)}>
              {t === "All" ? "All types" : t === "Issue" ? "Issues" : "Questions"}
            </button>
          ))}
        </div>
        <div className="proj-r">
          {canEdit && (
            <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={() => setFormOpen((v) => !v)} disabled={pending}>
              + New
            </button>
          )}
        </div>
      </div>

      {formOpen && (
        <div style={{ margin: "10px 14px", padding: 12, border: "0.5px solid var(--border-mid)", borderRadius: 6, background: "var(--bg-secondary)", maxWidth: 640 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>New issue / question</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 120 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Type</div>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} disabled={pending} style={inputStyle}>
                <option value="Issue">Issue</option>
                <option value="Question">Question</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Title</div>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} disabled={pending} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Description</div>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} disabled={pending} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Job type (optional)</div>
              <select value={form.phaseId} onChange={(e) => setForm({ ...form, phaseId: e.target.value })} disabled={pending} style={inputStyle}>
                <option value="">—</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>Job Type {p.number} — {p.name}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Assignee (optional)</div>
              <select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })} disabled={pending} style={inputStyle}>
                <option value="">—</option>
                {team.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>
          {error && <div style={{ fontSize: 10, color: "var(--red-txt)", marginBottom: 6 }}>{error}</div>}
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button className="btn-sm" onClick={() => setFormOpen(false)} disabled={pending}>Cancel</button>
            <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={submit} disabled={pending}>
              {pending ? "Saving..." : "Create"}
            </button>
          </div>
        </div>
      )}

      {!formOpen && error && (
        <div style={{ margin: "8px 14px", fontSize: 10, color: "var(--red-txt)" }}>{error}</div>
      )}

      {filtered.length === 0 && (
        <div style={{ padding: "18px 14px", fontSize: 11, color: "var(--text-tertiary)" }}>
          {issues.length === 0 ? "No issues or questions yet." : "Nothing matches the current filters."}
        </div>
      )}

      {filtered.map((issue) => (
        <div key={issue.id} style={{ margin: "10px 14px", padding: 12, border: "0.5px solid var(--border-lo)", borderRadius: 6, maxWidth: 720 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              className="mapped-pill"
              style={{
                fontSize: 9,
                background: issue.type === "Question" ? "var(--blue-bg, #E8F0FB)" : "var(--red-bg)",
                color: issue.type === "Question" ? "var(--blue-txt, #1F4FA8)" : "var(--red-txt)",
              }}
            >
              {issue.type}
            </span>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{issue.title}</div>
            <span className="mapped-pill" style={{ fontSize: 9, ...statusChipStyle(issue.status) }}>
              {STATUS_LABEL[issue.status]}
            </span>
            <span style={{ flex: 1 }} />
            {canEdit ? (
              <select
                value={issue.status}
                onChange={(e) => setStatus(issue.id, e.target.value)}
                disabled={pending}
                style={{ padding: "3px 6px", fontSize: 10, border: "0.5px solid var(--border-mid)", borderRadius: 3 }}
                aria-label="Change status"
              >
                <option value="Open">Open</option>
                <option value="InProgress">In Progress</option>
                <option value="Resolved">Resolved</option>
              </select>
            ) : null}
            {canEdit && (
              <>
                <PhotoAttachButton projectCode={projectCode} link={{ issueId: issue.id, phaseId: issue.phaseId ?? undefined }} />
                <button className="btn-sm" onClick={() => remove(issue.id)} disabled={pending} style={{ color: "var(--red-txt)" }}>
                  Delete
                </button>
              </>
            )}
          </div>
          {issue.description && (
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6, whiteSpace: "pre-wrap" }}>
              {issue.description}
            </div>
          )}
          <PhotoStrip photos={issue.photos} />
          <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 8 }}>
            {issue.phaseLabel ? `${issue.phaseLabel} · ` : ""}
            {issue.assignee ? `Assigned to ${issue.assignee} · ` : ""}
            {issue.createdBy ? `Opened by ${issue.createdBy} · ` : ""}
            {issue.createdAtLabel}
            {issue.resolvedAtLabel ? ` · Resolved ${issue.resolvedAtLabel}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
