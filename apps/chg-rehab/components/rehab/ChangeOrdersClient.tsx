"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

export type ChangeOrderStatus = "Pending" | "Approved" | "Rejected";

export type ChangeOrderDTO = {
  id: string;
  number: number;
  title: string;
  reason: string | null;
  amount: number;
  status: ChangeOrderStatus;
  phaseId: string | null;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null; // ISO
  createdAt: string; // ISO
};

type PhaseLite = { id: string; number: number; name: string; budget: number };

const STATUSES: ChangeOrderStatus[] = ["Pending", "Approved", "Rejected"];

const fmt$ = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusStyle(status: ChangeOrderStatus): React.CSSProperties {
  switch (status) {
    case "Approved":
      return { background: "var(--green-bg)", color: "var(--green-txt)" };
    case "Rejected":
      return { background: "var(--red-bg)", color: "var(--red-txt)" };
    default:
      return { background: "var(--amber-bg)", color: "var(--amber-txt)" };
  }
}

type FormState = {
  title: string;
  phaseId: string;
  reason: string;
  amount: string;
  status: ChangeOrderStatus;
};

function emptyForm(): FormState {
  return { title: "", phaseId: "", reason: "", amount: "", status: "Pending" };
}

function formFromCo(co: ChangeOrderDTO): FormState {
  return {
    title: co.title,
    phaseId: co.phaseId ?? "",
    reason: co.reason ?? "",
    amount: String(co.amount),
    status: co.status,
  };
}

type Editing = { mode: "new" } | { mode: "edit"; co: ChangeOrderDTO } | null;

