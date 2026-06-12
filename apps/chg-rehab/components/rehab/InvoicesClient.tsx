"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  ALLOWED_UPLOAD_TYPES_LABEL,
  MAX_UPLOAD_SIZE_BYTES,
  MAX_UPLOAD_SIZE_LABEL,
} from "@/lib/fileValidation";

export type InvoiceAttachmentDTO = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
};

export type InvoiceDTO = {
  id: string;
  vendor: string;
  invoiceNumber: string | null;
  date: string; // yyyy-mm-dd
  amount: number;
  classification: string;
  status: string;
  phaseId: string | null;
  notes: string | null;
  attachments: InvoiceAttachmentDTO[];
};

type PhaseLite = { id: string; number: number; name: string };

const CLASSIFICATIONS = ["Labor", "Materials", "Permit", "Dumpster", "Utility", "Other"];
const STATUSES = ["Unpaid", "Pending", "Paid"];

const fmt$ = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function statusStyle(status: string): React.CSSProperties {
  switch (status) {
    case "Paid":
      return { background: "var(--green-bg)", color: "var(--green-txt)" };
    case "Pending":
      return { background: "var(--amber-bg)", color: "var(--amber-txt)" };
    default:
      return { background: "var(--red-bg)", color: "var(--red-txt)" };
  }
}

type FormState = {
  vendor: string;
  invoiceNumber: string;
  date: string;
  amount: string;
  classification: string;
  status: string;
  phaseId: string;
  notes: string;
};

function emptyForm(): FormState {
  return {
    vendor: "",
    invoiceNumber: "",
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    classification: "Other",
    status: "Unpaid",
    phaseId: "",
    notes: "",
  };
}

function formFromInvoice(inv: InvoiceDTO): FormState {
  return {
    vendor: inv.vendor,
    invoiceNumber: inv.invoiceNumber ?? "",
    date: inv.date,
    amount: String(inv.amount),
    classification: inv.classification,
    status: inv.status,
    phaseId: inv.phaseId ?? "",
    notes: inv.notes ?? "",
  };
}

