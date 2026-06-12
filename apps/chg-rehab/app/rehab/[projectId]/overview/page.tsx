import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadProjectActivity, loadProjectByCode } from "@/lib/rehab/queries";
import { formatET } from "@/lib/datetime";
import { parseActivityMeta, parseProjectMeta } from "@/lib/rehab/types";
import OverviewKpis from "@/components/rehab/OverviewKpis";
import ActualCompletionDate from "@/components/rehab/ActualCompletionDate";
import PhaseStatusSelect from "@/components/rehab/PhaseStatusSelect";
import { prisma } from "@/lib/prisma";
import {
  PhaseStatus,
  DrawStatus,
  ChangeOrderStatus,
  InvoiceClassification,
  InvoiceStatus,
  ProjectStatus,
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

  // Current spend = paid (released) draws.
  const paidDraws = project.draws.filter(
    (d) => d.status === DrawStatus.Paid || d.status === DrawStatus.Approved
  );
  const totalSpent = paidDraws.reduce((acc, d) => acc + Number(d.amount), 0);

  // Parallel aggregates: invoice spend/outstanding, pending change orders,
  // contractor assignments, property meta (acquisition cost), activity feed.
  const [
    laborAgg,
    materialAgg,
    outstandingAgg,
    pendingChangeOrders,
    contractorAssignments,
    propertyRow,
    allActivity,
  ] = await Promise.all([
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
  ]);

  const laborSpend = Number(laborAgg._sum.amount ?? 0);
  const materialSpend = Number(materialAgg._sum.amount ?? 0);
  const outstandingAmount = Number(outstandingAgg._sum.amount ?? 0);
  const outstandingCount = outstandingAgg._count._all;

  // KPI computations
  const totalPhases = project.phases.length;
  const completedPhases = project.phases.filter((p) => p.status === PhaseStatus.Done).length;
  const rehabPct = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0;
  const budgetPct = budget > 0 ? Math.round((totalSpent / budget) * 100) : 0;
  const budgetRemaining = budget - totalSpent;

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
          budget={budget}
          budgetPct={budgetPct}
          totalSpent={totalSpent}
          daysRemaining={daysRemaining}
          daysDelayed={daysDelayed}
          laborSpend={laborSpend}
          materialSpend={materialSpend}
          outstandingCount={outstandingCount}
          outstandingAmount={outstandingAmount}
          pendingChangeOrders={pendingChangeOrders}
        />

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
