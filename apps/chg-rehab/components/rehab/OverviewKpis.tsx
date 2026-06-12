import Link from "next/link";

const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

type Props = {
  code: string;
  rehabPct: number;
  budget: number;
  budgetPct: number;
  totalSpent: number;
  daysRemaining: number | null;
  daysDelayed: number;
  laborSpend: number;
  materialSpend: number;
  outstandingCount: number;
  outstandingAmount: number;
  pendingChangeOrders: number;
};

/**
 * Eight read-only KPI tiles for the Rehab Overview tab, in a responsive grid
 * (4 across on desktop, 2 on mobile — see `.ov-kpis` in globals.css). The only
 * interactive tile is "Pending change orders", which links to that tab.
 */
export default function OverviewKpis(p: Props) {
  const budgetColor =
    p.budgetPct > 100 ? "var(--danger)" : p.budgetPct >= 80 ? "var(--amber)" : "var(--green)";
  const remainingColor =
    p.daysRemaining !== null && p.daysRemaining < 0 ? "var(--danger)" : "inherit";
  const delayedColor = p.daysDelayed > 0 ? "var(--danger)" : "inherit";

  return (
    <div className="ov-kpis">
      <div className="ov-kpi">
        <div className="kpi-label">Rehab % complete</div>
        <div className="kpi-val">{p.rehabPct}%</div>
        <div className="ov-bar">
          <div
            className="ov-bar-fill"
            style={{
              width: `${Math.min(100, Math.max(0, p.rehabPct))}%`,
              background: "var(--green)",
            }}
          />
        </div>
      </div>

      <div className="ov-kpi">
        <div className="kpi-label">Budget % used</div>
        <div className="kpi-val" style={{ color: budgetColor }}>
          {p.budgetPct}%
        </div>
        <div className="kpi-sub">
          {fmt$(p.totalSpent)} of {fmt$(p.budget)}
        </div>
      </div>

      <div className="ov-kpi">
        <div className="kpi-label">Days remaining</div>
        <div className="kpi-val" style={{ color: remainingColor }}>
          {p.daysRemaining === null ? "—" : p.daysRemaining}
        </div>
        <div className="kpi-sub">
          {p.daysRemaining === null
            ? "No target date"
            : p.daysRemaining < 0
            ? "Past target"
            : "Until target"}
        </div>
      </div>

      <div className="ov-kpi">
        <div className="kpi-label">Days delayed</div>
        <div className="kpi-val" style={{ color: delayedColor }}>
          {p.daysDelayed}
        </div>
        <div className="kpi-sub">{p.daysDelayed > 0 ? "Behind target" : "On schedule"}</div>
      </div>

      <div className="ov-kpi">
        <div className="kpi-label">Labor spend</div>
        <div className="kpi-val">{fmt$(p.laborSpend)}</div>
        <div className="kpi-sub">Invoiced labor · paid</div>
      </div>

      <div className="ov-kpi">
        <div className="kpi-label">Material spend</div>
        <div className="kpi-val">{fmt$(p.materialSpend)}</div>
        <div className="kpi-sub">Invoiced materials · paid</div>
      </div>

      <div className="ov-kpi">
        <div className="kpi-label">Outstanding invoices</div>
        <div className="kpi-val">{p.outstandingCount}</div>
        <div className="kpi-sub">{fmt$(p.outstandingAmount)} unpaid / pending</div>
      </div>

      <Link href={`/rehab/${p.code}/change-orders`} className="ov-kpi link">
        <div className="kpi-label">Pending change orders</div>
        <div
          className="kpi-val"
          style={{ color: p.pendingChangeOrders > 0 ? "var(--amber)" : "inherit" }}
        >
          {p.pendingChangeOrders}
        </div>
        <div className="kpi-sub">
          {p.pendingChangeOrders === 0 ? "None awaiting review" : "Review →"}
        </div>
      </Link>
    </div>
  );
}
