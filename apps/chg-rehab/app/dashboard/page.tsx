import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function StatCard({ value, label, tone, href }: { value: number | string; label: string; tone: string; href?: string }) {
  const content = (
    <div className={`dashboard-stat-card dashboard-stat-card--${tone}`}>
      <div className="dashboard-stat-value">{value}</div>
      <div className="dashboard-stat-label">{label}</div>
    </div>
  );
  if (href) return <Link href={href} className="dashboard-stat-link">{content}</Link>;
  return content;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [projects, properties, deals, tasks] = await Promise.all([
    prisma.project.findMany({
      where: { companyId: user.companyId },
      select: { id: true, name: true, status: true, budget: true, code: true, property: { select: { address: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.property.findMany({
      where: { companyId: user.companyId },
      select: { id: true, address: true, status: true, city: true, state: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pipelineDeal.findMany({
      where: { companyId: user.companyId, stage: { not: "Closed" } },
      select: { id: true, address: true, stage: true, askingPrice: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.wsTask.findMany({
      where: { companyId: user.companyId, done: false },
      select: { id: true, title: true, dueDate: true, priority: true },
      orderBy: { dueDate: "asc" },
      take: 5,
    }).catch(() => [] as { id: string; title: string; dueDate: Date | null; priority: string | null }[]),
  ]);

  const activeRehabs = projects.filter(p => p.status === "Active");
  const activeRentals = properties.filter(p => (p.status || "").toLowerCase().includes("rental"));
  const acquired = properties.filter(p => (p.status || "").toLowerCase().includes("acquired"));
  const listed = properties.filter(p => (p.status || "").toLowerCase().includes("listed"));
  const totalProperties = properties.length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="dashboard-page">
      <div className="dashboard-content">

        {/* Header */}
        <header className="dashboard-header">
          <h1 className="dashboard-title">
            Company Overview
          </h1>
          <div className="dashboard-date">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </div>
        </header>

        {/* KPI row */}
        <div className="dashboard-kpi-grid">
          <StatCard value={totalProperties} label="Total properties" tone="ink" href="/property" />
          <StatCard value={activeRehabs.length} label="Active rehabs" tone="marine" href="/rehab" />
          <StatCard value={activeRentals.length} label="Active rentals" tone="green" href="/property" />
          <StatCard value={acquired.length} label="Acquired" tone="bronze" href="/property" />
          <StatCard value={listed.length} label="Listed" tone="amber" href="/property" />
          <StatCard value={deals.length} label="Open deals" tone="charcoal" href="/pipeline" />
        </div>

        <div className="dashboard-card-grid">

          {/* Active Rehabs */}
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <div className="dashboard-card-title">Active Rehabs</div>
              <Link href="/rehab" className="dashboard-view-all">View all →</Link>
            </div>
            {activeRehabs.length === 0 ? (
              <div className="dashboard-empty-state">No active rehab projects.</div>
            ) : (
              activeRehabs.slice(0, 5).map(p => (
                <Link key={p.id} href={`/rehab/${encodeURIComponent(p.code)}/overview`} className="dashboard-list-row">
                  <div>
                    <div className="dashboard-row-primary">{p.property.address.split(",")[0]}</div>
                    <div className="dashboard-row-secondary">{p.code}</div>
                  </div>
                  {p.budget && <div className="dashboard-row-value">${Math.round(Number(p.budget)).toLocaleString()}</div>}
                </Link>
              ))
            )}
          </div>

          {/* Pipeline */}
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <div className="dashboard-card-title">Open Deals</div>
              <Link href="/pipeline" className="dashboard-view-all">View all →</Link>
            </div>
            {deals.length === 0 ? (
              <div className="dashboard-empty-state">No open deals in pipeline.</div>
            ) : (
              deals.map(d => (
                <div key={d.id} className="dashboard-list-row">
                  <div>
                    <div className="dashboard-row-primary">{d.address.split(",")[0]}</div>
                    <div className="dashboard-row-secondary">{d.stage}</div>
                  </div>
                  {d.askingPrice && <div className="dashboard-row-value dashboard-row-value--ink">${Math.round(Number(d.askingPrice)).toLocaleString()}</div>}
                </div>
              ))
            )}
          </div>

          {/* All Properties */}
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <div className="dashboard-card-title">Property Portfolio</div>
              <Link href="/property" className="dashboard-view-all">View all →</Link>
            </div>
            {properties.length === 0 ? (
              <div className="dashboard-empty-state">No properties added yet.</div>
            ) : (
              properties.slice(0, 5).map(p => (
                <div key={p.id} className="dashboard-list-row">
                  <div>
                    <div className="dashboard-row-primary">{p.address.split(",")[0]}</div>
                    <div className="dashboard-row-secondary">{[p.city, p.state].filter(Boolean).join(", ")}</div>
                  </div>
                  {p.status && (
                    <span className="dashboard-status-chip" title={p.status}>
                      {p.status}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Quick Links */}
          <div className="dashboard-card">
            <div className="dashboard-card-title">Quick Actions</div>
            <div className="dashboard-actions">
              {[
                { label: "→ Add a property", href: "/property" },
                { label: "→ New pipeline deal", href: "/pipeline?new=1" },
                { label: "→ Start a rehab project", href: "/rehab" },
                { label: "→ View warehouse", href: "/warehouse" },
                { label: "→ Run underwriting analysis", href: "/underwriting" },
                { label: "→ My tasks & calendar", href: "/command-center" },
              ].map(({ label, href }) => (
                <Link key={href} href={href} className="dashboard-action-link">
                  {label}
                </Link>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
