"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/pipeline";
import AddDealButton from "@/app/pipeline/AddDealButton";

export type PipelineDealRow = {
  id: string;
  code: string;
  address: string;
  stage: string;
  askingPrice: string | null;
  estimatedRoi: string | null;
  closedAt: Date | string | null;
  createdAt: Date | string;
  meta: Record<string, unknown> | null;
};

const STAGES = {
  Sourced:       "Sourced",
  Underwriting:  "Underwriting",
  OfferOut:      "OfferOut",
  UnderContract: "UnderContract",
  Closed:        "Closed",
  Lost:          "Lost",
} as const;

type Stage5 = "Identified" | "Offer Submitted" | "Under Contract" | "Due Diligence" | "Closed/Acquired";

const WIREFRAME_COLS: { label: Stage5; stages: string[] }[] = [
  { label: "Identified",      stages: [STAGES.Sourced, STAGES.Underwriting] },
  { label: "Offer Submitted", stages: [STAGES.OfferOut] },
  { label: "Under Contract",  stages: [STAGES.UnderContract] },
  { label: "Due Diligence",   stages: [] },
  { label: "Closed/Acquired", stages: [STAGES.Closed] },
];

function getDealStageLabel(stage: string): Stage5 {
  switch (stage) {
    case STAGES.Sourced:
    case STAGES.Underwriting:  return "Identified";
    case STAGES.OfferOut:      return "Offer Submitted";
    case STAGES.UnderContract: return "Under Contract";
    case STAGES.Closed:        return "Closed/Acquired";
    default:                   return "Identified";
  }
}

function getDealPrice(deal: PipelineDealRow): number | null {
  const m = deal.meta || {};
  if (deal.stage === STAGES.OfferOut) return (m.offer as number) ?? (deal.askingPrice ? Number(deal.askingPrice) : null);
  if (deal.stage === STAGES.UnderContract || deal.stage === STAGES.Closed) return (m.purchase as number) ?? (deal.askingPrice ? Number(deal.askingPrice) : null);
  return deal.askingPrice ? Number(deal.askingPrice) : null;
}