export default function ChangeOrdersClient({
  projectCode,
  phases,
  initialChangeOrders,
}: {
  projectCode: string;
  phases: PhaseLite[];
  initialChangeOrders: ChangeOrderDTO[];
}) {
  const router = useRouter();
  const [changeOrders, setChangeOrders] = useState(initialChangeOrders);
  const [editing, setEditing] = useState<Editing>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setChangeOrders(initialChangeOrders);
  }, [initialChangeOrders]);

  const base = `/api/rehab/${encodeURIComponent(projectCode)}/change-orders`;
  const phaseById = useMemo(
    () => new Map(phases.map((p) => [p.id, p])),
    [phases]
  );

  const totals = useMemo(() => {
    let approved = 0;
    let pending = 0;
    let rejected = 0;
    for (const co of changeOrders) {
      if (co.status === "Approved") approved += co.amount;
      else if (co.status === "Pending") pending += co.amount;
      else rejected += co.amount;
    }
    return { approved, pending, rejected, count: changeOrders.length };
  }, [changeOrders]);

  function openNew() {
    setError(null);
    setForm(emptyForm());
    setEditing({ mode: "new" });
  }

  function openEdit(co: ChangeOrderDTO) {
    setError(null);
    setForm(formFromCo(co));
    setEditing({ mode: "edit", co });
  }

  function closePanel() {
    setEditing(null);
    setError(null);
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function save() {
    if (!editing) return;
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
      reason: form.reason.trim() || null,
      amount: amountNum,
      status: form.status,
    };
    try {
      const res =
        editing.mode === "new"
          ? await fetch(base, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`${base}/${editing.co.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? "Could not save the change order.");
        setSaving(false);
        return;
      }
      setSaving(false);
      closePanel();
      refresh();
    } catch {
      setError("Network error — please try again.");
      setSaving(false);
    }
  }

  async function remove(co: ChangeOrderDTO) {
    if (!confirm(`Delete change order #${co.number}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${base}/${co.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? "Could not delete the change order.");
        return;
      }
      refresh();
    } catch {
      setError("Network error — please try again.");
    }
  }

  const selectedPhase = form.phaseId ? phaseById.get(form.phaseId) : undefined;
  const changeAmount = Number(form.amount);
  const hasAmount = form.amount.trim() !== "" && !Number.isNaN(changeAmount);
  // Once approved, the amount has already been folded into the phase budget, so
  // these fields are locked (the API enforces this too).
  const lockedFinancial = editing?.mode === "edit" && editing.co.status === "Approved";

  return (
    <div className="tab-panel active">
      <div className="kpi-strip">
        <div className="kpi-card">
          <div className="kpi-label">Change orders</div>
          <div className="kpi-val">{totals.count}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Approved</div>
          <div className="kpi-val">{fmt$(totals.approved)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Pending</div>
          <div className="kpi-val">{fmt$(totals.pending)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Rejected</div>
          <div className="kpi-val">{fmt$(totals.rejected)}</div>
        </div>
      </div>

      <div className="action-bar" style={{ display: "flex", justifyContent: "flex-end", margin: "12px 0" }}>
        <button type="button" className="btn btn-sm btn-primary" onClick={openNew}>
          + New change order
        </button>
      </div>

      {error && !editing && (
        <div
          style={{
            background: "var(--red-bg)",
            color: "var(--red-txt)",
            padding: "8px 12px",
            borderRadius: 6,
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {changeOrders.length === 0 ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-secondary)" }}>
          No change orders yet. Create one to track scope and budget changes.
        </div>
      ) : (
        <div className="data-table">
          <div
            className="data-hd"
            style={{
              display: "grid",
              gridTemplateColumns: "56px 1fr 1.2fr 110px 110px 1fr 120px 80px",
              gap: 12,
              alignItems: "center",
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-secondary)",
            }}
          >
            <div>CO #</div>
            <div>Title</div>
            <div>Phase</div>
            <div style={{ textAlign: "right" }}>Amount</div>
            <div>Status</div>
            <div>Approved by</div>
            <div>Date</div>
            <div />
          </div>
          {changeOrders.map((co) => {
            const phase = co.phaseId ? phaseById.get(co.phaseId) : undefined;
            return (
              <div
                key={co.id}
                className="data-row"
                onClick={() => openEdit(co)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "56px 1fr 1.2fr 110px 110px 1fr 120px 80px",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px",
                  borderTop: "0.5px solid var(--border-lo)",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 600 }}>#{co.number}</div>
                <div>
                  <div style={{ fontWeight: 500 }}>{co.title}</div>
                  {co.reason && (
                    <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 2 }}>
                      {co.reason.length > 60 ? `${co.reason.slice(0, 60)}…` : co.reason}
                    </div>
                  )}
                </div>
                <div style={{ color: "var(--text-secondary)" }}>
                  {phase ? `Phase ${phase.number} · ${phase.name}` : "—"}
                </div>
                <div
                  style={{
                    textAlign: "right",
                    fontWeight: 600,
                    color: co.amount < 0 ? "var(--green-txt)" : "inherit",
                  }}
                >
                  {fmt$(co.amount)}
                </div>
                <div>
                  <span className="cell-tag" style={statusStyle(co.status)}>
                    {co.status}
                  </span>
                </div>
                <div style={{ color: "var(--text-secondary)" }}>{co.approvedByName ?? "—"}</div>
                <div style={{ color: "var(--text-secondary)" }}>{fmtDate(co.approvedAt)}</div>
                <div style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                  {co.status === "Pending" && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => remove(co)}
                      title="Delete pending change order"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <DetailPanel
          title={editing.mode === "new" ? "New change order" : `Change order #${editing.co.number}`}
          onClose={closePanel}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 20, overflowY: "auto" }}>
            {error && (
              <div
                style={{
                  background: "var(--red-bg)",
                  color: "var(--red-txt)",
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            <Field label="Title">
              <input
                className="form-input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Additional electrical rough-in"
                style={inputStyle}
              />
            </Field>

            <Field label="Phase">
              <select
                value={form.phaseId}
                onChange={(e) => setForm({ ...form, phaseId: e.target.value })}
                disabled={lockedFinancial}
                style={inputStyle}
              >
                <option value="">— No phase —</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    Phase {p.number} · {p.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Reason">
              <textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Why is this change needed?"
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </Field>

            <Field label="Change amount ($)">
              <input
                className="form-input"
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="Use a negative amount for a credit"
                disabled={lockedFinancial}
                style={inputStyle}
              />
            </Field>

            {selectedPhase && (
              <div
                style={{
                  background: "var(--bg-secondary)",
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 13,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Current phase budget</span>
                  <span>{fmt$(selectedPhase.budget)}</span>
                </div>
                {hasAmount && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                    <span>Budget if approved</span>
                    <span>{fmt$(selectedPhase.budget + changeAmount)}</span>
                  </div>
                )}
              </div>
            )}

            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ChangeOrderStatus })}
                disabled={lockedFinancial}
                style={inputStyle}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            {lockedFinancial && (
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                This change order is approved — its amount, phase, and status are locked. Only the
                title and reason can be edited.
              </div>
            )}

            {form.status === "Approved" && selectedPhase && (
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Approving folds {fmt$(changeAmount || 0)} into Phase {selectedPhase.number}&apos;s budget.
              </div>
            )}

            {editing.mode === "edit" && editing.co.status === "Approved" && editing.co.approvedByName && (
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Approved by {editing.co.approvedByName} on {fmtDate(editing.co.approvedAt)}.
              </div>
            )}
          </div>

          <div
            style={{
              borderTop: "0.5px solid var(--border-lo)",
              padding: 16,
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
            }}
          >
            <button type="button" className="btn btn-sm" onClick={closePanel} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={save}
              disabled={saving || isPending}
            >
              {saving ? "Saving…" : editing.mode === "new" ? "Create" : "Save"}
            </button>
          </div>
        </DetailPanel>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  fontSize: 13,
  fontFamily: "inherit",
  color: "var(--text-primary)",
  border: "0.5px solid var(--border-lo)",
  borderRadius: 6,
  padding: "8px 10px",
  outline: "none",
  background: "var(--bg-primary)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>{label}</span>
      {children}
    </label>
  );
}

function DetailPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.20)", zIndex: 190 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: 460,
          maxWidth: "100vw",
          height: "100%",
          background: "var(--bg-primary)",
          boxShadow: "var(--shadow-md)",
          zIndex: 200,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "0.5px solid var(--border-lo)",
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 16,
              color: "var(--text-secondary)",
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </>,
    document.body
  );
}
