"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PhaseStatusSelect from "@/components/rehab/PhaseStatusSelect";
import { budgetCode, phaseCode } from "@/lib/rehab/budgetCode";
import { computeForecast, type ForecastMethodName } from "@/lib/rehab/forecast";

const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;
/** Signed dollar label for a projected over/under (negative = over budget). */
const fmtSigned$ = (n: number) =>
  n < 0 ? `-${fmt$(Math.abs(n))}` : n > 0 ? `+${fmt$(n)}` : "$0";

export type BudgetPhaseInvoice = {
  id: string;
  vendor: string;
  invoiceNumber: string | null;
  date: string;
  amount: number;
  status: string;
};

export type BudgetPhaseRow = {
  id: string;
  number: number;
  name: string;
  status: string;
  budget: number;
  actual: number;
  committed: number;
  laborBudget: number;
  materialsBudget: number;
  actualLabor: number;
  actualMaterials: number;
  actualOther: number;
  percentComplete: number;
  forecastMethod: ForecastMethodName;
  forecastManual: number | null;
  /** Sum of Pending change-order amounts for this phase (folds into the EAC). */
  pendingCO: number;
  /** Sum of Approved commitment amounts for this phase (info only — additive). */
  contracted: number;
  checklistTotal: number;
  checklistDone: number;
  drawTagCls: string;
  drawLabel: string;
  incompleteChecklist: boolean;
  invoices: BudgetPhaseInvoice[];
};

const GRID = "minmax(0,1fr) 62px 66px 62px 58px 66px 74px 118px 86px";

