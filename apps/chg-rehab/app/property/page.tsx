import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatET } from "@/lib/datetime";
import { formatMoney } from "@/lib/pipeline";
import {
  AddPropertyButton,
  ChangeToRentalButton,
  StartRehabButton,
  EditFinancialsButton,
  AddAssetButton,
  AssetRowActions,
  UploadDocButton,
  DocRowActions,
  DeletePropertyButton,
} from "./PropertyActions";
import PropertySearchInput from "./PropertySearchInput";
import PropertyTasksTab from "./PropertyTasksTab";
import { getPropertyActivity, timeAgo, type PropertyActivityKind } from "@/lib/propertyActivity";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
type Filter = "all" | "rehab" | "rental" | "acq" | "sold";
type Tab = "overview" | "history" | "financials" | "assets" | "documents" | "tenants" | "analysis" | "tasks";

type SP = { id?: string; q?: string; filter?: Filter; tab?: Tab };

type OpenItem = { id: string; label: string; severity: "high" | "med" | "low"; since?: string };

type PropertyMeta = {
  type?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  parcel?: string;
  zoning?: string;
  flood?: string;
  hoa?: string;
  purchasePrice?: number;
  closingCosts?: number;
  rehabSpent?: number;
  rehabBudget?: number;
  arv?: number;
  projectedRoi?: number;
  spec?: string;
  soldOn?: string;
  monthlyRent?: number;
  monthlyExpenses?: number;
  cashInvested?: number;
  openItems?: OpenItem[];
};

function matchesFilter(status: string | null, f: Filter): boolean {
  if (f === "all") return true;
  const s = (status || "").toLowerCase();
  if (f === "rehab")  return s.includes("rehab");
  if (f === "rental") return s.includes("rental") || s.includes("tenanted");
  if (f === "sold")   return s.includes("sold");
  if (f === "acq")    return s.includes("acquired") || s.includes("active rehab") || s.includes("listed");
  return true;
}

