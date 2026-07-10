"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import PhotoAttachButton from "./PhotoAttachButton";
import PhotoStrip, { type StripPhoto } from "./PhotoStrip";
import {
  BILLING_BLOCKED_CODE,
  notifyBillingBlocked,
} from "@/lib/billing-blocked-client";

export type PunchRow = {
  id: string;
  title: string;
  location: string | null;
  status: "Open" | "Done";
  phaseId: string | null;
  phaseLabel: string | null;
  assignee: string | null;
  doneAtLabel: string | null;
  photos: StripPhoto[];
};

export type PhaseOption = { id: string; number: number; name: string };
export type TeamOption = { id: string; name: string };

export default function PunchListClient({
  projectCode,
  items,
  phases,
  team,
  canEdit,
}: {
  projectCode: string;
  items: PunchRow[];
  phases: PhaseOption[];
  team: TeamOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ title: "", location: "", phaseId: "", assigneeId: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const base = `/api/rehab/${encodeURIComponent(projectCode)}/punch`;

  async function apiJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      if (res.status === 402 || body?.code === BILLING_BLOCKED_CODE) notifyBillingBlocked();
      throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${res.status})`);
    }
    return body;
  }

  const openItems = items.filter((i) => i.status === "Open");
  const doneItems = items.filter((i) => i.status === "Done");

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
            title: form.title,
            location: form.location,
            phaseId: form.phaseId || null,
            assigneeId: form.assigneeId || null,
          }),
        });
        setForm({ title: "", location: "", phaseId: "", assigneeId: "" });
        setFormOpen(false);
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to create");
      }
    });
  }

  function toggle(item: PunchRow) {
    if (!canEdit || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        await apiJson(`${base}/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: item.status === "Done" ? "Open" : "Done" }),
        });
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to update");
      }
    });
  }

  function remove(itemId: string) {
    if (!window.confirm("Delete this punch item?")) return;
    startTransition(async () => {
      try {
        await apiJson(`${base}/${itemId}`, { method: "DELETE" });
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

  const renderRow = (item: PunchRow) => (
    <div
      key={item.id}
      className="cl-item-row"
      style={{ padding: "8px 14px", borderBottom: "0.5px solid var(--border-lo)", alignItems: "flex-start" }}
    >
      <div
        className={item.status === "Done" ? "cl-check checked" : "cl-check"}
        onClick={() => toggle(item)}
        role="button"
        aria-pressed={item.status === "Done"}
        aria-disabled={!canEdit}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle(item);
          }
        }}
        style={canEdit ? { cursor: "pointer" } : { cursor: "not-allowed", opacity: 0.6 }}
      >
        {item.status === "Done" ? "✓" : ""}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            className="cl-txt"
            style={item.status === "Done" ? { textDecoration: "line-through", color: "var(--text-tertiary)" } : undefined}
          >
            {item.title}
          </span>
          {item.location && <span className="mapped-pill" style={{ fontSize: 9 }}>{item.location}</span>}
          <span style={{ flex: 1 }} />
          {canEdit && (
            <>
              <PhotoAttachButton projectCode={projectCode} link={{ punchItemId: item.id, phaseId: item.phaseId ?? undefined }} />
              <button className="btn-sm" onClick={() => remove(item.id)} disabled={pending} style={{ color: "var(--red-txt)" }}>
                Delete
              </button>
            </>
          )}
        </div>
        <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 3 }}>
          {item.phaseLabel ? `${item.phaseLabel} · ` : ""}
          {item.assignee ? `Assigned to ${item.assignee} · ` : ""}
          {item.status === "Done" && item.doneAtLabel ? `Completed ${item.doneAtLabel}` : "Open"}
        </div>
        <PhotoStrip photos={item.photos} size={44} />
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div className="proj-bar" style={{ borderTop: "0.5px solid var(--border-lo)" }}>
        <div className="proj-l">
          <span className="proj-addr" style={{ fontSize: 11 }}>
            {openItems.length} open · {doneItems.length} done
          </span>
        </div>
        <div className="proj-r">
          {canEdit && (
            <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={() => setFormOpen((v) => !v)} disabled={pending}>
              + New item
            </button>
          )}
        </div>
      </div>

      {formOpen && (
        <div style={{ margin: "10px 14px", padding: 12, border: "0.5px solid var(--border-mid)", borderRadius: 6, background: "var(--bg-secondary)", maxWidth: 640 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>New punch item</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 2 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Title</div>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} disabled={pending} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Location</div>
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Kitchen" disabled={pending} style={inputStyle} />
            </div>
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
              {pending ? "Saving..." : "Add item"}
            </button>
          </div>
        </div>
      )}

      {!formOpen && error && (
        <div style={{ margin: "8px 14px", fontSize: 10, color: "var(--red-txt)" }}>{error}</div>
      )}

      {items.length === 0 && (
        <div style={{ padding: "18px 14px", fontSize: 11, color: "var(--text-tertiary)" }}>
          No punch items yet.
        </div>
      )}

      {openItems.map(renderRow)}
      {doneItems.length > 0 && (
        <div className="doc-section-hd" style={{ marginTop: 8 }}>Completed</div>
      )}
      {doneItems.map(renderRow)}
    </div>
  );
}
