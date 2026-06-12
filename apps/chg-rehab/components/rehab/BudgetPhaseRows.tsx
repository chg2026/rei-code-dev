"use client";

import { useState } from "react";
import PhaseStatusSelect from "@/components/rehab/PhaseStatusSelect";

const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

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
  drawTagCls: string;
  drawLabel: string;
  incompleteChecklist: boolean;
  invoices: BudgetPhaseInvoice[];
};

const GRID = "minmax(0,1fr) 68px 70px 70px 130px 92px";

export default function BudgetPhaseRows({
  phases,
  projectCode,
}: {
  phases: BudgetPhaseRow[];
  projectCode: string;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  return (
    <>
      <div className="data-hd" style={{ gridTemplateColumns: GRID }}>
        <span className="col-label">Job Type</span>
        <span className="col-label" style={{ textAlign: "right" }}>Budget</span>
        <span className="col-label" style={{ textAlign: "right" }}>Actual</span>
        <span className="col-label" style={{ textAlign: "right" }}>Variance</span>
        <span className="col-label">Status</span>
        <span className="col-label">Draw status</span>
      </div>
      {phases.map((p) => {
        const b = p.budget;
        const a = p.actual;
        const v = a - b;
        const isOpen = !!expanded[p.id];
        const notStarted = p.status === "NotStarted";
        const actCol = notStarted ? (
          <span style={{ color: "var(--text-tertiary)" }}>—</span>
        ) : (
          <span style={{ fontWeight: 500, color: v > 0 ? "var(--amber)" : "var(--green)" }}>{fmt$(a)}</span>
        );
        const varCol = notStarted ? (
          <span style={{ color: "var(--text-tertiary)" }}>—</span>
        ) : (
          <span style={{ color: v > 0 ? "var(--amber)" : "var(--green)" }}>
            {v > 0 ? `+${fmt$(v)}` : v < 0 ? `${fmt$(v)}` : "$0"}
          </span>
        );
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
                    Job Type {p.number}
                    {p.status === "InProgress" ? " — active" : ""}
                    {p.invoices.length > 0 ? ` · ${p.invoices.length} invoice${p.invoices.length === 1 ? "" : "s"}` : ""}
                  </div>
                </button>
              </div>
              <div style={{ textAlign: "right", fontSize: 11 }}>{fmt$(b)}</div>
              <div style={{ textAlign: "right", fontSize: 11 }}>{actCol}</div>
              <div style={{ textAlign: "right", fontSize: 10 }}>{varCol}</div>
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