export default function BudgetPhaseRows({
  phases,
  projectCode,
}: {
  phases: BudgetPhaseRow[];
  projectCode: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  // Per-phase %-complete edits. Keyed override so a saved value (which arrives
  // back as a fresh prop after router.refresh) and the user's last intent stay
  // consistent; a failed save rolls the key back out.
  const [pctEdits, setPctEdits] = useState<Record<string, number>>({});
  const [pctSaving, setPctSaving] = useState<Record<string, boolean>>({});

  async function savePct(phaseId: string, raw: number) {
    const value = Math.max(0, Math.min(100, Math.round(raw)));
    setPctEdits((e) => ({ ...e, [phaseId]: value }));
    setPctSaving((s) => ({ ...s, [phaseId]: true }));
    try {
      const res = await fetch(
        `/api/rehab/${encodeURIComponent(projectCode)}/phases/${phaseId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ percentComplete: value }),
        }
      );
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      // rollback to the server value
      setPctEdits((e) => {
        const next = { ...e };
        delete next[phaseId];
        return next;
      });
    } finally {
      setPctSaving((s) => ({ ...s, [phaseId]: false }));
    }
  }

  return (
    <>
      <div className="data-hd" style={{ gridTemplateColumns: GRID }}>
        <span className="col-label">Job Type</span>
        <span className="col-label" style={{ textAlign: "right" }}>Budget</span>
        <span className="col-label" style={{ textAlign: "right" }}>Committed</span>
        <span className="col-label" style={{ textAlign: "right" }}>Actual</span>
        <span className="col-label" style={{ textAlign: "right" }}>Variance</span>
        <span className="col-label" style={{ textAlign: "right" }}>Forecast</span>
        <span className="col-label" style={{ textAlign: "right" }}>Proj +/−</span>
        <span className="col-label">Status</span>
        <span className="col-label">Draw status</span>
      </div>
      {phases.map((p) => {
        const b = p.budget;
        const a = p.actual;
        const c = p.committed;
        // Variance is measured against commitments: negative = over-committed.
        const v = b - c;
        const isOpen = !!expanded[p.id];
        const notStarted = p.status === "NotStarted";
        const comCol = notStarted ? (
          <span style={{ color: "var(--text-tertiary)" }}>—</span>
        ) : (
          <span>{fmt$(c)}</span>
        );
        const actCol = notStarted ? (
          <span style={{ color: "var(--text-tertiary)" }}>—</span>
        ) : (
          <span style={{ fontWeight: 500, color: a > b ? "var(--amber)" : "var(--green)" }}>{fmt$(a)}</span>
        );
        const varCol = notStarted ? (
          <span style={{ color: "var(--text-tertiary)" }}>—</span>
        ) : (
          <span style={{ color: v < 0 ? "var(--red-txt)" : "var(--green)" }}>
            {v < 0 ? `${fmt$(v)}` : v > 0 ? `+${fmt$(v)}` : "$0"}
          </span>
        );

        // Earned-value forecast. Uses the (possibly optimistic) edited pct.
        const effPercentComplete = pctEdits[p.id] ?? p.percentComplete;
        const fc = computeForecast({
          budget: b,
          committed: c,
          actual: a,
          percentComplete: effPercentComplete,
          forecastMethod: p.forecastMethod,
          forecastManual: p.forecastManual,
          pendingCO: p.pendingCO,
          checklistDone: p.checklistDone,
          checklistTotal: p.checklistTotal,
        });
        const overBudget = fc.projected < 0;
        return (
          <div key={p.id}>
            <div className="data-row" style={{ gridTemplateColumns: GRID }}>
              <div>
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  aria-expanded={isOpen}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <div className="cell-name">
                    <span style={{ display: "inline-block", width: 12, color: "var(--text-tertiary)" }}>
                      {isOpen ? "▾" : "▸"}
                    </span>
                    {p.name}
                  </div>
                  <div className="cell-meta" style={{ paddingLeft: 12 }}>
                    Job Type {p.number} · Code {phaseCode(p.number)}
                    {p.status === "InProgress" ? " — active" : ""}
                    {p.invoices.length > 0 ? ` · ${p.invoices.length} invoice${p.invoices.length === 1 ? "" : "s"}` : ""}
                    {p.pendingCO > 0 && (
                      <span style={{ color: "var(--amber)" }}>
                        {" "}· Pending changes +{fmt$(p.pendingCO)}
                      </span>
                    )}
                    {p.contracted > 0 && <span> · Contracted {fmt$(p.contracted)}</span>}
                  </div>
                </button>
              </div>
              <div style={{ textAlign: "right", fontSize: 11 }}>{fmt$(b)}</div>
              <div style={{ textAlign: "right", fontSize: 11 }}>{comCol}</div>
              <div style={{ textAlign: "right", fontSize: 11 }}>{actCol}</div>
              <div style={{ textAlign: "right", fontSize: 10 }}>{varCol}</div>
              <div style={{ textAlign: "right", fontSize: 11 }}>
                {notStarted ? (
                  <span style={{ color: "var(--text-tertiary)" }}>—</span>
                ) : (
                  <span>{fmt$(fc.eac)}</span>
                )}
              </div>
              <div style={{ textAlign: "right", fontSize: 10 }}>
                {notStarted ? (
                  <span style={{ color: "var(--text-tertiary)" }}>—</span>
                ) : (
                  <span style={{ color: overBudget ? "var(--red-txt)" : "var(--green)" }}>
                    {fmtSigned$(fc.projected)}
                  </span>
                )}
              </div>
              <div>
                <PhaseStatusSelect
                  phaseId={p.id}
                  projectId={projectCode}
                  currentStatus={p.status as never}
                  incompleteChecklist={p.incompleteChecklist}
                />
              </div>
              <span className={`cell-tag ${p.drawTagCls}`}>{p.drawLabel}</span>
            </div>
            {isOpen && (
              <div style={{ padding: "6px 12px 10px 24px", background: "var(--bg-secondary)" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    fontSize: 10,
                    color: "var(--text-secondary)",
                    paddingBottom: 6,
                    marginBottom: 6,
                    borderBottom: "0.5px solid var(--border-lo)",
                  }}
                >
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span>% complete</span>
                    <input
                      key={`${p.id}-${effPercentComplete}`}
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={effPercentComplete}
                      disabled={!!pctSaving[p.id]}
                      onBlur={(e) => {
                        const n = Number(e.currentTarget.value);
                        if (Number.isFinite(n) && n !== effPercentComplete) savePct(p.id, n);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      style={{
                        width: 52,
                        fontSize: 11,
                        padding: "2px 4px",
                        border: "0.5px solid var(--border-mid)",
                        borderRadius: 4,
                        background: "var(--bg-primary, #fff)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </label>
                  <span style={{ color: "var(--text-tertiary)" }}>
                    {fc.pct == null
                      ? "Effective: unknown"
                      : `Effective: ${fc.pct}%${
                          fc.pctSource === "checklist"
                            ? " (checklist)"
                            : fc.pctSource === "manual"
                              ? " (manual entry)"
                              : ""
                        }`}
                  </span>
                  {pctSaving[p.id] && <span style={{ color: "var(--text-tertiary)" }}>Saving…</span>}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-secondary)",
                    paddingBottom: 6,
                    marginBottom: 6,
                    borderBottom: "0.5px solid var(--border-lo)",
                  }}
                >
                  {p.laborBudget + p.materialsBudget === 0 && p.budget > 0 && (
                    <div>Unsplit budget {fmt$(p.budget)}</div>
                  )}
                  <div>
                    {budgetCode(p.number, "Labor")}:{" "}
                    {p.laborBudget + p.materialsBudget > 0 ? `budget ${fmt$(p.laborBudget)} · ` : ""}
                    actual {fmt$(p.actualLabor)}
                  </div>
                  <div>
                    {budgetCode(p.number, "Materials")}:{" "}
                    {p.laborBudget + p.materialsBudget > 0 ? `budget ${fmt$(p.materialsBudget)} · ` : ""}
                    actual {fmt$(p.actualMaterials)}
                  </div>
                  {p.actualOther > 0 && (
                    <div>{budgetCode(p.number, "Other")}: actual {fmt$(p.actualOther)}</div>
                  )}
                  <div>
                    Contracted (approved commitments): {fmt$(p.contracted)}
                  </div>
                </div>
                {p.invoices.length === 0 ? (
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                    No invoices assigned to this job type.
                  </div>
                ) : (
                  p.invoices.map((inv) => (
                    <div
                      key={inv.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0,1fr) 90px 70px",
                        gap: 8,
                        alignItems: "center",
                        padding: "3px 0",
                        borderBottom: "0.5px solid var(--border-lo)",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11 }}>{inv.vendor}</div>
                        <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                          {inv.invoiceNumber ? `#${inv.invoiceNumber} · ` : ""}
                          {inv.date}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, textAlign: "right", fontWeight: 600 }}>{fmt$(inv.amount)}</div>
                      <div style={{ fontSize: 9, textAlign: "right", color: "var(--text-secondary)" }}>{inv.status}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
