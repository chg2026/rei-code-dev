import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadProjectByCode } from "@/lib/rehab/queries";
import { formatET } from "@/lib/datetime";
import BudgetPhaseRows, { type BudgetPhaseRow } from "@/components/rehab/BudgetPhaseRows";
import ContingencyKpi from "@/components/rehab/ContingencyKpi";
import CommitmentsView, { type CommitmentDTO } from "@/components/rehab/CommitmentsView";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { computePhaseActualBreakdowns } from "@/lib/rehab/invoiceActuals";
import { computePendingChangeOrders } from "@/lib/rehab/changeOrders";
import { computeProjectForecastTotals } from "@/lib/rehab/projectForecast";
import { DrawStatus, InvoiceStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

type BudgetView = "phase" | "invoices" | "commitments";

export default async function BudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const sp = await searchParams;
  const view: BudgetView =
    sp.view === "invoices" ? "invoices" : sp.view === "commitments" ? "commitments" : "phase";
  const project = await loadProjectByCode(user.companyId, decodeURIComponent(projectId));
  if (!project) notFound();
  const invoiceDocs = project.documents.filter((d) => (d.category ?? "").toLowerCase() === "invoice");
  // Contingency reserve — a labeled line, never folded into per-phase math.
  const contingency = Number(project.contingency ?? 0);
  const canEditRehab = await can(user, "rehab", "edit");

  // Per-phase actual spend is computed by the shared helper so that staged
  // (milestone) payments are handled identically to the SOW tab: an unstaged
  // Paid invoice rolls its job-type amounts into the phase, while a staged
  // invoice only counts its Paid stages (allocated across job types). The
  // helper is the single source of truth — Phase.actual is kept in sync with
  // it by recomputePhaseActuals on every invoice / stage write. The breakdown
  // variant additionally buckets each phase's actual by the invoice
  // classification (labor / materials / other) for the per-phase detail rows.
  const actualsMap = await computePhaseActualBreakdowns(project.id);
  // Pending change orders per phase (and project total). Approved COs are
  // already folded into Phase.budget, so these ride on top of the forecast
  // (EAC) only — never budget / committed / actual.
  const pendingCOs = await computePendingChangeOrders(project.id);
  const invoiceRows = await prisma.invoice.findMany({
    where: { projectId: project.id },
    include: { jobTypes: { orderBy: { createdAt: "asc" } } },
    orderBy: { date: "desc" },
  });
  // Commitments (subcontracts / purchase orders). "Contracted" per phase = sum
  // of its Approved commitments — additive info only, never part of the
  // invoice-driven Committed/Actual/Forecast columns.
  const commitmentRows = await prisma.commitment.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "asc" },
  });
  const contractedByPhase = new Map<string, number>();
  for (const c of commitmentRows) {
    if (c.status !== "Approved" || !c.phaseId) continue;
    contractedByPhase.set(
      c.phaseId,
      (contractedByPhase.get(c.phaseId) ?? 0) + Number(c.amount)
    );
  }
  const commitmentDTOs: CommitmentDTO[] = commitmentRows.map((c) => ({
    id: c.id,
    title: c.title,
    phaseId: c.phaseId,
    type: c.type,
    status: c.status,
    amount: Number(c.amount),
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
  }));
  const invoicesByPhase = new Map<string, BudgetPhaseRow["invoices"]>();
  for (const inv of invoiceRows) {
    for (const jt of inv.jobTypes) {
      if (!jt.phaseId) continue;
      const amt = Number(jt.amount);
      const list = invoicesByPhase.get(jt.phaseId) ?? [];
      list.push({
        id: `${inv.id}:${jt.id}`,
        vendor: inv.vendor,
        invoiceNumber: inv.invoiceNumber,
        date: inv.date.toISOString().slice(0, 10),
        amount: amt,
        status: inv.status,
      });
      invoicesByPhase.set(jt.phaseId, list);
    }
  }
  const phaseActual = (phaseId: string) => Number(actualsMap.get(phaseId)?.total ?? 0);

  const budget = Number(project.budget ?? 0);
  // Job-to-Date spend = sum of Paid invoices. Draws remain the contractor
  // payout ledger but are no longer the source of "Total spent".
  const paidInvoices = invoiceRows.filter((inv) => inv.status === InvoiceStatus.Paid);
  const totalSpent = paidInvoices.reduce((acc, inv) => acc + Number(inv.amount), 0);
  // Committed = every invoice regardless of status (Unpaid, Pending, Paid).
  const totalCommitted = invoiceRows.reduce((acc, inv) => acc + Number(inv.amount), 0);
  const phaseBudgetTotal = project.phases.reduce((acc, p) => acc + Number(p.budget ?? 0), 0);
  // Project-total labor / materials split. Reuses the same per-phase actualsMap
  // (invoice-classified spend) and phase.laborBudget / materialsBudget that the
  // per-Job-Type expand rows use — this band is just their sum, never a second
  // way of computing money.
  let laborBudgetTotal = 0;
  let materialsBudgetTotal = 0;
  let unsplitBudgetTotal = 0;
  let actualLaborTotal = 0;
  let actualMaterialsTotal = 0;
  let actualOtherTotal = 0;
  for (const p of project.phases) {
    const lb = Number(p.laborBudget ?? 0);
    const mb = Number(p.materialsBudget ?? 0);
    laborBudgetTotal += lb;
    materialsBudgetTotal += mb;
    if (lb + mb === 0) unsplitBudgetTotal += Number(p.budget ?? 0);
    const bd = actualsMap.get(p.id);
    actualLaborTotal += Number(bd?.labor ?? 0);
    actualMaterialsTotal += Number(bd?.materials ?? 0);
    actualOtherTotal += Number(bd?.other ?? 0);
  }
  const splitBands = [
    { label: "Labor", budget: laborBudgetTotal, actual: actualLaborTotal, tone: "var(--blue-txt, #2563eb)" },
    { label: "Materials", budget: materialsBudgetTotal, actual: actualMaterialsTotal, tone: "var(--green, #16a34a)" },
  ];
  // Projected Final / Over-Under come from the shared project-forecast helper
  // (lib/rehab/projectForecast.ts): Σ per-phase EAC with pending COs folded in,
  // measured against the working budget (Σ phase budgets — NOT the signed
  // Approved budget, which can be $0). The Overview tile uses the same helper,
  // so the two surfaces always show identical numbers.
  const { projectedFinal, overUnder } = computeProjectForecastTotals(
    project.phases,
    actualsMap,
    pendingCOs
  );
  // Remaining is measured against commitments, not just paid spend: what's
  // left of the phase budgets after every invoice (any status) is accounted.
  const remaining = phaseBudgetTotal - totalCommitted;
  const pendingBalance = project.draws
    .filter((d) => d.status === DrawStatus.Pending)
    .reduce((acc, d) => acc + Number(d.amount), 0);

  const baseLink = `/rehab/${project.code}/budget`;

  const phaseRows: BudgetPhaseRow[] = project.phases.map((p) => {
    const draw = p.draws[0];
    const drawPaid = !!draw && (draw.status === DrawStatus.Paid || draw.status === DrawStatus.Approved);
    const breakdown = actualsMap.get(p.id);
    const checklistTotal = p.checklistItems.length;
    const checklistDone = p.checklistItems.filter(
      (i) => i.status === "Done" || i.status === "NA"
    ).length;
    return {
      id: p.id,
      number: p.number,
      name: p.name,
      status: p.status,
      budget: Number(p.budget ?? 0),
      actual: phaseActual(p.id),
      laborBudget: Number(p.laborBudget ?? 0),
      materialsBudget: Number(p.materialsBudget ?? 0),
      actualLabor: Number(breakdown?.labor ?? 0),
      actualMaterials: Number(breakdown?.materials ?? 0),
      actualOther: Number(breakdown?.other ?? 0),
      committed: Number(breakdown?.committed ?? 0),
      percentComplete: p.percentComplete,
      forecastMethod: p.forecastMethod,
      forecastManual: p.forecastManual == null ? null : Number(p.forecastManual),
      pendingCO: pendingCOs.byPhase.get(p.id) ?? 0,
      contracted: contractedByPhase.get(p.id) ?? 0,
      checklistTotal,
      checklistDone,
      drawTagCls: drawPaid ? "tag-paid" : "tag-pend",
      drawLabel: draw
        ? drawPaid
          ? `Draw #${draw.number} paid`
          : `Draw #${draw.number} pending`
        : "—",
      incompleteChecklist:
        p.checklistItems.length > 0 &&
        p.checklistItems.some((i) => i.status !== "Done" && i.status !== "NA"),
      invoices: invoicesByPhase.get(p.id) ?? [],
    };
  });

  return (
    <div className="tab-panel active">
      <div className="kpi-strip">
        <div className="kpi-card"><div className="kpi-label">Approved budget</div><div className="kpi-val">{fmt$(budget)}</div><div className="kpi-sub">Signed {formatET(project.startDate, false)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Total spent</div><div className="kpi-val green">{fmt$(totalSpent)}</div><div className="kpi-sub">{paidInvoices.length} invoices paid</div></div>
        <div className="kpi-card"><div className="kpi-label">Committed</div><div className="kpi-val">{fmt$(totalCommitted)}</div><div className="kpi-sub">{invoiceRows.length} invoices, all statuses</div></div>
        <div className="kpi-card"><div className="kpi-label">Projected final</div><div className={`kpi-val ${overUnder < 0 ? "amber" : ""}`}>{fmt$(projectedFinal)}</div>{overUnder !== 0 && <div className="kpi-badge" style={overUnder < 0 ? { background: "var(--red-bg)", color: "var(--red-txt)" } : { background: "var(--green-bg)", color: "var(--green-txt)" }}>{overUnder < 0 ? `+${fmt$(Math.abs(overUnder))} over` : `${fmt$(overUnder)} under`}</div>}</div>
        <div className="kpi-card"><div className="kpi-label">Pending changes</div><div className={`kpi-val ${pendingCOs.total > 0 ? "amber" : ""}`}>{fmt$(pendingCOs.total)}</div><div className="kpi-sub">Change orders awaiting approval</div></div>
        <ContingencyKpi projectCode={project.code} initial={contingency} canEdit={canEditRehab} />
        <div className="kpi-card"><div className="kpi-label">Remaining</div><div className="kpi-val" style={remaining < 0 ? { color: "var(--red-txt)" } : undefined}>{fmt$(remaining)}</div><div className="kpi-sub">{project.draws.filter(d => d.status === DrawStatus.Pending).length} draws pending</div></div>
        <div className="kpi-card"><div className="kpi-label">Contractor balance</div><div className={`kpi-val ${pendingBalance > 0 ? "amber" : ""}`}>{fmt$(pendingBalance)}</div><div className="kpi-sub">{project.draws.filter(d => d.status === DrawStatus.Pending).map(d => `Draw #${d.number}`).join(" + ") || "—"}</div></div>
      </div>

      <div className="split-band" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "0 0 12px" }}>
        {splitBands.map((s) => {
          const pct = s.budget > 0 ? Math.min(100, Math.round((s.actual / s.budget) * 100)) : 0;
          const over = s.budget > 0 && s.actual > s.budget;
          return (
            <div className="kpi-card" key={s.label} style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div className="kpi-label">{s.label} budget</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {s.budget > 0 ? `${pct}% spent` : "not split"}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 2 }}>
                <div className="kpi-val">{fmt$(s.budget)}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: over ? "var(--red-txt)" : "var(--green)" }}>
                  {fmt$(s.actual)} spent
                </div>
              </div>
              <div className="spend-track" style={{ marginTop: 8 }}>
                <div className="spend-fill" style={{ width: `${pct}%`, background: over ? "var(--red-txt)" : s.tone }} />
              </div>
            </div>
          );
        })}
        {(actualOtherTotal > 0 || unsplitBudgetTotal > 0) && (
          <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "var(--text-tertiary)", display: "flex", gap: 16, flexWrap: "wrap" }}>
            {actualOtherTotal > 0 && <span>Other spend (permits, dumpster, utilities): {fmt$(actualOtherTotal)}</span>}
            {unsplitBudgetTotal > 0 && <span>Unsplit budget (no labor/material split set): {fmt$(unsplitBudgetTotal)}</span>}
          </div>
        )}
      </div>

      <div className="action-bar">
        <div className="toggle-group">
          <Link href={baseLink} scroll={false} className={`tg-btn ${view === "phase" ? "active" : ""}`}>By phase</Link>
          <Link href={`${baseLink}?view=invoices`} scroll={false} className={`tg-btn ${view === "invoices" ? "active" : ""}`}>Invoices</Link>
          <Link href={`${baseLink}?view=commitments`} scroll={false} className={`tg-btn ${view === "commitments" ? "active" : ""}`}>Commitments</Link>
        </div>
        <a className="btn" href={`/api/rehab/${encodeURIComponent(project.code)}/budget-report`} target="_blank" rel="noreferrer">Export PDF</a>
        {/* Opens the real invoice form on the Invoices tab (single entry point —
            no more dead document uploads that never become an invoice). */}
        <Link href={`/rehab/${project.code}/invoices?new=1`} className="btn btn-primary">
          + Add invoice
        </Link>
      </div>

      <div className="body-split">
        <div className="body-main">
          {view === "phase" && (
            <BudgetPhaseRows phases={phaseRows} projectCode={project.code} />
          )}

          {view === "commitments" && (
            <CommitmentsView
              projectCode={project.code}
              phases={project.phases.map((p) => ({ id: p.id, number: p.number, name: p.name }))}
              commitments={commitmentDTOs}
              canEdit={canEditRehab}
            />
          )}

          {view === "invoices" && (
            <>
              <div className="data-hd" style={{ gridTemplateColumns: "minmax(0,1fr) 80px 68px 56px 24px" }}>
                <span className="col-label">Description</span>
                <span className="col-label" style={{ textAlign: "right" }}>Amount</span>
                <span className="col-label">Job Type</span>
                <span className="col-label">Status</span>
                <span></span>
              </div>
              {project.draws.map((d) => {
                const paid = d.status === DrawStatus.Paid || d.status === DrawStatus.Approved;
                const phase = project.phases.find((p) => p.id === d.phaseId);
                return (
                  <div className="data-row" style={{ gridTemplateColumns: "minmax(0,1fr) 80px 68px 56px 24px" }} key={d.id}>
                    <div>
                      <div className="cell-name">{d.title}</div>
                      <div className="cell-meta">
                        {paid ? `${formatET(d.paidAt ?? d.approvedAt)} · Approved` : "Awaiting checklist sign-off"}
                      </div>
                    </div>
                    <div className="cell-amt">{fmt$(Number(d.amount))}</div>
                    <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>Job Type {phase?.number ?? "—"}</div>
                    <span className={`cell-tag ${paid ? "tag-paid" : "tag-pend"}`}>{paid ? "Paid" : "Pending"}</span>
                    <span className="cell-dl">—</span>
                  </div>
                );
              })}
              {invoiceDocs.length > 0 && (
                <>
                  <div className="sec-hd" style={{ marginTop: 12 }}>Uploaded invoices ({invoiceDocs.length})</div>
                  {invoiceDocs.map((doc) => (
                    <div className="data-row" style={{ gridTemplateColumns: "minmax(0,1fr) 80px 68px 56px 24px" }} key={doc.id}>
                      <div>
                        <div className="cell-name">{doc.name}</div>
                        <div className="cell-meta">
                          Uploaded {formatET(doc.uploadedAt)}
                          {doc.size ? ` · ${(doc.size / 1024).toFixed(1)} KB` : ""}
                        </div>
                      </div>
                      <div className="cell-amt">—</div>
                      <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>—</div>
                      <span className="cell-tag tag-system">Doc</span>
                      {doc.fileKey ? (
                        <a className="cell-dl" href={doc.fileKey} target="_blank" rel="noreferrer" aria-label={`Download ${doc.name}`}>↓</a>
                      ) : (
                        <span className="cell-dl">—</span>
                      )}
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {view === "phase" && (
            <>
              <div className="sec-hd">Invoice & receipt log</div>
              <div className="data-hd" style={{ gridTemplateColumns: "minmax(0,1fr) 80px 68px 56px 24px" }}>
                <span className="col-label">Description</span>
                <span className="col-label" style={{ textAlign: "right" }}>Amount</span>
                <span className="col-label">Job Type</span>
                <span className="col-label">Status</span>
                <span></span>
              </div>
              {project.draws.map((d) => {
                const paid = d.status === DrawStatus.Paid || d.status === DrawStatus.Approved;
                const phase = project.phases.find((p) => p.id === d.phaseId);
                return (
                  <div className="data-row" style={{ gridTemplateColumns: "minmax(0,1fr) 80px 68px 56px 24px" }} key={d.id}>
                    <div>
                      <div className="cell-name">{d.title}</div>
                      <div className="cell-meta">
                        {paid ? `${formatET(d.paidAt ?? d.approvedAt)} · Approved` : "Awaiting checklist sign-off"}
                      </div>
                    </div>
                    <div className="cell-amt">{fmt$(Number(d.amount))}</div>
                    <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>Job Type {phase?.number ?? "—"}</div>
                    <span className={`cell-tag ${paid ? "tag-paid" : "tag-pend"}`}>{paid ? "Paid" : "Pending"}</span>
                    <span className="cell-dl">↓</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
        <div className="body-side">
          <div className="sb-sec" style={{ padding: "10px 12px" }}>
            <div className="sb-hd" style={{ padding: "0 0 6px" }}>Spend by phase</div>
            {project.phases.map((p) => {
              const a = phaseActual(p.id);
              const pct = totalSpent > 0 ? Math.round((a / Math.max(totalSpent + pendingBalance, 1)) * 100) : 0;
              return (
                <div className="spend-bar-row" key={p.id}>
                  <div className="spend-lbl"><span>{p.name}</span><span>{fmt$(a)}</span></div>
                  <div className="spend-track"><div className="spend-fill" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
