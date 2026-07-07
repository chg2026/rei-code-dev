import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadProjectByCode } from "@/lib/rehab/queries";
import { formatET } from "@/lib/datetime";
import BudgetPhaseRows, { type BudgetPhaseRow } from "@/components/rehab/BudgetPhaseRows";
import { prisma } from "@/lib/prisma";
import { computePhaseActualBreakdowns } from "@/lib/rehab/invoiceActuals";
import { DrawStatus, InvoiceStatus, PhaseStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

type BudgetView = "phase" | "invoices";

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
  const view: BudgetView = sp.view === "invoices" ? "invoices" : "phase";
  const project = await loadProjectByCode(user.companyId, decodeURIComponent(projectId));
  if (!project) notFound();
  const invoiceDocs = project.documents.filter((d) => (d.category ?? "").toLowerCase() === "invoice");

  // Per-phase actual spend is computed by the shared helper so that staged
  // (milestone) payments are handled identically to the SOW tab: an unstaged
  // Paid invoice rolls its job-type amounts into the phase, while a staged
  // invoice only counts its Paid stages (allocated across job types). The
  // helper is the single source of truth — Phase.actual is kept in sync with
  // it by recomputePhaseActuals on every invoice / stage write. The breakdown
  // variant additionally buckets each phase's actual by the invoice
  // classification (labor / materials / other) for the per-phase detail rows.
  const actualsMap = await computePhaseActualBreakdowns(project.id);
  const invoiceRows = await prisma.invoice.findMany({
    where: { projectId: project.id },
    include: { jobTypes: { orderBy: { createdAt: "asc" } } },
    orderBy: { date: "desc" },
  });
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
  // Projected final: not-started phases contribute their budget, in-flight or
  // completed phases contribute their invoice-derived actual (which may exceed
  // budget for cost overruns). When a phase has no paid invoices yet we fall
  // back to its budget so projections never understate the plan.
  const projected = project.phases.reduce((acc, p) => {
    const budgetN = Number(p.budget ?? 0);
    const actualN = phaseActual(p.id);
    return acc + (p.status === PhaseStatus.NotStarted ? budgetN : actualN || budgetN);
  }, 0);
  // Remaining is measured against commitments, not just paid spend: what's
  // left of the phase budgets after every invoice (any status) is accounted.
  const remaining = phaseBudgetTotal - totalCommitted;
  const overage = projected - budget;
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
        <div className="kpi-card"><div className="kpi-label">Projected final</div><div className={`kpi-val ${overage > 0 ? "amber" : ""}`}>{fmt$(projected)}</div>{overage !== 0 && <div className="kpi-badge" style={overage > 0 ? { background: "var(--amber-bg)", color: "var(--amber-txt)" } : { background: "var(--green-bg)", color: "var(--green-txt)" }}>{overage > 0 ? `+${fmt$(overage)} over` : `${fmt$(overage)} under`}</div>}</div>
        <div className="kpi-card"><div className="kpi-label">Remaining</div><div className="kpi-val" style={remaining < 0 ? { color: "var(--red-txt)" } : undefined}>{fmt$(remaining)}</div><div className="kpi-sub">{project.draws.filter(d => d.status === DrawStatus.Pending).length} draws pending</div></div>
        <div className="kpi-card"><div className="kpi-label">Contractor balance</div><div className={`kpi-val ${pendingBalance > 0 ? "amber" : ""}`}>{fmt$(pendingBalance)}</div><div className="kpi-sub">{project.draws.filter(d => d.status === DrawStatus.Pending).map(d => `Draw #${d.number}`).join(" + ") || "—"}</div></div>
      </div>

      <div className="action-bar">
        <div className="toggle-group">
          <Link href={baseLink} scroll={false} className={`tg-btn ${view === "phase" ? "active" : ""}`}>By phase</Link>
          <Link href={`${baseLink}?view=invoices`} scroll={false} className={`tg-btn ${view === "invoices" ? "active" : ""}`}>Invoices</Link>
        </div>
        <button className="btn">Export</button>
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
