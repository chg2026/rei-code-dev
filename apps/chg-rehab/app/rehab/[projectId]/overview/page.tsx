import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadProjectActivity, loadProjectByCode } from "@/lib/rehab/queries";
import { formatET } from "@/lib/datetime";
import { parseActivityMeta, parseProjectMeta } from "@/lib/rehab/types";
import OverviewKpis from "@/components/rehab/OverviewKpis";
import ActualCompletionDate from "@/components/rehab/ActualCompletionDate";
import PhaseStatusSelect from "@/components/rehab/PhaseStatusSelect";
import { effectivePct, computeForecast } from "@/lib/rehab/forecast";
import { computePhaseActualBreakdowns } from "@/lib/rehab/invoiceActuals";
import { computePendingChangeOrders } from "@/lib/rehab/changeOrders";
import { prisma } from "@/lib/prisma";
import {
  PhaseStatus,
  DrawStatus,
  ChangeOrderStatus,
  CommitmentStatus,
  InvoiceClassification,
  InvoiceStatus,
  IssueStatus,
  ProjectStatus,
  PunchStatus,
} from "@prisma/client";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const fmt$ = (n: number) =>
  n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** One label/value line in the Cost Breakdown panel. `total` bolds the "=" rows. */
function BreakdownRow({
  label,
  value,
  total = false,
  muted = false,
}: {
  label: string;
  value: string;
  total?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        fontSize: 12,
        fontWeight: total ? 600 : 400,
        color: muted ? "var(--text-tertiary)" : total ? "var(--text-primary)" : "var(--text-secondary)",
        paddingTop: total ? 4 : 0,
        borderTop: total ? "0.5px solid var(--border-lo)" : undefined,
      }}
    >
      <span>{label}</span>
      <span style={{ color: total ? "var(--text-primary)" : "inherit" }}>{value}</span>
    </div>
  );
}

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const project = await loadProjectByCode(user.companyId, decodeURIComponent(projectId));
  if (!project) notFound();

  const code = project.code;
  const meta = parseProjectMeta(project.meta);
  const budget = Number(project.budget ?? 0);

  // Parallel aggregates: invoice spend/outstanding, pending change orders,
  // contractor assignments, property meta (acquisition cost), activity feed.
  const [
    paidInvoiceAgg,
    allInvoiceAgg,
    laborAgg,
    materialAgg,
    outstandingAgg,
    pendingChangeOrders,
    contractorAssignments,
    propertyRow,
    allActivity,
    actualsMap,
    pendingCOs,
    approvedCOAgg,
    approvedCommitmentAgg,
    openIssueCount,
    openPunchCount,
    latestDailyLog,
  ] = await Promise.all([
    prisma.invoice.aggregate({
      where: { projectId: project.id, status: InvoiceStatus.Paid },
      _sum: { amount: true },
    }),
    // Committed = every invoice regardless of payment status.
    prisma.invoice.aggregate({
      where: { projectId: project.id },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: {
        projectId: project.id,
        classification: InvoiceClassification.Labor,
        status: InvoiceStatus.Paid,
      },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: {
        projectId: project.id,
        classification: InvoiceClassification.Materials,
        status: InvoiceStatus.Paid,
      },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: {
        projectId: project.id,
        status: { in: [InvoiceStatus.Unpaid, InvoiceStatus.Pending] },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.changeOrder.count({
      where: { projectId: project.id, status: ChangeOrderStatus.Pending },
    }),
    prisma.contractorAssignment.findMany({
      where: { projectId: project.id, companyId: user.companyId, status: "Active" },
      include: { contact: true },
    }),
    prisma.property.findUnique({
      where: { id: project.propertyId },
      select: { meta: true },
    }),
    loadProjectActivity(user.companyId, 200),
    // Per-phase committed + paid actual — the exact breakdown Budget & Costs
    // uses; feeds the per-phase EAC forecast below.
    computePhaseActualBreakdowns(project.id),
    // Pending change orders per phase — added on top of each phase's EAC so
    // Projected Final / Over-Under move before a CO is approved.
    computePendingChangeOrders(project.id),
    // Approved change-order total — already folded into Phase.budget, surfaced
    // separately in the Cost Breakdown so base vs. working budget is legible.
    prisma.changeOrder.aggregate({
      where: { projectId: project.id, status: ChangeOrderStatus.Approved },
      _sum: { amount: true },
    }),
    // Contracted = approved commitments (subcontracts / POs) — info line only,
    // never part of the invoice-driven Committed/Actual/Forecast numbers.
    prisma.commitment.aggregate({
      where: { projectId: project.id, status: CommitmentStatus.Approved },
      _sum: { amount: true },
    }),
    // Field-execution tiles: open issues/questions, open punch items, and the
    // date of the most recent daily log.
    prisma.issue.count({
      where: { projectId: project.id, status: { not: IssueStatus.Resolved } },
    }),
    prisma.punchItem.count({
      where: { projectId: project.id, status: PunchStatus.Open },
    }),
    prisma.dailyLog.findFirst({
      where: { projectId: project.id },
      orderBy: [{ logDate: "desc" }, { createdAt: "desc" }],
      select: { logDate: true },
    }),
  ]);

  // Current spend = Job-to-Date = sum of Paid invoices. Draws remain the
  // contractor payout ledger but are no longer the source of "Current spend".
  const totalSpent = Number(paidInvoiceAgg._sum.amount ?? 0);
  const totalCommitted = Number(allInvoiceAgg._sum.amount ?? 0);
  const laborSpend = Number(laborAgg._sum.amount ?? 0);
  const materialSpend = Number(materialAgg._sum.amount ?? 0);
  const outstandingAmount = Number(outstandingAgg._sum.amount ?? 0);
  const outstandingCount = outstandingAgg._count._all;

  // KPI computations
  const totalPhases = project.phases.length;
  const completedPhases = project.phases.filter((p) => p.status === PhaseStatus.Done).length;

  // Total working budget = sum of every phase budget (NOT the signed/approved
  // project budget). This is the denominator Budget & Costs and the pace signal
  // use, so every Overview health number shares it.
  const phaseBudgetTotal = project.phases.reduce((acc, p) => acc + Number(p.budget ?? 0), 0);
  // Remaining is measured against commitments (all invoices, any status),
  // matching the Budget & Costs tab: phase budgets minus Committed.
  const budgetRemaining = phaseBudgetTotal - totalCommitted;

  // Single-pass health numbers, all fed by the same calcs as Budget & Costs:
  //   - weightedComplete → budget-weighted average of each phase's effective
  //     %-complete (percentComplete, else checklist fallback via effectivePct).
  //   - projectedFinal → sum of every phase's EAC from computeForecast, using
  //     the per-phase committed + paid actual from computePhaseActualBreakdowns.
  // A phase with no explicit % and no checklist to infer from contributes 0.
  let weightedComplete = 0;
  let projectedFinal = 0;
  for (const p of project.phases) {
    const pBudget = Number(p.budget ?? 0);
    const breakdown = actualsMap.get(p.id);
    const done = p.checklistItems.filter((i) => i.status === "Done" || i.status === "NA").length;
    const total = p.checklistItems.length;
    weightedComplete += pBudget * (effectivePct(p.percentComplete, done, total).pct ?? 0);
    projectedFinal += computeForecast({
      budget: pBudget,
      committed: Number(breakdown?.committed ?? 0),
      actual: Number(breakdown?.total ?? 0),
      percentComplete: p.percentComplete,
      forecastMethod: p.forecastMethod,
      forecastManual: p.forecastManual == null ? null : Number(p.forecastManual),
      pendingCO: pendingCOs.byPhase.get(p.id) ?? 0,
      checklistDone: done,
      checklistTotal: total,
    }).eac;
  }
  const completePct = phaseBudgetTotal > 0 ? weightedComplete / phaseBudgetTotal : 0;
  const projectedOverUnder = phaseBudgetTotal - projectedFinal;

  // % of the working budget committed (Committed ÷ total phase budgets).
  const spentPct = phaseBudgetTotal > 0 ? (totalCommitted / phaseBudgetTotal) * 100 : 0;

  // Cost Breakdown aggregates (reuse existing calcs; no new forecast logic).
  //   workingBudget = phaseBudgetTotal — already includes approved COs, which
  //     fold into Phase.budget on approval.
  //   approvedCO / pendingCO — ChangeOrder sums by status.
  //   baseBudget = working − approved; projectedBudget = working + pending.
  //   labor/material budgets = sums of the per-phase split budgets.
  const workingBudget = phaseBudgetTotal;
  const approvedCO = Number(approvedCOAgg._sum.amount ?? 0);
  const pendingCO = pendingCOs.total;
  const baseBudget = workingBudget - approvedCO;
  const projectedBudget = workingBudget + pendingCO;
  const laborBudget = project.phases.reduce((acc, p) => acc + Number(p.laborBudget ?? 0), 0);
  const materialBudget = project.phases.reduce((acc, p) => acc + Number(p.materialsBudget ?? 0), 0);
  // Contingency reserve (labeled line, not folded into per-phase math) and the
  // contracted total from approved commitments.
  const contingency = Number(project.contingency ?? 0);
  const totalInclContingency = workingBudget + contingency;
  const contracted = Number(approvedCommitmentAgg._sum.amount ?? 0);
  // Over / Under against the working budget: negative = projected over budget
  // (shown red). projectedFinal is the sum of per-phase EAC computed above.
  const forecastEac = projectedFinal;
  const forecastOverUnder = projectedOverUnder;

  // Overview tiles share these exact numbers with the pace signal below.
  const rehabPct = Math.round(completePct);
  const budgetPct = Math.round(spentPct);

  const paceGap = spentPct - completePct;
  const pace =
    paceGap > 15
      ? { label: "Over pace", bg: "var(--red-bg)", fg: "var(--red-txt)" }
      : paceGap > 0
        ? { label: "Watch pace", bg: "var(--amber-bg)", fg: "var(--amber-txt)" }
        : { label: "On pace", bg: "var(--green-bg)", fg: "var(--green-txt)" };

  const targetEnd = project.endDate;
  const now = Date.now();
  const daysRemaining = targetEnd ? Math.ceil((targetEnd.getTime() - now) / DAY) : null;

  const actualEnd = meta.actualEndDate ? new Date(`${meta.actualEndDate}T00:00:00`) : null;
  const isComplete =
    project.status === ProjectStatus.Complete ||
    (totalPhases > 0 && completedPhases === totalPhases);
  let daysDelayed = 0;
  if (targetEnd) {
    if (actualEnd && !Number.isNaN(actualEnd.getTime())) {
      daysDelayed = Math.max(0, Math.ceil((actualEnd.getTime() - targetEnd.getTime()) / DAY));
    } else if (!isComplete && now > targetEnd.getTime()) {
      daysDelayed = Math.ceil((now - targetEnd.getTime()) / DAY);
    }
  }

  // Property info card values
  const propMeta =
    propertyRow?.meta && typeof propertyRow.meta === "object" && !Array.isArray(propertyRow.meta)
      ? (propertyRow.meta as { purchasePrice?: number })
      : {};
  const acquisitionCost =
    typeof propMeta.purchasePrice === "number" ? propMeta.purchasePrice : null;

  const addressLabel = [project.property.address, project.property.city, project.property.state]
    .filter(Boolean)
    .join(", ");

  const pm = project.assignments.find((a) => /\bpm\b|project\s*manager/i.test(a.role));
  const pmName = pm
    ? `${pm.user.firstName ?? ""} ${pm.user.lastName ?? ""}`.trim() || pm.user.email || "—"
    : "—";

  const gc =
    contractorAssignments.find((a) => /\bgc\b|general/i.test(a.role)) ?? contractorAssignments[0];
  const contractorName = gc?.contact?.name ?? "—";

  const statusClass =
    project.status === ProjectStatus.Complete
      ? "st-done"
      : project.status === ProjectStatus.Active
      ? "st-act"
      : "st-wait";
  const statusLabel = project.status === ProjectStatus.OnHold ? "On hold" : project.status;

  // Phase tracker rows (unchanged)
  const phaseRows = project.phases.map((p) => {
    const draw = p.draws[0];
    const drawLabel =
      draw && (draw.status === DrawStatus.Paid || draw.status === DrawStatus.Approved)
        ? `Draw #${draw.number} paid`
        : draw
        ? `Draw #${draw.number} ${
            draw.status === DrawStatus.Pending ? "pending" : draw.status.toLowerCase()
          }`
        : p.drawNote || "—";
    const incompleteChecklist =
      p.checklistItems.length > 0 &&
      p.checklistItems.some((i) => i.status !== "Done" && i.status !== "NA");
    return { p, drawLabel, incompleteChecklist };
  });

  const team = project.assignments;

  // Recent activity (project-scoped, last 6 entries)
  const recentActivity = allActivity
    .filter((e) => {
      const m = parseActivityMeta(e.meta);
      return !m.projectId || m.projectId === project.id;
    })
    .slice(0, 6);

  return (
    <div className="tab-panel active">
      <div className="ov-scroll">
        {/* ── Section 1: Property info ── */}
        <div className="ov-prop">
          <div className="ov-prop-col">
            <div className="ov-prop-row">
              <span className="ov-prop-l">Address</span>
              <span className="ov-prop-v">
                <Link href={`/property?id=${project.propertyId}`} style={{ color: "var(--blue)" }}>
                  {addressLabel || project.property.code}
                </Link>
              </span>
            </div>
            <div className="ov-prop-row">
              <span className="ov-prop-l">Project code</span>
              <span className="ov-prop-v">{code}</span>
            </div>
            <div className="ov-prop-row">
              <span className="ov-prop-l">Status</span>
              <span className="ov-prop-v">
                <span className={`st-badge ${statusClass}`}>{statusLabel}</span>
              </span>
            </div>
            <div className="ov-prop-row">
              <span className="ov-prop-l">Start date</span>
              <span className="ov-prop-v">{formatET(project.startDate, false)}</span>
            </div>
            <div className="ov-prop-row">
              <span className="ov-prop-l">Target completion</span>
              <span className="ov-prop-v">{formatET(project.endDate, false)}</span>
            </div>
            <div className="ov-prop-row">
              <span className="ov-prop-l">Actual completion</span>
              <span className="ov-prop-v">
                <ActualCompletionDate projectId={code} initial={meta.actualEndDate} />
              </span>
            </div>
          </div>
          <div className="ov-prop-col">
            <div className="ov-prop-row">
              <span className="ov-prop-l">Project manager</span>
              <span className="ov-prop-v">{pmName}</span>
            </div>
            <div className="ov-prop-row">
              <span className="ov-prop-l">Contractor</span>
              <span className="ov-prop-v">{contractorName}</span>
            </div>
            <div className="ov-prop-row">
              <span className="ov-prop-l">Acquisition cost</span>
              <span className="ov-prop-v">
                {acquisitionCost === null ? "—" : fmt$(acquisitionCost)}
              </span>
            </div>
            <div className="ov-prop-row">
              <span className="ov-prop-l">Rehab budget</span>
              <span className="ov-prop-v">{fmt$(budget)}</span>
            </div>
            <div className="ov-prop-row">
              <span className="ov-prop-l">Current spend</span>
              <span className="ov-prop-v">{fmt$(totalSpent)}</span>
            </div>
            <div className="ov-prop-row">
              <span className="ov-prop-l">Budget remaining</span>
              <span
                className="ov-prop-v"
                style={{ color: budgetRemaining < 0 ? "var(--danger)" : "inherit" }}
              >
                {fmt$(budgetRemaining)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Section 2: KPI grid ── */}
        <OverviewKpis
          code={code}
          rehabPct={rehabPct}
          budgetPct={budgetPct}
          committed={totalCommitted}
          workingBudget={phaseBudgetTotal}
          projectedFinal={projectedFinal}
          projectedOverUnder={projectedOverUnder}
          daysRemaining={daysRemaining}
          daysDelayed={daysDelayed}
          laborSpend={laborSpend}
          materialSpend={materialSpend}
          outstandingCount={outstandingCount}
          outstandingAmount={outstandingAmount}
          pendingChangeOrders={pendingChangeOrders}
          openIssues={openIssueCount}
          openPunchItems={openPunchCount}
          latestDailyLog={latestDailyLog ? latestDailyLog.logDate.toISOString().slice(0, 10) : null}
        />

        {/* ── Pace signal: budget spent vs work complete ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
            margin: "10px 0 4px",
            padding: "10px 14px",
            border: "0.5px solid var(--border-lo)",
            borderRadius: 8,
            background: "var(--bg-secondary)",
          }}
        >
          <span
            style={{
              padding: "2px 9px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              background: pace.bg,
              color: pace.fg,
            }}
          >
            {pace.label}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>{Math.round(spentPct)}%</strong> of budget
            committed
          </span>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>{Math.round(completePct)}%</strong> work
            complete
          </span>
        </div>

        {/* ── Cost Breakdown ── */}
        <div className="sec-hd">Cost breakdown</div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            margin: "4px 0 8px",
            padding: "12px 14px",
            border: "0.5px solid var(--border-lo)",
            borderRadius: 8,
            background: "var(--bg-secondary)",
          }}
        >
          <BreakdownRow label="Base budget" value={fmt$(baseBudget)} />
          <BreakdownRow label="+ Change orders (approved)" value={fmt$(approvedCO)} />
          <BreakdownRow label="= Working budget" value={fmt$(workingBudget)} total />
          <BreakdownRow
            label="+ Change orders (pending)"
            value={fmt$(pendingCO)}
            muted={pendingCO === 0}
          />
          <BreakdownRow label="= Projected budget" value={fmt$(projectedBudget)} total />
          <BreakdownRow
            label="Contingency reserve"
            value={fmt$(contingency)}
            muted={contingency === 0}
          />
          <BreakdownRow
            label="Total budget incl. contingency"
            value={fmt$(totalInclContingency)}
            total
          />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              marginTop: 6,
              paddingTop: 8,
              borderTop: "0.5px solid var(--border-lo)",
              fontSize: 12,
              color: "var(--text-secondary)",
            }}
          >
            <div>
              <strong style={{ color: "var(--text-primary)" }}>Labor</strong> — budget{" "}
              {fmt$(laborBudget)} · spent {fmt$(laborSpend)}
            </div>
            <div>
              <strong style={{ color: "var(--text-primary)" }}>Materials</strong> — budget{" "}
              {fmt$(materialBudget)} · spent {fmt$(materialSpend)}
            </div>
            <div>
              Contracted (approved commitments) {fmt$(contracted)}
            </div>
            <div>
              Committed {fmt$(totalCommitted)} · Actual (paid) {fmt$(totalSpent)}
            </div>
            <div>
              Forecast (EAC) {fmt$(forecastEac)} · Over / Under{" "}
              <span
                style={{
                  fontWeight: 600,
                  color: forecastOverUnder < 0 ? "var(--danger)" : "var(--green-txt)",
                }}
              >
                {forecastOverUnder < 0
                  ? `-${fmt$(Math.abs(forecastOverUnder))}`
                  : `+${fmt$(forecastOverUnder)}`}
              </span>
            </div>
          </div>
        </div>

        {/* ── Section 3: Phase tracker ── */}
        <div className="sec-hd">
          Job Type tracker
          <Link
            href={`/rehab/${code}/schedule`}
            style={{
              float: "right",
              fontWeight: 400,
              textTransform: "none",
              letterSpacing: 0,
              color: "var(--blue)",
              fontSize: 10,
            }}
          >
            View full schedule →
          </Link>
        </div>
        <div className="phase-tbl">
          {phaseRows.map(({ p, drawLabel, incompleteChecklist }) => (
            <Link
              key={p.id}
              href={`/rehab/${code}/checklist?phase=${p.number}`}
              className={`ph-row ph-row-6 ${p.status === PhaseStatus.InProgress ? "cur" : ""}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div>
                <div className="ph-name">{p.name}</div>
                <div className="ph-date">
                  Job Type {p.number} · {formatET(p.startDate, false)} – {formatET(p.endDate, false)}
                  {p.status === PhaseStatus.InProgress ? " — In progress" : ""}
                </div>
              </div>
              <PhaseStatusSelect
                phaseId={p.id}
                projectId={code}
                currentStatus={p.status}
                incompleteChecklist={incompleteChecklist}
              />
              <div className="ph-amt">{fmt$(Number(p.budget ?? 0))}</div>
              <div className="ph-draw">{drawLabel}</div>
            </Link>
          ))}
        </div>

        {/* ── Section 4: Recent activity + Project team ── */}
        <div className="ov-cols">
          <div className="ov-cols-main">
            <div className="sec-hd">
              Recent activity
              <Link
                href={`/rehab/${code}/activity`}
                style={{
                  float: "right",
                  fontWeight: 400,
                  textTransform: "none",
                  letterSpacing: 0,
                  color: "var(--blue)",
                  fontSize: 10,
                }}
              >
                View all →
              </Link>
            </div>
            {recentActivity.length === 0 && (
              <div style={{ padding: "8px 14px", fontSize: 10, color: "var(--text-tertiary)" }}>
                No activity yet.
              </div>
            )}
            {recentActivity.map((e) => {
              const m = parseActivityMeta(e.meta);
              const who = e.actor
                ? `${e.actor.firstName ?? ""} ${e.actor.lastName ?? ""}`.trim() ||
                  e.actor.email ||
                  "User"
                : "System";
              const isChangeOrder =
                e.action === "changeOrder.requested" || m.type === "changeOrder";
              const dotColor = isChangeOrder
                ? "#2A6CD0"
                : m.type === "payment"
                ? "var(--amber)"
                : m.type === "flag"
                ? "var(--red-txt)"
                : m.type === "document"
                ? "#993856"
                : m.type === "task"
                ? "var(--purple-txt)"
                : m.type === "note"
                ? "var(--green)"
                : "var(--blue)";
              const sowHref =
                isChangeOrder && m.phaseNumber
                  ? `/rehab/${code}/sow?phase=${m.phaseNumber}#sow-phase-${m.phaseNumber}`
                  : null;
              return (
                <div className="oi-item" key={e.id}>
                  <div className="oi-dot" style={{ background: dotColor }}></div>
                  <div className="oi-body">
                    <div className="oi-text">{e.message ?? ""}</div>
                    <div className="oi-tag">
                      {isChangeOrder && (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "1px 5px",
                            marginRight: 6,
                            borderRadius: 3,
                            background: "#E8F0FB",
                            color: "#1F4FA8",
                            fontWeight: 500,
                          }}
                        >
                          Change order
                        </span>
                      )}
                      {who} · {formatET(e.createdAt)}
                      {sowHref && (
                        <>
                          {" · "}
                          <Link href={sowHref} style={{ color: "var(--blue)" }}>
                            {m.phaseNumber ? `View Job Type ${m.phaseNumber} in SOW →` : "View in SOW →"}
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ov-cols-side">
            <div className="sb-sec">
              <div className="sb-hd">Project team</div>
              {team.map((a) => {
                const u = a.user;
                const initials =
                  u.initials ||
                  [(u.firstName || "")[0], (u.lastName || "")[0]]
                    .filter(Boolean)
                    .join("")
                    .toUpperCase() ||
                  "??";
                const avClass = ["av av-b", "av av-t", "av av-a", "av av-c", "av av-p"][
                  a.role.length % 5
                ];
                return (
                  <div key={a.id} className="team-row">
                    <div className={avClass}>{initials}</div>
                    <div>
                      <div className="tm-name">
                        {u.firstName} {u.lastName}
                      </div>
                      <div className="tm-role">{a.role}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
