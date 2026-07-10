"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type CommitmentType = "Subcontract" | "PurchaseOrder";
export type CommitmentStatus = "Draft" | "Approved" | "Complete";

export type CommitmentDTO = {
  id: string;
  title: string;
  phaseId: string | null;
  type: CommitmentType;
  status: CommitmentStatus;
  amount: number;
  notes: string | null;
  createdAt: string; // ISO
};

type PhaseLite = { id: string; number: number; name: string };

const TYPES: CommitmentType[] = ["Subcontract", "PurchaseOrder"];
const STATUSES: CommitmentStatus[] = ["Draft", "Approved", "Complete"];

const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;
const typeLabel = (t: CommitmentType) => (t === "PurchaseOrder" ? "Purchase order" : "Subcontract");

function statusTagCls(status: CommitmentStatus): string {
  return status === "Approved" ? "tag-paid" : status === "Complete" ? "tag-system" : "tag-pend";
}

type FormState = {
  title: string;
  phaseId: string;
  type: CommitmentType;
  amount: string;
  status: CommitmentStatus;
  notes: string;
};

function emptyForm(): FormState {
  return { title: "", phaseId: "", type: "Subcontract", amount: "", status: "Draft", notes: "" };
}

function formFrom(c: CommitmentDTO): FormState {
  return {
    title: c.title,
    phaseId: c.phaseId ?? "",
    type: c.type,
    amount: String(c.amount),
    status: c.status,
    notes: c.notes ?? "",
  };
}

/**
 * "Commitments" sub-view on Budget & Costs: per-job agreements (subcontracts /
 * purchase orders). Approved commitments feed the per-phase "Contracted"
 * figure on the By-phase view — they never touch Committed/Actual/Forecast,
 * which stay invoice-driven.
 */
export default function CommitmentsView({
  projectCode,
  phases,
  commitments,
  canEdit,
}: {
  projectCode: string;
  phases: PhaseLite[];
  commitments: CommitmentDTO[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  const base = `/api/rehab/${encodeURIComponent(projectCode)}/commitments`;
  const phaseById = useMemo(() => new Map(phases.map((p) => [p.id, p])), [phases]);

  const totals = useMemo(() => {
    let approved = 0;
    let all = 0;
    for (const c of commitments) {
      all += c.amount;
      if (c.status === "Approved") approved += c.amount;
    }
    return { approved, all };
  }, [commitments]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  function openNew() {
    setError(null);
    setForm(emptyForm());
    setEditingId("new");
  }

  function openEdit(c: CommitmentDTO) {
    setError(null);
    setForm(formFrom(c));
    setEditingId(c.id);
  }

  async function save() {
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    const amountNum = Number(form.amount);
    if (form.amount.trim() === "" || Number.isNaN(amountNum)) {
      setError("A valid amount is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      title: form.title.trim(),
      phaseId: form.phaseId || null,
      type: form.type,
      amount: amountNum,
      status: form.status,
      notes: form.notes.trim() || null,
    };
    try {
      const res =
        editingId === "new"
          ? await fetch(base, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`${base}/${editingId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? "Could not save the commitment.");
        setSaving(false);
        return;
      }
      setSaving(false);
      setEditingId(null);
      refresh();
    } catch {
      setError("Network error — please try again.");
      setSaving(false);
    }
  }

  async function remove(c: CommitmentDTO) {
    if (!confirm(`Delete commitment "${c.title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${base}/${c.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? "Could not delete the commitment.");
        return;
      }
      refresh();
    } catch {
      setError("Network error — please try again.");
    }
  }

  const GRID = "minmax(0,1fr) 110px 90px 80px 80px 64px";

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          margin: "2px 0 8px",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          {commitments.length} commitment{commitments.length === 1 ? "" : "s"} · Contracted
          (approved) <strong style={{ color: "var(--text-primary)" }}>{fmt$(totals.approved)}</strong>{" "}
          · All statuses {fmt$(totals.all)}
        </span>
        {canEdit && (
          <button type="button" className="btn btn-sm btn-primary" onClick={openNew}>
            + Add commitment
          </button>
        )}
      </div>

      {error && editingId === null && (
        <div
          style={{
            background: "var(--red-bg)",
            color: "var(--red-txt)",
            padding: "6px 10px",
            borderRadius: 6,
            marginBottom: 8,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {editingId !== null && (
        <div
          style={{
            border: "0.5px solid var(--border-lo)",
            borderRadius: 8,
            background: "var(--bg-secondary)",
            padding: 12,
            marginBottom: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600 }}>
            {editingId === "new" ? "New commitment" : "Edit commitment"}
          </div>
          {error && (
            <div style={{ fontSize: 11, color: "var(--red-txt)" }}>{error}</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={fieldStyle}>
              <span style={lblStyle}>Title</span>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Framing subcontract — ABC Carpentry"
                style={inputStyle}
              />
            </label>
            <label style={fieldStyle}>
              <span style={lblStyle}>Job Type</span>
              <select
                value={form.phaseId}
                onChange={(e) => setForm({ ...form, phaseId: e.target.value })}
                style={inputStyle}
              >
                <option value="">— No job type —</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    Job Type {p.number} · {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldStyle}>
              <span style={lblStyle}>Type</span>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as CommitmentType })}
                style={inputStyle}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {typeLabel(t)}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldStyle}>
              <span style={lblStyle}>Amount ($)</span>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                style={inputStyle}
              />
            </label>
            <label style={fieldStyle}>
              <span style={lblStyle}>Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as CommitmentStatus })}
                style={inputStyle}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldStyle}>
              <span style={lblStyle}>Notes</span>
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional"
                style={inputStyle}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setEditingId(null);
                setError(null);
              }}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : editingId === "new" ? "Create" : "Save"}
            </button>
          </div>
        </div>
      )}

      {commitments.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", fontSize: 12, color: "var(--text-secondary)" }}>
          No commitments yet. Add subcontracts and purchase orders to track contracted amounts per job type.
        </div>
      ) : (
        <>
          <div className="data-hd" style={{ gridTemplateColumns: GRID }}>
            <span className="col-label">Commitment</span>
            <span className="col-label">Job Type</span>
            <span className="col-label">Type</span>
            <span className="col-label" style={{ textAlign: "right" }}>Amount</span>
            <span className="col-label">Status</span>
            <span></span>
          </div>
          {commitments.map((c) => {
            const phase = c.phaseId ? phaseById.get(c.phaseId) : undefined;
            return (
              <div className="data-row" style={{ gridTemplateColumns: GRID }} key={c.id}>
                <div>
                  <div className="cell-name">{c.title}</div>
                  {c.notes && <div className="cell-meta">{c.notes}</div>}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                  {phase ? `Job Type ${phase.number}` : "—"}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{typeLabel(c.type)}</div>
                <div className="cell-amt">{fmt$(c.amount)}</div>
                <span className={`cell-tag ${statusTagCls(c.status)}`}>{c.status}</span>
                <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  {canEdit && (
                    <>
                      <button type="button" className="btn btn-sm" onClick={() => openEdit(c)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => remove(c)}>
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}

const fieldStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const lblStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "var(--text-secondary)",
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  fontSize: 12,
  fontFamily: "inherit",
  color: "var(--text-primary)",
  border: "0.5px solid var(--border-lo)",
  borderRadius: 6,
  padding: "6px 8px",
  outline: "none",
  background: "var(--bg-primary)",
};
