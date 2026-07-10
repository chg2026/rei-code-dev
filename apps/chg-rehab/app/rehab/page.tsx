import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import AddProjectButton from "@/components/rehab/AddProjectButton";
import RehabSearchInput from "@/components/rehab/RehabSearchInput";
import { computePhaseActualBreakdowns } from "@/lib/rehab/invoiceActuals";
import { computePendingChangeOrders } from "@/lib/rehab/changeOrders";
import { computeProjectForecastTotals } from "@/lib/rehab/projectForecast";
import { computeReturns } from "@/lib/rehab/returns";
import { InvoiceStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Planning:    { bg: "#F1F5F9", color: "#475569" },
  Active:      { bg: "#E8EFF1", color: "#143641" },
  OnHold:      { bg: "#FEF9EC", color: "#92400E" },
  Complete:    { bg: "#EAF3DE", color: "#27500A" },
};

function fmtMoney(n: number | null | undefined) {
  if (!n) return null;
  return `$${Math.round(n).toLocaleString()}`;
}

export default async function RehabIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "rehab", "view"))) {
    return <div style={{ padding: 20 }}>You do not have access to the Rehab Manager.</div>;
  }

  const sp = await searchParams;
  const q = (sp.q || "").trim().toLowerCase();

  const allProjects = await prisma.project.findMany({
    where: { companyId: user.companyId },
    include: {
      property: { select: { address: true, city: true, state: true, code: true, meta: true } },
      phases: {
        select: {
          id: true,
          status: true,
          budget: true,
          percentComplete: true,
          forecastMethod: true,
          forecastManual: true,
          checklistItems: { select: { status: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Portfolio finance rollup — same building blocks as the per-project pages:
  // committed/actual from invoices, Projected Final from the shared
  // project-forecast helper, returns math from the shared returns helper.
  const [committedAgg, paidAgg, forecastEntries] = await Promise.all([
    prisma.invoice.groupBy({
      by: ["projectId"],
      where: { project: { companyId: user.companyId } },
      _sum: { amount: true },
    }),
    prisma.invoice.groupBy({
      by: ["projectId"],
      where: { project: { companyId: user.companyId }, status: InvoiceStatus.Paid },
      _sum: { amount: true },
    }),
    Promise.all(
      allProjects.map(async (p) => {
        const [actuals, pendingCOs] = await Promise.all([
          computePhaseActualBreakdowns(p.id),
          computePendingChangeOrders(p.id),
        ]);
        return [p.id, computeProjectForecastTotals(p.phases, actuals, pendingCOs)] as const;
      })
    ),
  ]);
  const committedByProject = new Map(committedAgg.map((g) => [g.projectId, Number(g._sum.amount ?? 0)]));
  const paidByProject = new Map(paidAgg.map((g) => [g.projectId, Number(g._sum.amount ?? 0)]));
  const forecastByProject = new Map(forecastEntries);

  const portfolioRows = allProjects.map((p) => {
    const totals = forecastByProject.get(p.id) ?? { workingBudget: 0, projectedFinal: 0, overUnder: 0 };
    const propMeta =
      p.property.meta && typeof p.property.meta === "object" && !Array.isArray(p.property.meta)
        ? (p.property.meta as { purchasePrice?: number })
        : {};
    const acquisition =
      p.acquisitionCost != null
        ? Number(p.acquisitionCost)
        : typeof propMeta.purchasePrice === "number"
          ? propMeta.purchasePrice
          : null;
    const arv = p.arv == null ? null : Number(p.arv);
    const returns = computeReturns({
      arv,
      acquisitionCost: acquisition,
      projectedRehab: totals.projectedFinal,
      refiLtvPct: p.refiLtvPct == null ? null : Number(p.refiLtvPct),
      refiRatePct: p.refiRatePct == null ? null : Number(p.refiRatePct),
      refiTermYears: p.refiTermYears,
      monthlyRent: p.monthlyRent == null ? null : Number(p.monthlyRent),
      monthlyExpenses: p.monthlyExpenses == null ? null : Number(p.monthlyExpenses),
    });
    return {
      project: p,
      workingBudget: totals.workingBudget,
      projectedFinal: totals.projectedFinal,
      overUnder: totals.overUnder,
      committed: committedByProject.get(p.id) ?? 0,
      actual: paidByProject.get(p.id) ?? 0,
      allIn: returns.allIn,
      dscr: returns.dscr,
      arv,
    };
  });

  const port = portfolioRows.reduce(
    (acc, r) => {
      acc.allIn += r.allIn;
      acc.workingBudget += r.workingBudget;
      acc.committed += r.committed;
      acc.actual += r.actual;
      acc.projectedFinal += r.projectedFinal;
      acc.overUnder += r.overUnder;
      if (r.arv != null) {
        acc.arv += r.arv;
        acc.hasArv = true;
      }
      return acc;
    },
    { allIn: 0, workingBudget: 0, committed: 0, actual: 0, projectedFinal: 0, overUnder: 0, arv: 0, hasArv: false }
  );
  const portfolioEquity = port.hasArv ? port.arv - port.allIn : null;

  const filtered = allProjects.filter((p) => {
    if (!q) return true;
    const hay = `${p.code} ${p.name} ${p.property.address} ${p.property.city ?? ""} ${p.property.code}`.toLowerCase();
    return hay.includes(q);
  });

  const visible = filtered.slice(0, PAGE_SIZE);

  const activeProjects = allProjects.filter(p => p.status === "Active");
  const planningProjects = allProjects.filter(p => p.status === "Planning");
  const onHoldProjects = allProjects.filter(p => p.status === "OnHold");
  const completeProjects = allProjects.filter(p => p.status === "Complete");
  const totalBudget = allProjects.reduce((sum, p) => sum + (p.budget ? Number(p.budget) : 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="proj-bar">
        <div className="proj-l">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="5" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="0.9" />
            <path d="M4 13V9h6v4" stroke="currentColor" strokeWidth="0.9" />
            <path d="M0.5 6L7 1.5 13.5 6" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
          </svg>
          <span className="proj-addr">Rehab Manager</span>
          <AddProjectButton />
          <Link href="/rehab/templates" className="btn-sm" style={{ textDecoration: "none", marginLeft: 4 }}>
            SOW Templates
          </Link>
          <Link href="/rehab/estimator" className="btn-sm" style={{ textDecoration: "none", marginLeft: 4 }}>
            Estimator
          </Link>
        </div>
        <div className="proj-r">
          <span className="proj-ts">{allProjects.length} project{allProjects.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* LEFT: project list */}
        <div style={{
          width: 240, flexShrink: 0,
          borderRight: "0.5px solid var(--border-lo)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          background: "var(--bg-secondary)",
        }}>
          <div style={{ padding: "8px 10px", borderBottom: "0.5px solid var(--border-lo)", flexShrink: 0 }}>
            <RehabSearchInput initialValue={sp.q || ""} />
          </div>

          <div style={{
            padding: "4px 10px", fontSize: 9, color: "var(--text-tertiary)",
            borderBottom: "0.5px solid var(--border-lo)", flexShrink: 0,
          }}>
            {q
              ? `${visible.length} of ${filtered.length} matching · ${allProjects.length} total`
              : `${allProjects.length} project${allProjects.length !== 1 ? "s" : ""}`}
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {visible.map((proj) => {
              const col = STATUS_COLORS[proj.status] ?? STATUS_COLORS.Planning;
              const phaseDone = proj.phases.filter((p) => p.status === "Done").length;
              const phaseTotal = proj.phases.length;
              const budget = fmtMoney(proj.budget ? Number(proj.budget) : null);
              return (
                <Link
                  key={proj.id}
                  href={`/rehab/${encodeURIComponent(proj.code)}/overview`}
                  style={{
                    display: "flex", flexDirection: "column", gap: 3,
                    padding: "9px 10px",
                    borderBottom: "0.5px solid var(--border-lo)",
                    textDecoration: "none", color: "inherit",
                    cursor: "pointer",
                  }}
                  className="ln-item"
                >
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>
                    {proj.property.address.split(",")[0]}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                    {[proj.property.city, proj.property.code].filter(Boolean).join(" · ")}
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 500,
                      background: col.bg, color: col.color,
                    }}>
                      {proj.status === "Active" ? "In Progress" : proj.status}
                    </span>
                    {phaseTotal > 0 && (
                      <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                        {phaseDone}/{phaseTotal} phases
                      </span>
                    )}
                    {budget && (
                      <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{budget}</span>
                    )}
                  </div>
                </Link>
              );
            })}

            {filtered.length > PAGE_SIZE && (
              <div style={{ padding: 10, textAlign: "center", fontSize: 10, color: "var(--text-tertiary)", borderTop: "0.5px solid var(--border-lo)" }}>
                {filtered.length - PAGE_SIZE} more — refine your search
              </div>
            )}

            {filtered.length === 0 && q && (
              <div style={{ padding: 20, textAlign: "center", fontSize: 11, color: "var(--text-tertiary)" }}>
                No projects match &ldquo;{q}&rdquo;
              </div>
            )}

            {allProjects.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
                No projects yet. Use the button above to create one.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: company-wide dashboard */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20, background: "#F5F4F0", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
            {[
              { val: activeProjects.length, label: "Active", color: "#1F4D5C", bg: "#E8EFF1" },
              { val: planningProjects.length, label: "Planning", color: "#92400E", bg: "#FEF9EC" },
              { val: onHoldProjects.length, label: "On hold", color: "#6B7280", bg: "#F3F4F6" },
              { val: completeProjects.length, label: "Complete", color: "#27500A", bg: "#EAF3DE" },
              { val: totalBudget > 0 ? `$${Math.round(totalBudget / 1000)}k` : "—", label: "Total budget", color: "#0A0A0A", bg: "#fff" },
            ].map(({ val, label, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 8, padding: "14px 16px", border: "0.5px solid rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: "-0.02em" }}>{val}</div>
                <div style={{ fontSize: 11, color: "#6B6862", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Portfolio finance KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            {[
              { val: fmtMoney(port.allIn) ?? "—", label: "Total all-in cost", color: "#0A0A0A" },
              { val: fmtMoney(port.workingBudget) ?? "—", label: "Working budget", color: "#0A0A0A" },
              { val: fmtMoney(port.committed) ?? "—", label: "Committed", color: "#0A0A0A" },
              { val: fmtMoney(port.actual) ?? "—", label: "Actual (paid)", color: "#27500A" },
              { val: fmtMoney(port.projectedFinal) ?? "—", label: "Projected final", color: "#0A0A0A" },
              {
                val:
                  port.overUnder === 0
                    ? "$0"
                    : `${port.overUnder < 0 ? "-" : "+"}$${Math.round(Math.abs(port.overUnder)).toLocaleString()}`,
                label: "Projected over/under",
                color: port.overUnder < 0 ? "#9F1D1D" : "#27500A",
              },
              {
                val:
                  portfolioEquity == null
                    ? "—"
                    : `${portfolioEquity < 0 ? "-" : ""}$${Math.round(Math.abs(portfolioEquity)).toLocaleString()}`,
                label: "Portfolio equity (ARV − all-in)",
                color: portfolioEquity != null && portfolioEquity < 0 ? "#9F1D1D" : "#1F4D5C",
              },
            ].map(({ val, label, color }) => (
              <div key={label} style={{ background: "#fff", borderRadius: 8, padding: "14px 16px", border: "0.5px solid rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: "-0.02em" }}>{val}</div>
                <div style={{ fontSize: 11, color: "#6B6862", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Per-project portfolio summary */}
          {portfolioRows.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 8, border: "0.5px solid rgba(0,0,0,0.06)", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #F5F4F0", fontSize: 12, fontWeight: 600, color: "#0A0A0A" }}>
                Portfolio summary
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) repeat(5, minmax(72px, 1fr))", gap: 8, padding: "6px 16px", borderBottom: "0.5px solid #F5F4F0", fontSize: 9, color: "#A8A49C", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                <span>Project</span>
                <span style={{ textAlign: "right" }}>Budget</span>
                <span style={{ textAlign: "right" }}>Actual</span>
                <span style={{ textAlign: "right" }}>Forecast</span>
                <span style={{ textAlign: "right" }}>Over/Under</span>
                <span style={{ textAlign: "right" }}>DSCR</span>
              </div>
              {portfolioRows.map((r) => {
                const band =
                  r.dscr == null ? null : r.dscr >= 1.25 ? "#27500A" : r.dscr >= 1.0 ? "#92400E" : "#9F1D1D";
                return (
                  <Link
                    key={r.project.id}
                    href={`/rehab/${encodeURIComponent(r.project.code)}/returns`}
                    style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) repeat(5, minmax(72px, 1fr))", gap: 8, padding: "9px 16px", borderBottom: "0.5px solid #F5F4F0", textDecoration: "none", color: "inherit", alignItems: "center" }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.project.property.address.split(",")[0]}
                      </div>
                      <div style={{ fontSize: 9, color: "#A8A49C" }}>{r.project.code}</div>
                    </div>
                    <div style={{ fontSize: 11, textAlign: "right" }}>{fmtMoney(r.workingBudget) ?? "—"}</div>
                    <div style={{ fontSize: 11, textAlign: "right" }}>{fmtMoney(r.actual) ?? "—"}</div>
                    <div style={{ fontSize: 11, textAlign: "right" }}>{fmtMoney(r.projectedFinal) ?? "—"}</div>
                    <div style={{ fontSize: 11, textAlign: "right", fontWeight: 500, color: r.overUnder < 0 ? "#9F1D1D" : "#27500A" }}>
                      {r.overUnder === 0
                        ? "$0"
                        : `${r.overUnder < 0 ? "-" : "+"}$${Math.round(Math.abs(r.overUnder)).toLocaleString()}`}
                    </div>
                    <div style={{ fontSize: 11, textAlign: "right", fontWeight: 500, color: band ?? "#A8A49C" }}>
                      {r.dscr != null ? r.dscr.toFixed(2) : "—"}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Active projects */}
          {activeProjects.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 8, border: "0.5px solid rgba(0,0,0,0.06)", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #F5F4F0", fontSize: 12, fontWeight: 600, color: "#0A0A0A" }}>
                Active Rehabs ({activeProjects.length})
              </div>
              {activeProjects.map(p => {
                const done = p.phases.filter(ph => ph.status === "Done").length;
                const total = p.phases.length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                return (
                  <Link key={p.id} href={`/rehab/${encodeURIComponent(p.code)}/overview`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "0.5px solid #F5F4F0", textDecoration: "none", color: "inherit" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.property.address.split(",")[0]}</div>
                      <div style={{ fontSize: 10, color: "#A8A49C", marginTop: 2 }}>{p.code} · {p.property.city ?? ""}</div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#1F4D5C", fontWeight: 500 }}>{pct}%</div>
                      <div style={{ width: 60, height: 4, background: "#E8EFF1", borderRadius: 2, marginTop: 3 }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "#1F4D5C", borderRadius: 2 }} />
                      </div>
                    </div>
                    {p.budget && <div style={{ flexShrink: 0, fontSize: 11, color: "#6B6862" }}>${Math.round(Number(p.budget) / 1000)}k</div>}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Planning + On Hold */}
          {(planningProjects.length > 0 || onHoldProjects.length > 0) && (
            <div style={{ background: "#fff", borderRadius: 8, border: "0.5px solid rgba(0,0,0,0.06)", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #F5F4F0", fontSize: 12, fontWeight: 600 }}>
                Planning & On Hold
              </div>
              {[...planningProjects, ...onHoldProjects].map(p => (
                <Link key={p.id} href={`/rehab/${encodeURIComponent(p.code)}/overview`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "0.5px solid #F5F4F0", textDecoration: "none", color: "inherit" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{p.property.address.split(",")[0]}</div>
                    <div style={{ fontSize: 10, color: "#A8A49C" }}>{p.code}</div>
                  </div>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: p.status === "OnHold" ? "#F3F4F6" : "#FEF9EC", color: p.status === "OnHold" ? "#6B7280" : "#92400E", fontWeight: 500 }}>
                    {p.status === "OnHold" ? "On hold" : "Planning"}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {allProjects.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#A8A49C", fontSize: 12 }}>
              No projects yet. Create one using the button above.
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