export default async function PropertyPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "property", "view"))) {
    return <div style={{ padding: 20 }}>You do not have access to property records.</div>;
  }

  const sp = await searchParams;
  const filter: Filter = sp.filter || "all";
  const q = (sp.q || "").trim();
  const tab: Tab = sp.tab || "overview";

  const all = await prisma.property.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "desc" },
  });

  const filtered = all.filter((p) => {
    if (!matchesFilter(p.status, filter)) return false;
    if (q) {
      const pm = (p.meta || {}) as PropertyMeta;
      const hay = `${p.address} ${p.city ?? ""} ${p.code} ${p.status ?? ""} ${pm.type ?? ""} ${pm.spec ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const visible = filtered.slice(0, PAGE_SIZE);

  const selectedId = sp.id || visible[0]?.id || all[0]?.id || null;
  const selected = selectedId ? all.find((p) => p.id === selectedId) || null : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Top bar */}
      <div className="proj-bar">
        <div className="proj-l">
          <span className="proj-addr">
            {selected ? `${selected.address}${selected.city ? `, ${selected.city} ${selected.state ?? ""}` : ""}` : "Property Record"}
          </span>
          {selected && <span className="proj-chip">{selected.code}</span>}
          {selected && (selected.meta as PropertyMeta)?.spec && (
            <span className="proj-chip">{(selected.meta as PropertyMeta).spec}</span>
          )}
          <AddPropertyButton />
        </div>
        <div className="proj-r" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {selected?.status && (
            <span className="proj-mode" style={statusBadgeStyle(selected.status)}>● {selected.status}</span>
          )}
          {selected?.acquired && (
            <span className="proj-ts">Acquired {formatET(selected.acquired, false)}</span>
          )}
          {selected && (
            <ChangeToRentalButton
              property={{ id: selected.id, status: selected.status, meta: (selected.meta || {}) as never }}
            />
          )}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* LEFT: list */}
        <div style={{
          width: 220, flexShrink: 0,
          borderRight: "0.5px solid var(--border-lo)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          background: "var(--bg-secondary)",
        }}>
          <div style={{ padding: "8px 10px", borderBottom: "0.5px solid var(--border-lo)", flexShrink: 0 }}>
            <PropertySearchInput initialValue={q} />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
              {(["all", "rehab", "rental", "acq", "sold"] as Filter[]).map((f) => (
                <Link
                  key={f}
                  href={`/property?filter=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}${selected ? `&id=${selected.id}` : ""}`}
                  className={`filter-chip ${filter === f ? "active" : ""}`}
                >
                  {f === "all" ? "All" : f === "rehab" ? "Rehab" : f === "rental" ? "Rental" : f === "acq" ? "Acquired" : "Sold"}
                </Link>
              ))}
            </div>
          </div>

          <div style={{
            padding: "4px 10px",
            fontSize: 9,
            color: "var(--text-tertiary)",
            borderBottom: "0.5px solid var(--border-lo)",
          }}>
            {q || filter !== "all"
              ? `Showing ${visible.length} of ${filtered.length} matching · ${all.length} total`
              : `Showing ${visible.length} of ${all.length} properties`}
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {visible.map((p) => {
              const active = p.id === selectedId;
              const isRehab = (p.status || "").toLowerCase().includes("rehab");
              const bg = isRehab ? "background:#E8EFF1;color:#143641;" : "background:#EAF3DE;color:#27500A;";
              return (
                <div key={p.id} style={{ position: "relative" }}>
                <Link
                  href={`/property?id=${p.id}&tab=${tab}${filter !== "all" ? `&filter=${filter}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  className={`ln-item${active ? " active" : ""}`}
                  style={{
                    flexDirection: "column",
                    alignItems: "flex-start",
                    padding: "9px 10px",
                    gap: 2,
                    borderBottom: "0.5px solid var(--border-lo)",
                    cursor: "pointer",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>
                    {p.address.split(",")[0]}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                    {[p.city, (p.meta as PropertyMeta)?.spec].filter(Boolean).join(" · ")}
                  </div>
                  {p.status && (
                    <div style={{ marginTop: 3 }}>
                      <span style={{
                        fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 500,
                        ...parseInlineStyle(bg),
                      }}>{p.status}</span>
                    </div>
                  )}
                </Link>
                  <DeletePropertyButton id={p.id} />
                </div>
              );
            })}
            {filtered.length > PAGE_SIZE && (
              <div style={{ padding: 10, textAlign: "center", fontSize: 10, color: "var(--text-tertiary)", borderTop: "0.5px solid var(--border-lo)" }}>
                {filtered.length - PAGE_SIZE} more — refine your search to narrow results
              </div>
            )}
            {filtered.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", fontSize: 11, color: "var(--text-tertiary)" }}>
                No matching properties.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: tabs + content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="tab-nav">
            {(
              [
                ["overview", "Overview"],
                ["history", "Project history"],
                ["financials", "Financials"],
                ["assets", "Asset register"],
                ["documents", "Documents"],
                ["tenants", "Tenants"],
                ["analysis", "Analysis"],
                ["tasks", "Tasks"] as [Tab, string],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <Link
                key={t}
                href={`/property?id=${selectedId ?? ""}&tab=${t}${filter !== "all" ? `&filter=${filter}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`tab-btn ${tab === t ? "active" : ""}`}
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="tab-panel active">
            {!selected ? (
              <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 12 }}>
                Select a property from the list.
              </div>
            ) : tab === "overview" ? (
              <OverviewTab property={selected} companyId={user.companyId} />
            ) : tab === "history" ? (
              <HistoryTab propertyId={selected.id} companyId={user.companyId} />
            ) : tab === "financials" ? (
              <FinancialsTab property={selected} companyId={user.companyId} />
            ) : tab === "assets" ? (
              <AssetsTab propertyId={selected.id} />
            ) : tab === "documents" ? (
              <DocumentsTab propertyId={selected.id} companyId={user.companyId} />
            ) : tab === "analysis" ? (
              <AnalysisPanel propertyId={selected.id} />
            ) : tab === "tasks" ? (
              <PropertyTasksTab propertyId={selected.id} propertyLabel={selected.address ?? selected.id} />
            ) : (
              <TenantsTab property={selected} companyId={user.companyId} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function parseInlineStyle(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  s.split(";").forEach((p) => {
    const [k, v] = p.split(":");
    if (k && v) out[k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v.trim();
  });
  return out;
}

function activityDotColor(kind: PropertyActivityKind): string {
  if (kind === "task_completed") return "#10b981";
  if (kind === "task_created") return "#2563eb";
  if (kind === "document_uploaded") return "#f59e0b";
  return "#9ca3af";
}

function activityEmoji(kind: PropertyActivityKind): string {
  if (kind === "task_completed") return "✅";
  if (kind === "task_created") return "📋";
  if (kind === "document_uploaded") return "📄";
  return "•";
}

function statusBadgeStyle(status: string): React.CSSProperties {
  const s = status.toLowerCase();
  if (s.includes("rehab")) return { background: "#E8EFF1", color: "#143641" };
  if (s.includes("rental") || s.includes("tenanted")) return { background: "#EAF3DE", color: "#27500A" };
  if (s.includes("sold")) return { background: "#EEEDFE", color: "#3C3489" };
  return { background: "#FAEEDA", color: "#633806" };
}

// ── Overview ──────────────────────────────────────────────────────────
async function OverviewTab({ property, companyId }: { property: NonNullable<Awaited<ReturnType<typeof prisma.property.findFirst>>>; companyId: string }) {
  const m = (property.meta || {}) as PropertyMeta;
  // Fetch project and settings in parallel (activity needs project.id for its OR clause).
  const [project, setting] = await Promise.all([
    prisma.project.findFirst({
      where: { companyId, propertyId: property.id },
      orderBy: { createdAt: "desc" },
      include: { phases: true },
    }),
    prisma.companySetting.findUnique({ where: { companyId } }),
  ]);

  const activity = await prisma.activityLogEntry.findMany({
    where: { companyId, OR: [{ entityId: property.id }, { entityId: project?.id || "_none_" }] },
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  const recentActivity = await getPropertyActivity(companyId, property.id);

  const acquisitionCost = m.purchasePrice ?? null;
  const totalInvested = (m.purchasePrice ?? 0) + (m.closingCosts ?? 0) + (m.rehabSpent ?? 0);
  const profit = (m.arv ?? 0) - totalInvested;
  const activePhase = project?.phases.find((p) => p.status === "Active");
  const settingMeta = (setting?.meta as Record<string, unknown> | null) ?? {};
  const defaultProjectMode = (settingMeta.defaultProjectMode as string | undefined) ?? null;

  const acquiredISO = property.acquired
    ? property.acquired.toISOString().slice(0, 10)
    : null;

  const isRental = (property.status || "").toLowerCase().includes("rental")
    || (property.status || "").toLowerCase().includes("tenanted");
  const monthlyNoi = (m.monthlyRent ?? 0) - (m.monthlyExpenses ?? 0);
  const annualNoi = monthlyNoi * 12;
  const cashBasis = m.cashInvested ?? totalInvested;
  const cashOnCash = cashBasis > 0 && annualNoi > 0
    ? Math.round((annualNoi / cashBasis) * 1000) / 10
    : null;
  const openItems = (m.openItems ?? []) as OpenItem[];

  return (
    <>
      <div className="kpi-strip">
        <div className="kpi-card">
          <div className="kpi-label">Acquisition cost</div>
          <div className="kpi-val">{formatMoney(acquisitionCost)}</div>
          <div className="kpi-sub">{property.acquired ? `Closed ${formatET(property.acquired, false)}` : "—"}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total invested</div>
          <div className="kpi-val" style={{ color: "#1F4D5C" }}>{formatMoney(totalInvested || null)}</div>
          <div className="kpi-sub">Purchase + rehab to date</div>
        </div>
        {isRental ? (
          <>
            <div className="kpi-card">
              <div className="kpi-label">Rental income</div>
              <div className="kpi-val">{formatMoney(m.monthlyRent ?? null)}<span style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 400 }}> /mo</span></div>
              <div className="kpi-sub">{m.monthlyExpenses != null ? `Expenses ${formatMoney(m.monthlyExpenses)}/mo` : "—"}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Cash-on-cash</div>
              <div className="kpi-val green">{cashOnCash != null ? `${cashOnCash}%` : "—"}</div>
              <div className="kpi-sub">{annualNoi > 0 ? `${formatMoney(annualNoi)} NOI / yr` : "—"}</div>
            </div>
          </>
        ) : (
          <>
            <div className="kpi-card">
              <div className="kpi-label">Estimated ARV</div>
              <div className="kpi-val">{formatMoney(m.arv)}</div>
              {profit > 0 && (
                <div className="kpi-badge" style={{ background: "var(--green-bg)", color: "var(--green-txt)" }}>
                  +{formatMoney(profit)} proj. profit
                </div>
              )}
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Projected ROI</div>
              <div className="kpi-val green">{m.projectedRoi != null ? `${m.projectedRoi}%` : "—"}</div>
              <div className="kpi-sub">After all costs</div>
            </div>
          </>
        )}
      </div>

      <SmartStatusBanner property={property} project={project} meta={m} />

      <div className="body-split">
        <div className="body-main">
          {!project && (
            <>
              <div className="sec-hd">No active rehab project</div>
              <div style={{ padding: "16px 16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "0.5px solid var(--border-lo)" }}>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5, maxWidth: 360 }}>
                  This property has no rehab project yet. Start one to track phases, draws, and contractor scope.
                </div>
                <StartRehabButton
                  seed={{
                    propertyId: property.id,
                    address: property.address,
                    purchasePrice: m.purchasePrice ?? null,
                    acquisitionDate: acquiredISO,
                    defaultMode: defaultProjectMode,
                  }}
                />
              </div>
            </>
          )}
          {project && (
            <>
              <div className="sec-hd">
                Active project
                <Link
                  href={`/rehab?project=${project.code}`}
                  style={{ float: "right", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 10, color: "#1F4D5C", textDecoration: "none" }}
                >
                  Open in Rehab Manager →
                </Link>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "0.5px solid var(--border-lo)" }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Project {project.code}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{project.name}</div>
                  {activePhase && (
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 3 }}>
                      Phase {activePhase.number} of {project.phases.length} — {activePhase.name} in progress
                      {project.endDate ? ` · ${formatET(project.endDate, false)} revised deadline` : ""}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>Budget</div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{formatMoney(project.budget ? Number(project.budget) : null)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>Spent</div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{formatMoney(m.rehabSpent)}</div>
                  </div>
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "var(--blue-bg)", color: "var(--blue-txt)" }}>
                    {project.status === "Active" ? "In progress" : project.status}
                  </span>
                </div>
              </div>
            </>
          )}

          <div className="sec-hd">Property details</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "0.5px solid var(--border-lo)" }}>
            <div style={{ borderRight: "0.5px solid var(--border-lo)" }}>
              <DetailRow label="Property type" value={m.type ?? "—"} />
              <DetailRow label="Bed / bath" value={`${m.beds ?? "—"} bed · ${m.baths ?? "—"} bath`} />
              <DetailRow label="Square footage" value={m.sqft ? `${m.sqft.toLocaleString()} SF` : "—"} />
              <DetailRow label="Year built" value={m.yearBuilt?.toString() ?? "—"} last />
            </div>
            <div>
              <DetailRow label="Parcel / APN" value={m.parcel ?? "—"} />
              <DetailRow label="Zoning"        value={m.zoning ?? "—"} />
              <DetailRow label="Flood zone"    value={m.flood ?? "—"} />
              <DetailRow label="HOA"           value={m.hoa ?? "—"} last />
            </div>
          </div>

          <div className="sec-hd">Recent activity</div>
          {recentActivity.length === 0 ? (
            <div style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-tertiary)" }}>
              No activity yet for this property.
            </div>
          ) : (
            <div style={{ padding: "10px 16px 18px" }}>
              {recentActivity.map((ev, i) => {
                const dot = activityDotColor(ev.kind);
                const last = i === recentActivity.length - 1;
                return (
                  <div key={ev.id} style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 14, flexShrink: 0 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: dot, marginTop: 4, flexShrink: 0 }} />
                      {!last && <span style={{ flex: 1, width: 1, background: "var(--border-lo)", marginTop: 2 }} />}
                    </div>
                    <div style={{ paddingBottom: last ? 0 : 12 }}>
                      <div style={{ fontSize: 11, color: "var(--text-primary)" }}>
                        {activityEmoji(ev.kind)} {ev.label}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 1 }}>
                        {timeAgo(ev.at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside className="body-side">
          {openItems.length > 0 && (
            <div className="sb-sec">
              <div className="sb-hd">
                Open items
                <span style={{ float: "right", fontWeight: 400, fontSize: 9, color: "var(--text-tertiary)", textTransform: "none", letterSpacing: 0 }}>
                  {openItems.length} open
                </span>
              </div>
              {openItems.map((it, i) => {
                const sevColor = it.severity === "high" ? "#C2410C" : it.severity === "med" ? "#A16207" : "#1F4D5C";
                const sevBg    = it.severity === "high" ? "#FEF1E5" : it.severity === "med" ? "#FEF7E0" : "#E8F0FA";
                return (
                  <div key={it.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    padding: i === openItems.length - 1 ? "5px 12px 8px" : "6px 12px",
                    borderBottom: i === openItems.length - 1 ? undefined : "0.5px solid var(--border-lo)",
                  }}>
                    <span style={{
                      flexShrink: 0, fontSize: 8, fontWeight: 600,
                      padding: "2px 5px", borderRadius: 3,
                      background: sevBg, color: sevColor,
                      textTransform: "uppercase", letterSpacing: 0.4,
                    }}>{it.severity}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10 }}>{it.label}</div>
                      {it.since && (
                        <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 1 }}>
                          Open since {new Date(it.since).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="sb-sec">
            <div className="sb-hd">Financial snapshot</div>
            <div style={{ padding: "6px 12px" }}>
              <SnapRow label="Purchase price"  value={formatMoney(m.purchasePrice)} />
              <SnapRow label="Closing costs"   value={formatMoney(m.closingCosts)} />
              <SnapRow label="Rehab spent"     value={formatMoney(m.rehabSpent)} />
              <SnapRow label="Est. ARV"        value={formatMoney(m.arv)} />
              <SnapRow label="Proj. ROI"       value={m.projectedRoi != null ? `${m.projectedRoi}%` : "—"} bold valueColor="#1D9E75" last />
            </div>
          </div>

          <div className="sb-sec" style={{ borderBottom: "none" }}>
            <div className="sb-hd">Recent activity</div>
            {activity.length === 0 ? (
              <div style={{ padding: "6px 12px", fontSize: 10, color: "var(--text-tertiary)" }}>No recent activity.</div>
            ) : (
              activity.map((a, i) => (
                <div key={a.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 8,
                  padding: i === activity.length - 1 ? "5px 12px 8px" : "6px 12px",
                  borderBottom: i === activity.length - 1 ? undefined : "0.5px solid var(--border-lo)",
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%",
                    background: "#EAF3DE", color: "#27500A",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, flexShrink: 0,
                  }}>✓</div>
                  <div>
                    <div style={{ fontSize: 10 }}>{a.message}</div>
                    <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{formatET(a.createdAt)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 16px", borderBottom: last ? undefined : "0.5px solid var(--border-lo)" }}>
      <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 10, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function SnapRow({ label, value, bold, valueColor, last }: { label: string; value: string; bold?: boolean; valueColor?: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: last ? undefined : "0.5px solid var(--border-lo)" }}>
      <span style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: bold ? 500 : undefined }}>{label}</span>
      <span style={{ fontSize: bold ? 12 : 10, fontWeight: bold ? 600 : 500, color: valueColor }}>{value}</span>
    </div>
  );
}

// ── History ───────────────────────────────────────────────────────────
async function HistoryTab({ propertyId, companyId }: { propertyId: string; companyId: string }) {
  const projects = await prisma.project.findMany({
    where: { companyId, propertyId },
    orderBy: { createdAt: "desc" },
    include: { phases: true },
  });
  return (
    <div style={{ overflowY: "auto", flex: 1 }}>
      <div className="sec-hd">Project history</div>
      {projects.length === 0 && (
        <div style={{ padding: 20, color: "var(--text-tertiary)", fontSize: 11 }}>No rehab projects on file.</div>
      )}
      {projects.map((p) => (
        <div key={p.id} style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--border-lo)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{p.code}</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "var(--blue-bg)", color: "var(--blue-txt)" }}>
                {p.status}
              </span>
              <Link
                href={`/rehab?project=${encodeURIComponent(p.code)}`}
                style={{ fontSize: 10, color: "#1F4D5C", textDecoration: "none" }}
              >
                Open →
              </Link>
            </div>
          </div>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4 }}>
            {p.startDate ? `Started ${formatET(p.startDate, false)}` : ""}
            {p.endDate ? ` · Target ${formatET(p.endDate, false)}` : ""}
            {` · ${p.phases.length} phases · Budget ${formatMoney(p.budget ? Number(p.budget) : null)}`}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Financials ────────────────────────────────────────────────────────
async function SmartStatusBanner({
  property,
  project,
  meta,
}: {
  property: { id: string; status: string | null };
  project: { id: string } | null;
  meta: PropertyMeta;
}) {
  const status = (property.status || "").toLowerCase();

  // Determine which banner to show
  let banner: { color: string; bg: string; border: string; icon: string; title: string; body: string; cta: string; href: string } | null = null;

  if (status.includes("acquired") && !status.includes("rehab")) {
    const hasAnalysis = await prisma.propertyFinancialSection.count({
      where: { propertyId: property.id, section: { startsWith: "underwriting_" } },
    });
    if (!hasAnalysis) {
      banner = {
        bg: "#FAEEDA", border: "rgba(99,56,6,0.2)", color: "#633806",
        icon: "📊",
        title: "Run your underwriting analysis",
        body: "This property is acquired. Compare Flip, BRRRR, and Flip & Rent before committing to a strategy.",
        cta: "Open underwriting →",
        href: `/underwriting?propertyId=${property.id}`,
      };
    }
  } else if (status.includes("rehab")) {
    if (!project) {
      banner = {
        bg: "#E8EFF1", border: "rgba(31,77,92,0.2)", color: "#143641",
        icon: "🏗️",
        title: "Set up your rehab project",
        body: "Track scope, budget, schedule, and contractor assignments for this active rehab.",
        cta: "Go to Rehab Manager →",
        href: `/rehab`,
      };
    } else if (!meta.purchasePrice) {
      banner = {
        bg: "#FEF9EC", border: "rgba(146,64,14,0.2)", color: "#92400E",
        icon: "💰",
        title: "Add financial inputs",
        body: "Purchase price and rehab budget are missing. Add them so your financials tab calculates correctly.",
        cta: "Edit financials →",
        href: `/property?id=${property.id}&tab=financials`,
      };
    }
  } else if (status.includes("rental") || status.includes("tenanted")) {
    const leaseCount = await prisma.lease.count({ where: { propertyId: property.id } });
    if (!leaseCount) {
      banner = {
        bg: "#EAF3DE", border: "rgba(29,158,117,0.2)", color: "#27500A",
        icon: "🏠",
        title: "Add tenant & lease information",
        body: "This is an active rental. Add the current lease agreement and tenant details.",
        cta: "Go to Tenants tab →",
        href: `/property?id=${property.id}&tab=tenants`,
      };
    }
  } else if (status.includes("listed")) {
    banner = {
      bg: "#EDE9FE", border: "rgba(109,40,217,0.2)", color: "#4C1D95",
      icon: "🏷️",
      title: "Property is listed for sale",
      body: "Track your listing activity, price changes, days on market, and buyer leads in the Documents and Financials tabs.",
      cta: "View financials →",
      href: `/property?id=${property.id}&tab=financials`,
    };
  }

  if (!banner) return null;

  return (
    <div style={{
      margin: "0 16px 12px",
      padding: "12px 16px",
      background: banner.bg,
      border: `0.5px solid ${banner.border}`,
      borderRadius: 8,
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
    }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{banner.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: banner.color, marginBottom: 3 }}>{banner.title}</div>
        <div style={{ fontSize: 12, color: banner.color, opacity: 0.85, lineHeight: 1.5, marginBottom: 8 }}>{banner.body}</div>
        <a href={banner.href} style={{ fontSize: 12, fontWeight: 600, color: banner.color, textDecoration: "none", borderBottom: `1px solid ${banner.color}` }}>
          {banner.cta}
        </a>
      </div>
    </div>
  );
}

async function FinancialsTab({ property, companyId }: { property: NonNullable<Awaited<ReturnType<typeof prisma.property.findFirst>>>; companyId: string }) {
  const m = (property.meta || {}) as PropertyMeta;
  const project = await prisma.project.findFirst({
    where: { companyId, propertyId: property.id },
    include: { phases: { orderBy: { number: "asc" } } },
  });
  const phases = project?.phases ?? [];
  const totalRehabProjected = phases.reduce((acc, p) => acc + (p.actual ? Number(p.actual) : Number(p.budget || 0)), 0);
  const acqTotal = (m.purchasePrice ?? 0) + (m.closingCosts ?? 0) + 450;
  const holding = 1840;
  const totalInvested = acqTotal + totalRehabProjected + holding;
  const sellingCosts = m.arv ? Math.round(m.arv * 0.06) : 0;
  const projectedNet = (m.arv ?? 0) - sellingCosts - totalInvested;
  const projectedRoi = totalInvested > 0 ? Math.round((projectedNet / totalInvested) * 1000) / 10 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="action-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <select className="filter-sel" defaultValue="all">
          <option value="all">All scenarios</option>
          <option value="sell">Sell after rehab</option>
          <option value="rent">Rent 12 months then sell</option>
        </select>
        <EditFinancialsButton property={{ id: property.id, status: property.status, meta: m }} />
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        <FinSection title="Acquisition" rows={[
          { lbl: "Purchase price", val: formatMoney(m.purchasePrice) },
          { lbl: "Closing costs", val: formatMoney(m.closingCosts) },
          { lbl: "Inspection / due diligence", val: "$450" },
        ]} total={{ lbl: "Total acquisition", val: formatMoney(acqTotal) }} />

        {phases.length > 0 && (
          <FinSection
            title={`Rehab costs — ${project?.code}`}
            rows={phases.map((p) => ({
              lbl: `Phase ${p.number} — ${p.name}${p.status === "Active" ? " (projected)" : p.status === "NotStarted" ? " (budgeted)" : ""}`,
              val: formatMoney(p.actual ? Number(p.actual) : Number(p.budget || 0)),
              valColor: p.status === "Active" ? "#BA7517" : p.status === "NotStarted" ? "var(--text-tertiary)" : undefined,
            }))}
            total={{ lbl: "Total rehab (projected)", val: formatMoney(totalRehabProjected), color: "#BA7517" }}
          />
        )}

        <FinSection title="Holding costs (during rehab period)" rows={[
          { lbl: "Property taxes (pro-rated)", val: "$820" },
          { lbl: "Insurance (during rehab)", val: "$640" },
          { lbl: "Utilities", val: "$380" },
        ]} total={{ lbl: "Total holding", val: formatMoney(holding) }} />

        <FinSection title="Revenue / exit" rows={[
          { lbl: "Estimated ARV (manual entry)", val: formatMoney(m.arv) },
          { lbl: "Estimated selling costs (6%)", val: `-${formatMoney(sellingCosts)}`, valColor: "#A32D2D" },
          { lbl: "Actual sale price", val: m.soldOn ? "Sold" : "Pending", valColor: "var(--text-tertiary)" },
        ]} />

        <div style={{ padding: "14px 16px", background: "var(--bg-secondary)", borderBottom: "0.5px solid var(--border-lo)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            <Summary label="Total invested"          val={formatMoney(totalInvested)}    color="#1F4D5C" />
            <Summary label="Projected net profit"    val={!m.arv || m.arv <= 0 ? "—" : formatMoney(projectedNet)}     color="#1D9E75" />
            <Summary label="Projected ROI"           val={!m.arv || m.arv <= 0 ? "—" : `${projectedRoi}%`}             color="#1D9E75" sub="(sell scenario)" />
          </div>
        </div>
        <div style={{ padding: "10px 16px", background: "#EAF3DE", borderBottom: "0.5px solid var(--border-lo)" }}>
          <div style={{ fontSize: 10, color: "#27500A" }}>
            ARV of {formatMoney(m.arv)} is a manual estimate. Update this field when comparable sales are confirmed. Actual ROI will recalculate automatically when sale price is entered.
          </div>
        </div>
      </div>
    </div>
  );
}

function FinSection({ title, rows, total }: { title: string; rows: { lbl: string; val: string; valColor?: string }[]; total?: { lbl: string; val: string; color?: string } }) {
  return (
    <div className="fin-section">
      <div className="fin-hd">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className="fin-row">
          <span className="fin-lbl">{r.lbl}</span>
          <span className="fin-lbl-dots" />
          <span className="fin-val" style={{ color: r.valColor }}>{r.val}</span>
        </div>
      ))}
      {total && (
        <div className="fin-total">
          <span className="ft-lbl">{total.lbl}</span>
          <span className="ft-val" style={{ color: total.color }}>{total.val}</span>
        </div>
      )}
    </div>
  );
}

function Summary({ label, val, color, sub }: { label: string; val: string; color?: string; sub?: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 500, color }}>{val}</div>
      {sub && <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{sub}</div>}
    </div>
  );
}

// ── Assets ────────────────────────────────────────────────────────────
async function AssetsTab({ propertyId }: { propertyId: string }) {
  const assets = await prisma.propertyAsset.findMany({
    where: { propertyId },
    orderBy: { installed: "desc" },
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="action-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <select className="filter-sel" defaultValue="all">
          <option value="all">All categories</option>
          <option>Appliances</option>
          <option>HVAC</option>
          <option>Plumbing</option>
          <option>Electrical</option>
          <option>Doors & windows</option>
          <option>Flooring</option>
        </select>
        <AddAssetButton propertyId={propertyId} />
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        <div className="asset-hd">
          <span className="col-lbl">Asset</span>
          <span className="col-lbl">Category</span>
          <span className="col-lbl">Installed</span>
          <span className="col-lbl">Warranty</span>
          <span className="col-lbl" style={{ textAlign: "right" }}>Value</span>
          <span />
        </div>
        {assets.length === 0 && (
          <div style={{ padding: 20, color: "var(--text-tertiary)", fontSize: 11 }}>No assets on file for this property.</div>
        )}
        {assets.map((a) => (
          <div key={a.id} className="asset-row">
            <div>
              <div className="an">{a.name}</div>
              {a.notes && <div className="am">{a.notes}</div>}
            </div>
            <div className="ac">{a.category}</div>
            <div className="ac">{a.installed ? formatET(a.installed, false) : "Pending install"}</div>
            <div>
              {a.warrantyEnd ? <div className="warranty-ok">{formatET(a.warrantyEnd, false)}</div> : <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>No warranty card</div>}
            </div>
            <div className="av">{extractCost(a.notes) ?? ""}</div>
            <AssetRowActions
              propertyId={propertyId}
              asset={{
                id: a.id,
                name: a.name,
                category: a.category,
                notes: a.notes,
                installed: a.installed ? a.installed.toISOString() : null,
                warrantyEnd: a.warrantyEnd ? a.warrantyEnd.toISOString() : null,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function extractCost(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/\$([\d,]+)/);
  return m ? `$${m[1]}` : null;
}

// ── Documents ─────────────────────────────────────────────────────────
async function DocumentsTab({ propertyId, companyId }: { propertyId: string; companyId: string }) {
  const docs = await prisma.document.findMany({
    where: { companyId, propertyId, level: "Property" },
    orderBy: { uploadedAt: "desc" },
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="action-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <select className="filter-sel" defaultValue="all">
          <option value="all">All categories</option>
          <option>Title</option>
          <option>Permit</option>
          <option>Inspection</option>
          <option>Insurance</option>
          <option>Survey</option>
        </select>
        <UploadDocButton propertyId={propertyId} />
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        <div className="doc-tbl-hd">
          <span className="col-lbl">Document</span>
          <span className="col-lbl">Category</span>
          <span className="col-lbl">Status</span>
          <span className="col-lbl">Date</span>
          <span />
        </div>
        {docs.length === 0 && (
          <div style={{ padding: 20, color: "var(--text-tertiary)", fontSize: 11 }}>No property documents on file.</div>
        )}
        {docs.map((d) => (
          <div key={d.id} className="doc-tbl-row">
            <div>
              <div className="doc-name">{d.name}</div>
              {d.expiresAt && <div className="doc-meta">Expires {formatET(d.expiresAt, false)}</div>}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{d.category}</div>
            <span className={d.status === "Active" ? "s-ok" : "s-warn"}>
              {d.status === "Active" ? "✓ Active" : d.status}
            </span>
            <div className="doc-date-cell">{formatET(d.uploadedAt, false)} ET</div>
            <DocRowActions
              doc={{
                id: d.id,
                name: d.name,
                category: d.category,
                status: d.status,
                expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
                objectKey: d.fileKey,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tenants ───────────────────────────────────────────────────────────
async function TenantsTab({ property, companyId }: { property: NonNullable<Awaited<ReturnType<typeof prisma.property.findFirst>>>; companyId: string }) {
  const isRental = (property.status || "").toLowerCase().includes("rental") || (property.status || "").toLowerCase().includes("tenanted");
  const leases = await prisma.lease.findMany({
    where: { companyId, propertyId: property.id, status: "Active" },
  });

  if (!isRental || leases.length === 0) {
    return (
      <>
        <div style={{
          padding: "8px 16px", background: "#E8EFF1",
          borderBottom: "0.5px solid rgba(31,77,92,0.2)",
          fontSize: 10, color: "#143641",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span>Tenant records are managed in the Contacts module</span>
          <Link href="/contacts?tab=tenants" className="btn-sm btn-primary">Go to Contacts → Tenants</Link>
        </div>
        <div style={{ padding: "32px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>🏠</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>No tenants for this property</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", maxWidth: 300, margin: "0 auto 16px", lineHeight: 1.6 }}>
            {(property.status || "").toLowerCase().includes("rehab")
              ? "Property is in active rehab. Tenant records activate when status changes to Rental."
              : "No tenant records on file."}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{
        padding: "8px 16px", background: "#EAF3DE",
        borderBottom: "0.5px solid rgba(39,80,10,0.15)",
        fontSize: 10, color: "#27500A",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span>● Rental · {leases.length} tenant{leases.length > 1 ? "s" : ""} · Full records in Contacts module</span>
        <Link href="/contacts?tab=tenants" className="btn-sm">Contacts → Tenants</Link>
      </div>
      {leases.map((l) => {
        const initials = l.tenantName
          .split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
        const total = l.startDate && l.endDate ? l.endDate.getTime() - l.startDate.getTime() : 0;
        const elapsed = l.startDate ? Date.now() - l.startDate.getTime() : 0;
        const prog = total > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / total) * 100))) : 0;
        return (
          <div key={l.id} style={{ padding: "14px 16px", borderBottom: "0.5px solid var(--border-lo)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "#E8EFF1", color: "#143641",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>{initials}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{l.tenantName}</div>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{((l.meta as Record<string, unknown> | null)?.contactKey as string) ?? ""}</div>
                </div>
              </div>
              <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 10, background: "#EAF3DE", color: "#27500A", fontWeight: 500 }}>✓ Current</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              <div className="ip-row"><span className="ir-lbl">Rent</span><span className="ir-val">{l.rent ? `${formatMoney(Number(l.rent))}/mo` : "—"}</span></div>
              <div className="ip-row"><span className="ir-lbl">Lease ends</span><span className="ir-val">{l.endDate ? formatET(l.endDate, false) : "—"}</span></div>
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-tertiary)", marginBottom: 3 }}>
                <span>Lease progress</span><span>{prog}%</span>
              </div>
              <div style={{ height: 4, background: "var(--border-lo)", borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${prog}%`, background: "var(--green)", borderRadius: 3 }} />
              </div>
            </div>
            <Link href="/contacts?tab=tenants" style={{ marginTop: 10, display: "block", fontSize: 10, color: "var(--blue)" }}>
              View full record in Contacts →
            </Link>
          </div>
        );
      })}
    </>
  );
}