function getDealMetric(deal: PipelineDealRow): string {
  const m = deal.meta || {};
  const strategy = m.strategy as string | undefined;
  if (deal.stage === STAGES.Closed) {
    return m.arv ? `✓ ARV ${formatMoney(m.arv as number, { compact: true })}` : `✓ ROI ${Number(deal.estimatedRoi || 0)}%`;
  }
  if (strategy === "brrrr" && m.arv) {
    const cf = m.monthlyFlow as number | undefined;
    return cf != null ? `Proj. CF ${cf >= 0 ? "+" : ""}${formatMoney(cf, { compact: true })}/mo` : `ARV ${formatMoney(m.arv as number, { compact: true })}`;
  }
  if (m.arv && m.rehab) {
    const price = getDealPrice(deal) ?? 0;
    const profit = (m.arv as number) - price - (m.rehab as number);
    return profit > 0 ? `Est. profit ${formatMoney(profit, { compact: true })}` : `ARV ${formatMoney(m.arv as number, { compact: true })}`;
  }
  if (deal.stage === STAGES.OfferOut) {
    const offer = (m.offer as number) ?? (deal.askingPrice ? Number(deal.askingPrice) : null);
    return offer ? `Offer: ${formatMoney(offer, { compact: true })}` : "—";
  }
  if (deal.stage === STAGES.UnderContract && m.closingDate) {
    const d = new Date(m.closingDate as string);
    return `Close: ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  return `ROI ${Number(deal.estimatedRoi || 0)}%`;
}

function getDealType(deal: PipelineDealRow): "sfr" | "mf" | null {
  const t = ((deal.meta?.type as string) || "").toLowerCase();
  if (t.includes("multi") || t === "mf") return "mf";
  if (t.includes("sfr") || t.includes("single")) return "sfr";
  return null;
}

function getDealDays(deal: PipelineDealRow): number {
  const m = deal.meta || {};
  return (m.daysInStage as number) ?? Math.max(0, Math.round((Date.now() - new Date(deal.createdAt).getTime()) / 86_400_000));
}

function getAssigneeName(deal: PipelineDealRow): string {
  return (deal.meta?.assignee as string) || "—";
}

function isOverdue(deal: PipelineDealRow): boolean {
  return (deal.meta?.overdue as boolean) === true || getDealDays(deal) > 14;
}

// ── Badge components ──────────────────────────────────────────────────
function TypeBadge({ type }: { type: "sfr" | "mf" | null }) {
  if (!type) return null;
  const isMf = type === "mf";
  return (
    <span className={`pipeline-badge pipeline-badge--${isMf ? "mf" : "sfr"}`}>
      {isMf ? "MF" : "SFR"}
    </span>
  );
}

function StrategyBadge({ deal }: { deal: PipelineDealRow }) {
  const s = ((deal.meta?.strategy as string) || "").toLowerCase();
  if (!s) return null;
  const isBrrrr = s === "brrrr";
  return (
    <span className={`pipeline-badge pipeline-badge--${isBrrrr ? "brrrr" : "flip"}`}>
      {isBrrrr ? "BRRRR" : "Flip"}
    </span>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <div className="pipeline-avatar">
      {initials}
    </div>
  );
}

// ── Deal Card ─────────────────────────────────────────────────────────
function DealCard({ deal }: { deal: PipelineDealRow }) {
  const type = getDealType(deal);
  const price = getDealPrice(deal);
  const metric = getDealMetric(deal);
  const days = getDealDays(deal);
  const assignee = getAssigneeName(deal);
  const overdue = isOverdue(deal) && deal.stage !== STAGES.Closed;
  const isClosed = deal.stage === STAGES.Closed;
  const initials = assignee === "—" ? "??" : assignee.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className={`pipeline-deal-card${overdue ? " pipeline-deal-card--overdue" : ""}${isClosed ? " pipeline-deal-card--closed" : ""}`}>
      <div className="pipeline-deal-address">
        {overdue ? `⚠ ${deal.address}` : deal.address}
      </div>
      <div className="pipeline-deal-badges">
        <TypeBadge type={type} />
        <StrategyBadge deal={deal} />
      </div>
      <div className="pipeline-deal-price">{formatMoney(price)}</div>
      <div className="pipeline-deal-metric">{metric}</div>
      <div className="pipeline-deal-footer">
        <Avatar initials={initials} />
        <span className="pipeline-deal-days">
          {isClosed && deal.closedAt
            ? new Date(deal.closedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : `Day ${days}`}
        </span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────
export default function PipelineView({ deals }: { deals: PipelineDealRow[] }) {
  const [view, setView] = useState<"board" | "list">("board");
  const [typeFilter, setTypeFilter] = useState<"all" | "sfr" | "mf" | "mine">("all");
  const [stageFilter, setStageFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");

  const activeDeals = deals.filter((d) => d.stage !== STAGES.Lost);
  const underContractCount = activeDeals.filter((d) => d.stage === STAGES.UnderContract).length;
  const closedCount = activeDeals.filter((d) => d.stage === STAGES.Closed).length;
  const overdueCount = activeDeals.filter((d) => isOverdue(d) && d.stage !== STAGES.Closed).length;

  function filterDeals(list: PipelineDealRow[]): PipelineDealRow[] {
    return list.filter((d) => {
      const type = getDealType(d);
      if (typeFilter === "sfr" && type !== "sfr") return false;
      if (typeFilter === "mf" && type !== "mf") return false;
      if (typeFilter === "mine" && !(d.meta?.mine)) return false;
      if (stageFilter && getDealStageLabel(d.stage) !== stageFilter) return false;
      if (teamFilter) {
        const assignee = getAssigneeName(d);
        if (!assignee.toLowerCase().includes(teamFilter.toLowerCase())) return false;
      }
      return true;
    });
  }

  const filtered = filterDeals(activeDeals);

  return (
    <div className="pipeline-view">

      {/* ── Header ── */}
      <header className="pipeline-header">
        <div>
          <h1 className="pipeline-title">Pipeline</h1>
          <div className="pipeline-subtitle">
            Deal tracking · Identified → Offer Submitted → Under Contract → Due Diligence → Closed/Acquired
          </div>
        </div>
        <div className="pipeline-header-actions">
          <button
            onClick={() => setView("board")}
            className={`pipeline-view-toggle${view === "board" ? " pipeline-view-toggle--active" : ""}`}
          >Board</button>
          <button
            onClick={() => setView("list")}
            className={`pipeline-view-toggle${view === "list" ? " pipeline-view-toggle--active" : ""}`}
          >List</button>
          <AddDealButton />
        </div>
      </header>

      {/* ── Scrollable body ── */}
      <div className="pipeline-body">

        {/* ── Stats row ── */}
        <div className="pipeline-stats-grid">
          {[
            { val: activeDeals.filter((d) => d.stage !== STAGES.Closed).length, lbl: "Total active",               tone: "marine" },
            { val: underContractCount,                                             lbl: "Under contract",             tone: "amber" },
            { val: closedCount,                                                    lbl: "Closed this quarter",        tone: "success" },
            { val: overdueCount,                                                   lbl: "Overdue / follow-up needed", tone: "danger" },
          ].map(({ val, lbl, tone }) => (
            <div key={lbl} className={`pipeline-stat pipeline-stat--${tone}`}>
              <div className="pipeline-stat-value">{val}</div>
              <div className="pipeline-stat-label">{lbl}</div>
            </div>
          ))}
        </div>

        {activeDeals.length === 0 ? (
          <section className="pipeline-empty-state" aria-labelledby="pipeline-empty-title">
            <div className="pipeline-empty-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" focusable="false">
                <path d="M8 23.5 24 10l16 13.5V39a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2Z" />
                <path d="M18 41V28h12v13M34 14v-4h6v9" />
              </svg>
            </div>
            <div className="pipeline-empty-copy">
              <h2 id="pipeline-empty-title">Build your acquisition pipeline</h2>
              <p>Use Add deal above to begin tracking offers, diligence, and closings.</p>
            </div>
          </section>
        ) : (
          <>
        {/* ── Filter bar ── */}
        <div className="pipeline-filters">
          {(["all", "sfr", "mf", "mine"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`pipeline-filter${typeFilter === f ? " pipeline-filter--active" : ""}`}
            >
              {f === "all" ? "All deals" : f === "sfr" ? "SFR" : f === "mf" ? "Multifamily" : "Mine"}
            </button>
          ))}
          <div className="pipeline-filter-spacer" />
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="pipeline-filter-select"
          >
            <option value="">All stages</option>
            {WIREFRAME_COLS.map((c) => <option key={c.label}>{c.label}</option>)}
          </select>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="pipeline-filter-select"
          >
            <option value="">All team</option>
          </select>
        </div>

        {/* ── Board view ── */}
        {view === "board" && (
          <div className="pipeline-board">
            {WIREFRAME_COLS.map((col) => {
              const colDeals = filtered.filter((d) => col.stages.includes(d.stage));
              return (
                <div key={col.label} className="pipeline-column">
                  <div className="pipeline-column-header">
                    <span className="pipeline-column-label">
                      {col.label}
                    </span>
                    <span className="pipeline-column-count">
                      {colDeals.length}
                    </span>
                  </div>
                  <div className="pipeline-column-deals">
                    {colDeals.map((d) => <DealCard key={d.id} deal={d} />)}
                    {colDeals.length === 0 && (
                      <div className="pipeline-column-empty">—</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── List view ── */}
        {view === "list" && (
          <div className="pipeline-list-shell">
            <table className="pipeline-list-table">
              <thead>
                <tr>
                  {["Address", "Type", "Stage", "Price", "Key metric", "Assigned", "Days"].map((h) => (
                    <th key={h} className={h === "Price" ? "pipeline-table-price" : undefined}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const type = getDealType(d);
                  const price = getDealPrice(d);
                  const metric = getDealMetric(d);
                  const days = getDealDays(d);
                  const assignee = getAssigneeName(d);
                  const overdue = isOverdue(d) && d.stage !== STAGES.Closed;
                  const initials = assignee === "—" ? "??" : assignee.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
                  return (
                    <tr key={d.id} className={overdue ? "pipeline-table-row--overdue" : undefined}>
                      <td className="pipeline-table-address">
                        {overdue ? `⚠ ${d.address}` : d.address}
                      </td>
                      <td>
                        <div className="pipeline-table-badges">
                          <TypeBadge type={type} />
                          <StrategyBadge deal={d} />
                        </div>
                      </td>
                      <td className="pipeline-table-stage">
                        {getDealStageLabel(d.stage)}
                      </td>
                      <td className="pipeline-table-price">
                        {formatMoney(price)}
                      </td>
                      <td className="pipeline-table-metric">
                        {metric}
                      </td>
                      <td>
                        <Avatar initials={initials} />
                      </td>
                      <td className="pipeline-table-days">
                        {days}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="pipeline-list-empty">
                      No deals match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
          </>
        )}

      </div>
    </div>
  );
}
