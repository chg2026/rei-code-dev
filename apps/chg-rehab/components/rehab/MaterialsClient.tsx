"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BILLING_BLOCKED_CODE,
  notifyBillingBlocked,
} from "@/lib/billing-blocked-client";

export type MaterialStatusLabel = "Needed" | "Ordered" | "Shipped" | "Delivered" | "Delayed";

export type MaterialRow = {
  id: string;
  vendor: string | null;
  description: string;
  quantity: string | null;
  trackingNumber: string | null;
  eta: string | null; // YYYY-MM-DD
  status: MaterialStatusLabel;
  urgent: boolean;
  cost: number | null;
  notes: string | null;
  phaseId: string | null;
  phaseLabel: string | null;
};

export type PhaseOption = { id: string; number: number; name: string };

const STATUSES: MaterialStatusLabel[] = ["Needed", "Ordered", "Shipped", "Delivered", "Delayed"];

const STATUS_STYLE: Record<MaterialStatusLabel, React.CSSProperties> = {
  Needed: { background: "var(--bg-secondary)", color: "var(--text-secondary)" },
  Ordered: { background: "var(--blue-bg, #E8F0FB)", color: "var(--blue-txt, #1F4FA8)" },
  Shipped: { background: "var(--amber-bg)", color: "var(--amber-txt)" },
  Delivered: { background: "var(--green-bg)", color: "var(--green-txt)" },
  Delayed: { background: "var(--red-bg)", color: "var(--red-txt)" },
};

function todayYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function fmtEta(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** ETA in the past and not yet Delivered → overdue. */
function isOverdue(r: MaterialRow): boolean {
  return !!r.eta && r.status !== "Delivered" && r.eta < todayYmd();
}

type FormState = {
  vendor: string;
  description: string;
  phaseId: string;
  quantity: string;
  status: MaterialStatusLabel;
  eta: string;
  trackingNumber: string;
  cost: string;
  urgent: boolean;
  notes: string;
};

const EMPTY: FormState = {
  vendor: "",
  description: "",
  phaseId: "",
  quantity: "",
  status: "Needed",
  eta: "",
  trackingNumber: "",
  cost: "",
  urgent: false,
  notes: "",
};

export default function MaterialsClient({
  projectCode,
  orders,
  phases,
  canEdit,
}: {
  projectCode: string;
  orders: MaterialRow[];
  phases: PhaseOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<"All" | MaterialStatusLabel>("All");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const base = `/api/rehab/${encodeURIComponent(projectCode)}/materials`;

  async function apiJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      if (res.status === 402 || body?.code === BILLING_BLOCKED_CODE) notifyBillingBlocked();
      throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${res.status})`);
    }
    return body;
  }

  const neededCount = orders.filter((o) => o.status === "Needed").length;
  const urgentCount = orders.filter((o) => o.urgent && o.status !== "Delivered").length;
  const overdueCount = orders.filter(isOverdue).length;

  const filtered = useMemo(
    () => (statusFilter === "All" ? orders : orders.filter((o) => o.status === statusFilter)),
    [orders, statusFilter]
  );

  function openNew() {
    setEditingId(null);
    setForm(EMPTY);
    setError(null);
    setFormOpen(true);
  }

  function openEdit(o: MaterialRow) {
    setEditingId(o.id);
    setForm({
      vendor: o.vendor ?? "",
      description: o.description,
      phaseId: o.phaseId ?? "",
      quantity: o.quantity ?? "",
      status: o.status,
      eta: o.eta ?? "",
      trackingNumber: o.trackingNumber ?? "",
      cost: o.cost == null ? "" : String(o.cost),
      urgent: o.urgent,
      notes: o.notes ?? "",
    });
    setError(null);
    setFormOpen(true);
  }

  function submit() {
    setError(null);
    if (!form.description.trim()) {
      setError("Description is required");
      return;
    }
    startTransition(async () => {
      try {
        const payload = {
          vendor: form.vendor,
          description: form.description,
          phaseId: form.phaseId || null,
          quantity: form.quantity,
          status: form.status,
          eta: form.eta || null,
          trackingNumber: form.trackingNumber,
          cost: form.cost === "" ? null : Number(form.cost),
          urgent: form.urgent,
          notes: form.notes,
        };
        if (editingId) {
          await apiJson(`${base}/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
        } else {
          await apiJson(base, { method: "POST", body: JSON.stringify(payload) });
        }
        setFormOpen(false);
        setEditingId(null);
        setForm(EMPTY);
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to save order");
      }
    });
  }

  function remove(id: string) {
    if (!window.confirm("Delete this material order?")) return;
    startTransition(async () => {
      try {
        await apiJson(`${base}/${id}`, { method: "DELETE" });
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

  const COLS = "minmax(0,1.1fr) minmax(0,1.6fr) 70px 54px 84px 96px 96px 60px";

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {/* Summary */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "10px 14px", alignItems: "center" }}>
        <span className="mapped-pill" style={{ fontSize: 10, background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
          {neededCount} needed (not ordered)
        </span>
        <span className="mapped-pill" style={{ fontSize: 10, ...(urgentCount > 0 ? { background: "var(--amber-bg)", color: "var(--amber-txt)" } : { background: "var(--bg-secondary)", color: "var(--text-tertiary)" }) }}>
          {urgentCount} urgent
        </span>
        <span className="mapped-pill" style={{ fontSize: 10, ...(overdueCount > 0 ? { background: "var(--red-bg)", color: "var(--red-txt)" } : { background: "var(--bg-secondary)", color: "var(--text-tertiary)" }) }}>
          {overdueCount} overdue
        </span>
        <span style={{ flex: 1 }} />
        {canEdit && (
          <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={openNew} disabled={pending}>
            + Add order
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0 14px 8px" }}>
        {(["All", ...STATUSES] as const).map((sName) => (
          <button key={sName} style={chip(statusFilter === sName)} onClick={() => setStatusFilter(sName)}>
            {sName}
          </button>
        ))}
      </div>

      {formOpen && (
        <div style={{ margin: "0 14px 10px", padding: 12, border: "0.5px solid var(--border-mid)", borderRadius: 6, background: "var(--bg-secondary)", maxWidth: 720 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>
            {editingId ? "Edit material order" : "New material order"}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Vendor</div>
              <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} disabled={pending} style={inputStyle} />
            </div>
            <div style={{ flex: 2 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Description</div>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={pending} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Job type</div>
              <select value={form.phaseId} onChange={(e) => setForm({ ...form, phaseId: e.target.value })} disabled={pending} style={inputStyle}>
                <option value="">—</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>Job Type {p.number} — {p.name}</option>
                ))}
              </select>
            </div>
            <div style={{ width: 80 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Qty</div>
              <input value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="e.g. 12" disabled={pending} style={inputStyle} />
            </div>
            <div style={{ width: 110 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Status</div>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as MaterialStatusLabel })} disabled={pending} style={inputStyle}>
                {STATUSES.map((sName) => <option key={sName} value={sName}>{sName}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 140 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>ETA</div>
              <input type="date" value={form.eta} onChange={(e) => setForm({ ...form, eta: e.target.value })} disabled={pending} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Tracking #</div>
              <input value={form.trackingNumber} onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })} disabled={pending} style={inputStyle} />
            </div>
            <div style={{ width: 100 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Cost ($)</div>
              <input type="number" min={0} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} disabled={pending} style={inputStyle} />
            </div>
            <label style={{ display: "flex", alignItems: "flex-end", gap: 4, fontSize: 11, paddingBottom: 5 }}>
              <input type="checkbox" checked={form.urgent} onChange={(e) => setForm({ ...form, urgent: e.target.checked })} disabled={pending} />
              Urgent
            </label>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Notes</div>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} disabled={pending} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          {error && <div style={{ fontSize: 10, color: "var(--red-txt)", marginBottom: 6 }}>{error}</div>}
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button className="btn-sm" onClick={() => { setFormOpen(false); setEditingId(null); }} disabled={pending}>Cancel</button>
            <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={submit} disabled={pending}>
              {pending ? "Saving..." : editingId ? "Save changes" : "Add order"}
            </button>
          </div>
        </div>
      )}

      {!formOpen && error && (
        <div style={{ margin: "0 14px 8px", fontSize: 10, color: "var(--red-txt)" }}>{error}</div>
      )}

      {/* Table */}
      <div className="data-hd" style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "6px 14px" }}>
        <span className="col-label">Vendor</span>
        <span className="col-label">Description</span>
        <span className="col-label">Job type</span>
        <span className="col-label" style={{ textAlign: "right" }}>Qty</span>
        <span className="col-label">Status</span>
        <span className="col-label">ETA</span>
        <span className="col-label">Tracking #</span>
        <span className="col-label" style={{ textAlign: "right" }}>{canEdit ? "Actions" : ""}</span>
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: "16px 14px", fontSize: 11, color: "var(--text-tertiary)" }}>
          {orders.length === 0 ? "No material orders yet." : "Nothing matches this filter."}
        </div>
      )}

      {filtered.map((o) => {
        const overdue = isOverdue(o);
        const rowBg = overdue
          ? "var(--red-bg)"
          : o.urgent && o.status !== "Delivered"
            ? "var(--amber-bg)"
            : "transparent";
        return (
          <div
            key={o.id}
            style={{
              display: "grid",
              gridTemplateColumns: COLS,
              gap: 8,
              padding: "8px 14px",
              borderBottom: "0.5px solid var(--border-lo)",
              background: rowBg,
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: 11, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {o.vendor ?? "—"}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}>
                {o.urgent && <span title="Urgent" style={{ color: "var(--red-txt)" }}>●</span>}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.description}</span>
              </div>
              {o.notes && (
                <div style={{ fontSize: 9, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.notes}
                </div>
              )}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
              {o.phaseLabel ? `#${o.phaseLabel}` : "—"}
            </div>
            <div style={{ fontSize: 11, textAlign: "right" }}>{o.quantity ?? "—"}</div>
            <div>
              <span className="mapped-pill" style={{ fontSize: 9, ...STATUS_STYLE[o.status] }}>{o.status}</span>
            </div>
            <div style={{ fontSize: 10, color: overdue ? "var(--red-txt)" : "var(--text-secondary)", fontWeight: overdue ? 600 : 400 }}>
              {o.eta ? fmtEta(o.eta) : "—"}
              {overdue && <span style={{ display: "block", fontSize: 8 }}>overdue</span>}
            </div>
            <div style={{ fontSize: 10, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {o.trackingNumber ?? "—"}
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              {canEdit && (
                <>
                  <button className="btn-sm" onClick={() => openEdit(o)} disabled={pending}>Edit</button>
                  <button className="btn-sm" onClick={() => remove(o.id)} disabled={pending} style={{ color: "var(--red-txt)" }}>Delete</button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
