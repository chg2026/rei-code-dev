"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { estimateLineTotal, estimateTotals } from "@/lib/rehab/estimates";
import {
  BILLING_BLOCKED_CODE,
  notifyBillingBlocked,
} from "@/lib/billing-blocked-client";

export type EstimateLineDTO = {
  costCode: number | null;
  name: string;
  laborCost: number;
  materialCost: number;
  unit: string | null;
  unitPrice: number | null;
  quantity: number | null;
};

export type EstimateDTO = {
  id: string;
  title: string;
  rehabType: string | null;
  sqft: number | null;
  notes: string | null;
  status: string;
  updatedAtLabel: string;
  lines: EstimateLineDTO[];
};

export type ProjectOption = { id: string; code: string; name: string; status: string };

const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

async function apiJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (res.status === 402 || body?.code === BILLING_BLOCKED_CODE) notifyBillingBlocked();
    throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${res.status})`);
  }
  return body;
}

export default function EstimatorClient({
  estimates,
  projects,
  selectedId,
  canEdit,
}: {
  estimates: EstimateDTO[];
  projects: ProjectOption[];
  selectedId: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [copyFrom, setCopyFrom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = selectedId ? estimates.find((e) => e.id === selectedId) ?? null : null;

  function create(copyFromProjectId: string | null) {
    setError(null);
    startTransition(async () => {
      try {
        const body = await apiJson("/api/rehab/estimates", {
          method: "POST",
          body: JSON.stringify(copyFromProjectId ? { copyFromProjectId } : {}),
        });
        const est = body.estimate as { id: string };
        router.push(`/rehab/estimator?id=${est.id}`);
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to create estimate");
      }
    });
  }

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* LEFT: estimate list + create actions */}
      <div
        style={{
          width: 260,
          flexShrink: 0,
          borderRight: "0.5px solid var(--border-lo)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--bg-secondary)",
        }}
      >
        {canEdit && (
          <div style={{ padding: 10, borderBottom: "0.5px solid var(--border-lo)", display: "flex", flexDirection: "column", gap: 6 }}>
            <button className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 11 }} onClick={() => create(null)} disabled={pending}>
              + New estimate
            </button>
            <div style={{ display: "flex", gap: 4 }}>
              <select
                value={copyFrom}
                onChange={(e) => setCopyFrom(e.target.value)}
                disabled={pending}
                style={{ flex: 1, minWidth: 0, padding: "4px 6px", fontSize: 10, border: "0.5px solid var(--border-mid)", borderRadius: 3 }}
                aria-label="Copy from project"
              >
                <option value="">Copy from project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name} ({p.status})
                  </option>
                ))}
              </select>
              <button className="btn-sm" onClick={() => copyFrom && create(copyFrom)} disabled={pending || !copyFrom}>
                Copy
              </button>
            </div>
            {error && !selected && <div style={{ fontSize: 10, color: "var(--red-txt)" }}>{error}</div>}
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {estimates.map((e) => {
            const totals = estimateTotals(e.lines, e.sqft);
            const active = e.id === selectedId;
            return (
              <div
                key={e.id}
                onClick={() => router.push(`/rehab/estimator?id=${e.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") router.push(`/rehab/estimator?id=${e.id}`);
                }}
                style={{
                  padding: "9px 10px",
                  borderBottom: "0.5px solid var(--border-lo)",
                  cursor: "pointer",
                  background: active ? "var(--bg-primary)" : "transparent",
                  borderLeft: active ? "2px solid var(--marine)" : "2px solid transparent",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: active ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {e.title}
                </div>
                <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 2 }}>
                  {fmt$(totals.grand)} · {e.lines.length} line{e.lines.length !== 1 ? "s" : ""} · {e.status}
                </div>
                <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{e.updatedAtLabel}</div>
              </div>
            );
          })}
          {estimates.length === 0 && (
            <div style={{ padding: 16, fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              No estimates yet.{canEdit ? " Create one or copy from a past project." : ""}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: editor */}
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        {selected ? (
          <EstimateEditor key={selected.id} estimate={selected} canEdit={canEdit} />
        ) : (
          <div style={{ padding: 24, fontSize: 12, color: "var(--text-tertiary)" }}>
            Select an estimate on the left{canEdit ? ", or create a new one" : ""}.
          </div>
        )}
      </div>
    </div>
  );
}

type LineDraft = {
  key: number;
  costCode: string;
  name: string;
  laborCost: string;
  materialCost: string;
  unit: string;
  unitPrice: string;
  quantity: string;
};

const toNum = (s: string): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const toNumOrNull = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function EstimateEditor({ estimate, canEdit }: { estimate: EstimateDTO; canEdit: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState(estimate.title);
  const [rehabType, setRehabType] = useState(estimate.rehabType ?? "");
  const [sqft, setSqft] = useState(estimate.sqft == null ? "" : String(estimate.sqft));
  const [notes, setNotes] = useState(estimate.notes ?? "");
  const [status, setStatus] = useState(estimate.status);
  const [lines, setLines] = useState<LineDraft[]>(
    estimate.lines.map((l, idx) => ({
      key: idx,
      costCode: l.costCode == null ? "" : String(l.costCode),
      name: l.name,
      laborCost: l.laborCost ? String(l.laborCost) : "",
      materialCost: l.materialCost ? String(l.materialCost) : "",
      unit: l.unit ?? "",
      unitPrice: l.unitPrice == null ? "" : String(l.unitPrice),
      quantity: l.quantity == null ? "" : String(l.quantity),
    }))
  );
  const [keyCounter, setKeyCounter] = useState(estimate.lines.length);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const parsedLines = lines.map((l) => ({
    costCode: l.costCode.trim() === "" ? null : Math.round(toNum(l.costCode)),
    name: l.name,
    laborCost: toNum(l.laborCost),
    materialCost: toNum(l.materialCost),
    unit: l.unit.trim() || null,
    unitPrice: toNumOrNull(l.unitPrice),
    quantity: toNumOrNull(l.quantity),
  }));
  const totals = estimateTotals(parsedLines, toNumOrNull(sqft));

  function setLine(key: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { key: keyCounter, costCode: "", name: "", laborCost: "", materialCost: "", unit: "", unitPrice: "", quantity: "" },
    ]);
    setKeyCounter((k) => k + 1);
  }

  function removeLine(key: number) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  async function persist(): Promise<void> {
    await apiJson(`/api/rehab/estimates/${estimate.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title,
        rehabType,
        sqft: sqft.trim() === "" ? null : Math.round(toNum(sqft)),
        notes,
        status,
        lines: parsedLines,
      }),
    });
  }

  function save() {
    setError(null);
    setSavedMsg(null);
    startTransition(async () => {
      try {
        await persist();
        setSavedMsg("Saved.");
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  function saveToDocuments() {
    setError(null);
    setSavedMsg(null);
    startTransition(async () => {
      try {
        await persist();
        await apiJson(`/api/rehab/estimates/${estimate.id}/save-to-documents`, { method: "POST" });
        setSavedMsg("Saved to Documents → Estimation.");
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to save to Documents");
      }
    });
  }

  function remove() {
    if (!window.confirm("Delete this estimate?")) return;
    startTransition(async () => {
      try {
        await apiJson(`/api/rehab/estimates/${estimate.id}`, { method: "DELETE" });
        router.push("/rehab/estimator");
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to delete");
      }
    });
  }

  const cell: React.CSSProperties = {
    padding: "4px 6px",
    fontSize: 11,
    border: "0.5px solid var(--border-mid)",
    borderRadius: 3,
    width: "100%",
  };
  const disabled = !canEdit || pending;

  return (
    <div style={{ padding: 16, maxWidth: 980 }}>
      {/* Meta */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ flex: 2, minWidth: 220 }}>
          <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Title</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={disabled} style={cell} />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Rehab type</div>
          <input value={rehabType} onChange={(e) => setRehabType(e.target.value)} placeholder="e.g. Full gut, Cosmetic" disabled={disabled} style={cell} />
        </div>
        <div style={{ width: 90 }}>
          <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Sqft</div>
          <input type="number" min={0} value={sqft} onChange={(e) => setSqft(e.target.value)} disabled={disabled} style={cell} />
        </div>
        <div style={{ width: 90 }}>
          <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Status</div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={disabled} style={cell}>
            <option value="Draft">Draft</option>
            <option value="Final">Final</option>
          </select>
        </div>
      </div>

      {/* Lines */}
      <div className="data-hd" style={{ gridTemplateColumns: "52px minmax(0,1fr) 84px 84px 64px 74px 58px 80px 24px", display: "grid", gap: 6 }}>
        <span className="col-label">Code</span>
        <span className="col-label">Line</span>
        <span className="col-label">Labor</span>
        <span className="col-label">Material</span>
        <span className="col-label">Unit</span>
        <span className="col-label">Unit $</span>
        <span className="col-label">Qty</span>
        <span className="col-label" style={{ textAlign: "right" }}>Total</span>
        <span />
      </div>
      {lines.map((l) => {
        const parsed = {
          laborCost: toNum(l.laborCost),
          materialCost: toNum(l.materialCost),
          unitPrice: toNumOrNull(l.unitPrice),
          quantity: toNumOrNull(l.quantity),
        };
        return (
          <div key={l.key} style={{ display: "grid", gridTemplateColumns: "52px minmax(0,1fr) 84px 84px 64px 74px 58px 80px 24px", gap: 6, alignItems: "center", padding: "3px 0" }}>
            <input value={l.costCode} onChange={(e) => setLine(l.key, { costCode: e.target.value })} placeholder="—" disabled={disabled} style={cell} aria-label="Cost code" />
            <input value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} placeholder="Line name" disabled={disabled} style={cell} aria-label="Line name" />
            <input type="number" min={0} value={l.laborCost} onChange={(e) => setLine(l.key, { laborCost: e.target.value })} placeholder="0" disabled={disabled} style={cell} aria-label="Labor cost" />
            <input type="number" min={0} value={l.materialCost} onChange={(e) => setLine(l.key, { materialCost: e.target.value })} placeholder="0" disabled={disabled} style={cell} aria-label="Material cost" />
            <input value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })} placeholder="sf / lf" disabled={disabled} style={cell} aria-label="Unit" />
            <input type="number" min={0} value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} placeholder="—" disabled={disabled} style={cell} aria-label="Unit price" />
            <input type="number" min={0} value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} placeholder="—" disabled={disabled} style={cell} aria-label="Quantity" />
            <div style={{ fontSize: 11, textAlign: "right", fontWeight: 500 }}>{fmt$(estimateLineTotal(parsed))}</div>
            {canEdit ? (
              <button onClick={() => removeLine(l.key)} disabled={pending} aria-label="Remove line" style={{ border: "none", background: "transparent", color: "var(--red-txt)", cursor: "pointer", fontSize: 12 }}>
                ×
              </button>
            ) : (
              <span />
            )}
          </div>
        );
      })}
      {canEdit && (
        <button className="btn-sm" onClick={addLine} disabled={pending} style={{ marginTop: 6 }}>
          + Add line
        </button>
      )}

      {/* Totals */}
      <div style={{ marginTop: 12, padding: "10px 14px", border: "0.5px solid var(--border-lo)", borderRadius: 6, background: "var(--bg-secondary)", display: "flex", gap: 18, flexWrap: "wrap", fontSize: 11 }}>
        <span>Labor <strong>{fmt$(totals.labor)}</strong></span>
        <span>Material <strong>{fmt$(totals.material)}</strong></span>
        {totals.unitPriced > 0 && <span>Unit-priced <strong>{fmt$(totals.unitPriced)}</strong></span>}
        <span>Grand total <strong>{fmt$(totals.grand)}</strong></span>
        <span>
          $/sqft{" "}
          <strong>
            {totals.perSqft != null
              ? `$${totals.perSqft.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
              : "—"}
          </strong>
        </span>
      </div>

      {/* Notes + actions */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Notes</div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={disabled} style={{ ...cell, resize: "vertical" }} />
      </div>
      {error && <div style={{ marginTop: 8, fontSize: 10, color: "var(--red-txt)" }}>{error}</div>}
      {savedMsg && <div style={{ marginTop: 8, fontSize: 10, color: "var(--green-txt)" }}>{savedMsg}</div>}
      {canEdit && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="btn btn-primary" style={{ padding: "6px 14px", fontSize: 11 }} onClick={save} disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </button>
          <button className="btn-sm" onClick={saveToDocuments} disabled={pending}>
            Save to Documents → Estimation
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn-sm" onClick={remove} disabled={pending} style={{ color: "var(--red-txt)" }}>
            Delete estimate
          </button>
        </div>
      )}
    </div>
  );
}