function AnalysisList({ sections, propertyId }: { sections: { id: string; section: string; data: unknown }[]; propertyId: string }) {
  return (
    <div style={{ padding: 16 }}>
      {sections.map((s) => {
        const d = s.data as Record<string, unknown>;
        const inputs = (d.inputs ?? {}) as Record<string, unknown>;
        const results = (d.results ?? {}) as Record<string, string | null>;
        const label = String(d.label ?? s.section);
        const savedAt = String(d.savedAt ?? "").replace("T", " ").slice(0, 16);
        const strategy = String(d.strategy ?? "flip").toUpperCase();
        const fmtNum = (v: unknown) => v && Number(v) ? `$${Number(v).toLocaleString()}` : null;

        return (
          <div key={s.id} style={{ background: "#fff", border: "0.5px solid var(--border-lo)", borderRadius: 8, marginBottom: 12, overflow: "hidden" }}>
            {/* Header */}
            <div style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "0.5px solid var(--border-lo)" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em" }}>{label}</div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>Saved {savedAt}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: "#E8EFF1", color: "#1F4D5C", fontWeight: 700 }}>{strategy}</span>
                {results.dealStrength && <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: "#E4F1EA", color: "#0D4A28", fontWeight: 600 }}>{results.dealStrength}</span>}
              </div>
            </div>

            {/* Key metrics row */}
            <div style={{ padding: "14px 20px", display: "flex", gap: 24, flexWrap: "wrap", borderBottom: "0.5px solid var(--border-lo)" }}>
              {[
                { label: "Purchase", value: fmtNum(inputs.purchase) },
                { label: "Rehab", value: fmtNum(inputs.rehab) },
                { label: "ARV", value: fmtNum(inputs.arv) },
                { label: "Projected profit", value: results.profit },
                { label: "ROI on cash", value: results.roiOnCash },
                { label: "CoC return", value: results.cocReturn },
                { label: "Monthly cash flow", value: results.monthlyFlow },
              ].filter(r => r.value).map(r => (
                <div key={r.label}>
                  <div style={{ fontSize: 9, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{r.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: r.label.includes("profit") || r.label.includes("ROI") || r.label.includes("cash flow") || r.label.includes("CoC") ? "#1F7A4D" : "var(--text-primary)" }}>{r.value}</div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ padding: "10px 20px", display: "flex", gap: 10, alignItems: "center" }}>
              <Link
                href={(() => {
                  const p = new URLSearchParams();
                  p.set("propertyId", propertyId);
                  if (inputs.purchase) p.set("purchase", String(inputs.purchase));
                  if (inputs.rehab) p.set("rehab", String(inputs.rehab));
                  if (inputs.arv) p.set("arv", String(inputs.arv));
                  if (inputs.closing) p.set("closing", String(inputs.closing));
                  if (inputs.holding) p.set("holding", String(inputs.holding));
                  if (inputs.rehabPeriod) p.set("rehabPeriod", String(inputs.rehabPeriod));
                  if (inputs.financingType) p.set("financingType", String(inputs.financingType));
                  if (d.strategy) p.set("strategy", String(d.strategy));
                  p.set("readonly", "true");
                  return `/underwriting?${p.toString()}`;
                })()}
                style={{ fontSize: 12, fontWeight: 500, padding: "6px 14px", borderRadius: 6, background: "#1F4D5C", color: "#fff", textDecoration: "none" }}
              >
                Open full report →
              </Link>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Opens in calculator — use Print for a full printable report</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

async function AnalysisPanel({ propertyId }: { propertyId: string }) {
  if (!propertyId) return <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 12 }}>Select a property to view analyses.</div>;
  const sections = await prisma.propertyFinancialSection.findMany({
    where: { propertyId, section: { startsWith: "underwriting_" } },
    orderBy: { id: "desc" },
  });
  if (sections.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
        No saved analyses yet. Run an analysis in Underwriting and click &quot;Save analysis to deal.&quot;
      </div>
    );
  }
  return <AnalysisList sections={sections} propertyId={propertyId} />;
}