export default function InvoicesClient({
  projectCode,
  phases,
  initialInvoices,
}: {
  projectCode: string;
  phases: PhaseLite[];
  initialInvoices: InvoiceDTO[];
}) {
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceDTO[]>(initialInvoices);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"new" | "edit" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<Record<string, string | null>>({});
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const apiBase = `/api/rehab/${encodeURIComponent(projectCode)}/invoices`;

  const phaseName = (id: string | null) => {
    if (!id) return null;
    const p = phases.find((x) => x.id === id);
    return p ? `Phase ${p.number}` : null;
  };

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (classFilter !== "all" && inv.classification !== classFilter) return false;
      return true;
    });
  }, [invoices, statusFilter, classFilter]);

  const totals = useMemo(() => {
    let total = 0;
    let unpaid = 0;
    let paid = 0;
    for (const inv of invoices) {
      total += inv.amount;
      if (inv.status === "Paid") paid += inv.amount;
      else unpaid += inv.amount; // Unpaid + Pending count as outstanding
    }
    return { total, unpaid, paid };
  }, [invoices]);

  const selected = selectedId ? invoices.find((i) => i.id === selectedId) ?? null : null;

  async function refresh(): Promise<InvoiceDTO[]> {
    const res = await fetch(apiBase, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load invoices");
    const data = (await res.json()) as { invoices: RawInvoice[] };
    const mapped = data.invoices.map(normalizeInvoice);
    setInvoices(mapped);
    return mapped;
  }

  function openNew() {
    setMode("new");
    setSelectedId(null);
    setForm(emptyForm());
    setError(null);
  }

  function openEdit(inv: InvoiceDTO) {
    setMode("edit");
    setSelectedId(inv.id);
    setForm(formFromInvoice(inv));
    setError(null);
  }

  function selectInvoice(inv: InvoiceDTO) {
    setMode(null);
    setSelectedId(inv.id);
    setError(null);
    void loadDownloads(inv);
  }

  function closePanel() {
    setMode(null);
    setSelectedId(null);
    setError(null);
  }

  async function loadDownloads(inv: InvoiceDTO) {
    if (inv.attachments.length === 0) return;
    try {
      const res = await fetch(`${apiBase}/${inv.id}/attachments`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        attachments: { id: string; downloadUrl: string | null }[];
      };
      setDownloads((prev) => {
        const next = { ...prev };
        for (const a of data.attachments) next[a.id] = a.downloadUrl;
        return next;
      });
    } catch {
      /* non-fatal — links just stay disabled */
    }
  }

  function save() {
    setError(null);
    if (!form.vendor.trim()) {
      setError("Vendor is required");
      return;
    }
    if (!form.date) {
      setError("Date is required");
      return;
    }
    const amountNum = Number(form.amount);
    if (!form.amount || Number.isNaN(amountNum) || amountNum < 0) {
      setError("Enter a valid amount");
      return;
    }
    const payload = {
      vendor: form.vendor.trim(),
      invoiceNumber: form.invoiceNumber.trim() || null,
      date: form.date,
      amount: form.amount,
      classification: form.classification,
      status: form.status,
      phaseId: form.phaseId || null,
      notes: form.notes.trim() || null,
    };

    startTransition(async () => {
      try {
        if (mode === "edit" && selectedId) {
          const res = await fetch(`${apiBase}/${selectedId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error((await res.json())?.error ?? "Update failed");
          await refresh();
          setMode(null);
        } else {
          const res = await fetch(apiBase, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error((await res.json())?.error ?? "Create failed");
          const created = (await res.json()) as { invoice: RawInvoice };
          const list = await refresh();
          const newId = created.invoice.id;
          setSelectedId(list.find((i) => i.id === newId)?.id ?? newId);
          setMode(null);
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  function removeInvoice(inv: InvoiceDTO) {
    if (!confirm(`Delete invoice from ${inv.vendor}? This cannot be undone.`)) return;
    startTransition(async () => {
      try {
        const res = await fetch(`${apiBase}/${inv.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        await refresh();
        closePanel();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed");
      }
    });
  }

  function uploadAttachment(inv: InvoiceDTO) {
    setError(null);
    const file = fileRef.current?.files?.[0] ?? null;
    if (!file) {
      setError("Choose a file to attach");
      return;
    }
    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
      setError(`File type not allowed. Please upload a ${ALLOWED_UPLOAD_TYPES_LABEL} file.`);
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setError(`File is too large. The maximum allowed size is ${MAX_UPLOAD_SIZE_LABEL}.`);
      return;
    }
    startTransition(async () => {
      try {
        const initRes = await fetch("/api/uploads/request-url", { method: "POST" });
        if (!initRes.ok) throw new Error("Upload URL request failed");
        const { uploadUrl, objectPath } = (await initRes.json()) as {
          uploadUrl: string;
          objectPath: string;
        };
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": mimeType },
          body: file,
        });
        if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
        const regRes = await fetch(`${apiBase}/${inv.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            objectPath,
            name: file.name,
            mimeType,
            size: file.size,
          }),
        });
        if (!regRes.ok) throw new Error("Failed to register attachment");
        if (fileRef.current) fileRef.current.value = "";
        const list = await refresh();
        const fresh = list.find((i) => i.id === inv.id);
        if (fresh) await loadDownloads(fresh);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    });
  }

  function removeAttachment(inv: InvoiceDTO, attachmentId: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`${apiBase}/${inv.id}/attachments/${attachmentId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete attachment");
        await refresh();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed");
      }
    });
  }

  const COLS = "minmax(0,1fr) 92px 84px 96px 90px";

  return (
    <div className="tab-panel active">
      <div className="kpi-strip">
        <div className="kpi-card">
          <div className="kpi-label">Total invoiced</div>
          <div className="kpi-val">{fmt$(totals.total)}</div>
          <div className="kpi-sub">{invoices.length} invoice{invoices.length !== 1 ? "s" : ""}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Outstanding</div>
          <div className="kpi-val amber">{fmt$(totals.unpaid)}</div>
          <div className="kpi-sub">Unpaid + pending</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Paid</div>
          <div className="kpi-val green">{fmt$(totals.paid)}</div>
          <div className="kpi-sub">
            {invoices.filter((i) => i.status === "Paid").length} settled
          </div>
        </div>
      </div>

      <div className="action-bar">
        <div className="toggle-group">
          {["all", ...STATUSES].map((s) => (
            <button
              key={s}
              className={`tg-btn ${statusFilter === s ? "active" : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          style={{
            padding: "5px 8px",
            fontSize: 11,
            border: "0.5px solid var(--border-mid)",
            borderRadius: 3,
          }}
        >
          <option value="all">All categories</option>
          {CLASSIFICATIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={openNew}>
          + Add invoice
        </button>
      </div>

      <div className="body-split">
        <div className="body-main">
          <div className="data-hd" style={{ gridTemplateColumns: COLS }}>
            <span className="col-label">Vendor</span>
            <span className="col-label">Category</span>
            <span className="col-label" style={{ textAlign: "right" }}>Amount</span>
            <span className="col-label">Date</span>
            <span className="col-label">Status</span>
          </div>
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", fontSize: 11, color: "var(--text-tertiary)" }}>
              No invoices{statusFilter !== "all" || classFilter !== "all" ? " match this filter" : " yet"}.
            </div>
          )}
          {filtered.map((inv) => (
            <div
              key={inv.id}
              className="data-row"
              role="button"
              tabIndex={0}
              onClick={() => selectInvoice(inv)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") selectInvoice(inv);
              }}
              style={{
                gridTemplateColumns: COLS,
                cursor: "pointer",
                background: selectedId === inv.id ? "var(--bg-secondary)" : undefined,
              }}
            >
              <div>
                <div className="cell-name">{inv.vendor}</div>
                <div className="cell-meta">
                  {inv.invoiceNumber ? `#${inv.invoiceNumber}` : "No invoice #"}
                  {phaseName(inv.phaseId) ? ` · ${phaseName(inv.phaseId)}` : ""}
                  {inv.attachments.length > 0 ? ` · 📎 ${inv.attachments.length}` : ""}
                </div>
              </div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{inv.classification}</div>
              <div className="cell-amt" style={{ textAlign: "right" }}>{fmt$(inv.amount)}</div>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{inv.date}</div>
              <span className="cell-tag" style={statusStyle(inv.status)}>{inv.status}</span>
            </div>
          ))}
          <div
            className="data-row"
            style={{ gridTemplateColumns: COLS, background: "var(--bg-secondary)", fontWeight: 600 }}
          >
            <div className="cell-name">Total ({filtered.length})</div>
            <div></div>
            <div className="cell-amt" style={{ textAlign: "right" }}>
              {fmt$(filtered.reduce((a, i) => a + i.amount, 0))}
            </div>
            <div></div>
            <div></div>
          </div>
        </div>

        <div className="body-side">
          {mode === "new" || mode === "edit" ? (
            <InvoiceForm
              title={mode === "edit" ? "Edit invoice" : "New invoice"}
              form={form}
              setForm={setForm}
              phases={phases}
              error={error}
              pending={pending}
              onSave={save}
              onCancel={() => (mode === "edit" && selected ? selectInvoice(selected) : closePanel())}
            />
          ) : selected ? (
            <div className="sb-sec" style={{ padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div className="sb-hd" style={{ padding: 0 }}>Invoice detail</div>
                <button className="btn-sm" onClick={closePanel}>Close</button>
              </div>

              <div style={{ fontSize: 14, fontWeight: 600 }}>{selected.vendor}</div>
              <div style={{ fontSize: 18, fontWeight: 600, margin: "2px 0 8px" }}>{fmt$(selected.amount)}</div>
              <span className="cell-tag" style={{ ...statusStyle(selected.status), display: "inline-block", marginBottom: 10 }}>
                {selected.status}
              </span>

              <DetailRow label="Category" value={selected.classification} />
              <DetailRow label="Invoice #" value={selected.invoiceNumber || "—"} />
              <DetailRow label="Date" value={selected.date} />
              <DetailRow label="Phase" value={phaseName(selected.phaseId) || "—"} />
              {selected.notes && <DetailRow label="Notes" value={selected.notes} />}

              <div className="sb-hd" style={{ padding: "12px 0 6px" }}>
                Attachments ({selected.attachments.length})
              </div>
              {selected.attachments.length === 0 && (
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 6 }}>
                  No files attached.
                </div>
              )}
              {selected.attachments.map((a) => {
                const url = downloads[a.id];
                return (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 6,
                      padding: "5px 0",
                      borderBottom: "0.5px solid var(--border-lo)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {url ? (
                          <a href={url} target="_blank" rel="noreferrer">{a.name}</a>
                        ) : (
                          a.name
                        )}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                        {a.size ? `${(a.size / 1024).toFixed(1)} KB` : ""}
                      </div>
                    </div>
                    <button
                      className="btn-sm"
                      onClick={() => removeAttachment(selected, a.id)}
                      disabled={pending}
                      aria-label={`Remove ${a.name}`}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}

              <div style={{ marginTop: 8 }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  style={{ width: "100%", fontSize: 10, marginBottom: 4 }}
                  disabled={pending}
                />
                <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 6 }}>
                  {ALLOWED_UPLOAD_TYPES_LABEL} · max {MAX_UPLOAD_SIZE_LABEL}
                </div>
                <button className="btn-sm" onClick={() => uploadAttachment(selected)} disabled={pending}>
                  {pending ? "Working…" : "Attach file"}
                </button>
              </div>

              {error && <div style={{ fontSize: 10, color: "var(--red-txt)", marginTop: 8 }}>{error}</div>}

              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={() => openEdit(selected)}>
                  Edit
                </button>
                <button className="btn-sm" onClick={() => removeInvoice(selected)} disabled={pending}>
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="sb-sec" style={{ padding: "16px 12px", fontSize: 11, color: "var(--text-tertiary)" }}>
              Select an invoice to view details, or add a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0", fontSize: 11 }}>
      <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span style={{ textAlign: "right", color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function InvoiceForm({
  title,
  form,
  setForm,
  phases,
  error,
  pending,
  onSave,
  onCancel,
}: {
  title: string;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  phases: PhaseLite[];
  error: string | null;
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const field: React.CSSProperties = {
    width: "100%",
    padding: "5px 8px",
    fontSize: 11,
    border: "0.5px solid var(--border-mid)",
    borderRadius: 3,
    marginBottom: 8,
  };
  const lbl: React.CSSProperties = { fontSize: 10, color: "var(--text-tertiary)", marginBottom: 2, display: "block" };

  return (
    <div className="sb-sec" style={{ padding: "10px 12px" }}>
      <div className="sb-hd" style={{ padding: "0 0 8px" }}>{title}</div>

      <label style={lbl}>Vendor *</label>
      <input style={field} value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} disabled={pending} />

      <label style={lbl}>Invoice #</label>
      <input style={field} value={form.invoiceNumber} onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))} disabled={pending} />

      <label style={lbl}>Date *</label>
      <input type="date" style={field} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} disabled={pending} />

      <label style={lbl}>Amount *</label>
      <input type="number" step="0.01" min="0" style={field} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} disabled={pending} />

      <label style={lbl}>Category</label>
      <select style={field} value={form.classification} onChange={(e) => setForm((f) => ({ ...f, classification: e.target.value }))} disabled={pending}>
        {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <label style={lbl}>Status</label>
      <select style={field} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} disabled={pending}>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <label style={lbl}>Phase</label>
      <select style={field} value={form.phaseId} onChange={(e) => setForm((f) => ({ ...f, phaseId: e.target.value }))} disabled={pending}>
        <option value="">— None —</option>
        {phases.map((p) => <option key={p.id} value={p.id}>Phase {p.number} — {p.name}</option>)}
      </select>

      <label style={lbl}>Notes</label>
      <textarea
        style={{ ...field, minHeight: 56, resize: "vertical" }}
        value={form.notes}
        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        disabled={pending}
      />

      {error && <div style={{ fontSize: 10, color: "var(--red-txt)", marginBottom: 8 }}>{error}</div>}

      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button className="btn-sm" onClick={onCancel} disabled={pending}>Cancel</button>
        <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

type RawInvoice = {
  id: string;
  vendor: string;
  invoiceNumber: string | null;
  date: string;
  amount: string | number;
  classification: string;
  status: string;
  phaseId: string | null;
  notes: string | null;
  attachments: InvoiceAttachmentDTO[];
};

function normalizeInvoice(raw: RawInvoice): InvoiceDTO {
  return {
    id: raw.id,
    vendor: raw.vendor,
    invoiceNumber: raw.invoiceNumber,
    date: typeof raw.date === "string" ? raw.date.slice(0, 10) : raw.date,
    amount: Number(raw.amount),
    classification: raw.classification,
    status: raw.status,
    phaseId: raw.phaseId,
    notes: raw.notes,
    attachments: (raw.attachments ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      mimeType: a.mimeType,
      size: a.size,
    })),
  };
}
