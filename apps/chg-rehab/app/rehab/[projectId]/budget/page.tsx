import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { loadProjectByCode } from "@/lib/rehab/queries";
import { formatET } from "@/lib/datetime";
import DocUploadButton from "@/components/rehab/DocUploadButton";
import BudgetPhaseRows, { type BudgetPhaseRow } from "@/components/rehab/BudgetPhaseRows";
import { prisma } from "@/lib/prisma";
import { DrawStatus, PhaseStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

type BudgetView = "phase" | "lineItems" | "invoices";

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
    sp.view === "lineItems" ? "lineItems" : sp.view === "invoices" ? "invoices" : "phase";
  const project = await loadProjectByCode(user.companyId, decodeURIComponent(projectId));
  if (!project) notFound();
  const canUploadDocs = await can(user, "documents", "edit");
  const invoiceDocs = project.documents.filter((d) => (d.category ?? "").toLowerCase() === "invoice");

  // Per-phase actual spend is pulled directly from invoices: every
  // InvoiceJobType.amount whose parent invoice is Paid, grouped by phaseId.
  // This is the source of truth for the Actual / Variance / Spend-by-phase
  // figures (Phase.actual is also kept in sync by recomputePhaseActuals on
  // every invoice write, but reading invoices here keeps the page correct
  // even for data that predates that helper).
  const invoiceRows = await prisma.invoice.findMany({
    where: { projectId: project.id },
    include: { jobTypes: { orderBy: { createdAt: "asc" } } },
    orderBy: { date: "desc" },
  });
  const paidActualByPhase = new Map<string, number>();
  const invoicesByPhase = new Map<string, BudgetPhaseRow["invoices"]>();
  for (const inv of invoiceRows) {
    const isPaid = inv.status === "Paid";
    for (const jt of inv.jobTypes) {
      if (!jt.phaseId) continue;
      const amt = Number(jt.amount);
      if (isPaid) {
        paidActualByPhase.set(jt.phaseId, (paidActualByPhase.get(jt.phaseId) ?? 0) + amt);
      }
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
  const phaseActual = (phaseId: string) => paidActualByPhase.get(phaseId) ?? 0;

  const budget = Number(project.budget ?? 0);
  const totalSpent = project.draws
    .filter((d) => d.status === DrawStatus.Paid || d.status === DrawStatus.Approved)
    .reduce((acc, d) => acc + Number(d.amount), 0);
  // Projected final: not-started phases contribute their budget, in-flight or
  // completed phases contribute their invoice-derived actual (which may exceed
  // budget for cost overruns). When a phase has no paid invoices yet we fall
  // back to its budget so projections never understate the plan.
  const projected = project.phases.reduce((acc, p) => {
    const budgetN = Number(p.budget ?? 0);
    const actualN = phaseActual(p.id);
    return acc + (p.status === PhaseStatus.NotStarted ? budgetN : actualN || budgetN);
  }, 0);
  const remaining = Math.max(0, budget - totalSpent);
  const overage = projected - budget;
  const pendingBalance = project.draws
    .filter((d) => d.status === DrawStatus.Pending)
    .reduce((acc, d) => acc + Number(d.amount), 0);

  // Materialize line items joined with the phase they belong to. Phase order is
  // already enforced by the query, and SowSection.order matches phase index in
  // the seed; use that to compute per-line budget rows.
  const sectionByIdx = project.sowSections;
  const lineRows = project.phases.flatMap((p, idx) => {
    const section = sectionByIdx[idx];
    if (!section) return [];
    return section.lineItems.map((li) => ({
      phase: p,
      li,
      isCO: /\(CO\)|CO\)/.test(li.description),
    }));
  });
  const lineItemsTotal = lineRows.reduce((acc, r) => acc + Number(r.li.totalCost ?? 0), 0);
  const baseLink = `/rehab/${project.code}/budget`;

  const phaseRows: BudgetPhaseRow[] = project.phases.map((p) => {
    const draw = p.draws[0];
    const drawPaid = !!draw && (draw.status === DrawStatus.Paid || draw.status === DrawStatus.Approved);
    return {
      id: p.id,
      number: p.number,
      name: p.name,
      status: p.status,
      budget: Number(p.budget ?? 0),
      actual: phaseActual(p.id),
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
        <div className="kpi-card"><div className="kpi-label">Total spent</div><div className="kpi-val green">{fmt$(totalSpent)}</div><div className="kpi-sub">{project.draws.filter(d => d.status === DrawStatus.Paid || d.status === DrawStatus.Approved).length} draws paid</div></div>
        <div className="kpi-card"><div className="kpi-label">Projected final</div><div className={`kpi-val ${overage > 0 ? "amber" : ""}`}>{fmt$(projected)}</div>{overage !== 0 && <div className="kpi-badge" style={overage > 0 ? { background: "var(--amber-bg)", color: "var(--amber-txt)" } : { background: "var(--green-bg)", color: "var(--green-txt)" }}>{overage > 0 ? `+${fmt$(overage)} over` : `${fmt$(overage)} under`}</div>}</div>
        <div className="kpi-card"><div className="kpi-label">Remaining</div><div className="kpi-val">{fmt$(remaining)}</div><div className="kpi-sub">{project.draws.filter(d => d.status === DrawStatus.Pending).length} draws pending</div></div>
        <div className="kpi-card"><div className="kpi-label">Contractor balance</div><div className={`kpi-val ${pendingBalance > 0 ? "amber" : ""}`}>{fmt$(pendingBalance)}</div><div className="kpi-sub">{project.draws.filter(d => d.status === DrawStatus.Pending).map(d => `Draw #${d.number}`).join(" + ") || "—"}</div></div>
      </div>

      <div className="action-bar">
        <div className="toggle-group">
          <Link href={baseLink} scroll={false} className={`tg-btn ${view === "phase" ? "active" : ""}`}>By phase</Link>
          <Link href={`${baseLink}?view=lineItems`} scroll={false} className={`tg-btn ${view === "lineItems" ? "active" : ""}`}>By line item</Link>
          <Link href={`${baseLink}?view=invoices`} scroll={false} className={`tg-btn ${view === "invoices" ? "active" : ""}`}>Invoices</Link>
        </div>
        <button className="btn">Export</button>
        {canUploadDocs && (
          <DocUploadButton
            projectCode={project.code}
            defaultCategory="Invoice"
            fixedCategory
            label="+ Add invoice"
          />
        )}
      </div>

      <div className="body-split">
        <div className="body-main">
          {view === "phase" && (
            <BudgetPhaseRows phases={phaseRows} projectCode={project.code} />
          )}

          {view === "lineItems" && (
            <>
              <div
                className="data-hd"
                style={{ gridTemplateColumns: "minmax(0,1fr) 78px 70px 70px 76px 88px" }}
              >
                <span className="col-label">Line item</span>
                <span className="col-label">Job Type</span>
                <span className="col-label" style={{ textAlign: "right" }}>Estimated</span>
                <span className="col-label" style={{ textAlign: "right" }}>Actual</span>
                <span className="col-label" style={{ textAlign: "right" }}>Variance</span>
                <span className="col-label">Status</span>
              </div>
              {lineRows.map(({ phase: p, li, isCO }) => {
                const est = Number(li.totalCost ?? 0);
                const phaseDone = p.status === PhaseStatus.Done;
                const phaseActive = p.status === PhaseStatus.InProgress;
                const actVal = phaseDone || isCO ? est : null;
                const variance = actVal !== null ? actVal - est : 0;
                const tagCls = phaseDone ? "tag-paid" : phaseActive ? "tag-pend" : "";
                const tagLabel = phaseDone ? "Done" : phaseActive ? "In progress" : "Pending";
                return (
                  <div
                    className="data-row"
                    style={{ gridTemplateColumns: "minmax(0,1fr) 78px 70px 70px 76px 88px" }}
                    key={li.id}
                  >
                    <div>
                      <div className="cell-name">
                        {li.description}
                        {isCO && (
                          <span
                            className="mapped-pill"
                            style={{ marginLeft: 6, background: "var(--purple-bg)", color: "var(--purple-txt)" }}
                          >
                            CO
                          </span>
                        )}
                      </div>
                      {li.notes && <div className="cell-meta">{li.notes}</div>}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>Job Type {p.number}</div>
                    <div style={{ textAlign: "right", fontSize: 11 }}>${est.toLocaleString()}</div>
                    <div style={{ textAlign: "right", fontSize: 11 }}>
                      {actVal !== null ? (
                        <span style={{ color: variance > 0 ? "var(--amber)" : "var(--green)" }}>
                          ${actVal.toLocaleString()}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>—</span>
                      )}
                    </div>
                    <div style={{ textAlign: "right", fontSize: 10 }}>
                      {actVal !== null ? (
                        <span style={{ color: variance > 0 ? "var(--amber)" : "var(--green)" }}>
                          {variance > 0 ? `+${fmt$(variance)}` : variance < 0 ? fmt$(variance) : "$0"}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>—</span>
                      )}
                    </div>
                    <span
                      className={`cell-tag ${tagCls}`}
                      style={!tagCls ? { background: "#F1EFE8", color: "#5F5E5A" } : undefined}
                    >
                      {tagLabel}
                    </span>
                  </div>
                );
              })}
              <div
                className="data-row"
                style={{
                  gridTemplateColumns: "minmax(0,1fr) 78px 70px 70px 76px 88px",
                  background: "var(--bg-secondary)",
                  fontWeight: 600,
                }}
              >
                <div className="cell-name">Total ({lineRows.length} line items)</div>
                <div></div>
                <div style={{ textAlign: "right", fontSize: 11 }}>${lineItemsTotal.toLocaleString()}</div>
                <div></div>
                <div></div>
                <div></div>
              </div>
            </>
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
