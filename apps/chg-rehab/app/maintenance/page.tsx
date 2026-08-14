import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthName = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const [agreements, reportsPending, payments, visits] = await Promise.all([
    prisma.maintenanceAgreement.findMany({
      where: { companyId: user.companyId },
      include: {
        contact: { select: { id: true, name: true } },
        payments: { orderBy: { paidAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.maintenanceReport.count({
      where: { companyId: user.companyId, status: { in: ["New", "Reviewed"] } },
    }),
    prisma.maintenancePayment.findMany({
      where: { companyId: user.companyId },
      select: { amount: true, paidAt: true },
    }),
    prisma.maintenanceVisit.findMany({
      where: { companyId: user.companyId },
      select: {
        id: true,
        agreementId: true,
        visitedAt: true,
        tripNumber: true,
        status: true,
        laborCostTotal: true,
        materialCostTotal: true,
        property: { select: { id: true, code: true, address: true } },
        contact: { select: { id: true, name: true } },
      },
      orderBy: { visitedAt: "desc" },
    }),
  ]);

  const isAdmin = user.role === "Admin" || user.role === "ProjectManager";

  // Trips
  const allowance = agreements
    .filter((a) => a.status === "Active")
    .reduce((s, a) => s + a.tripsPerMonth, 0);
  const tripsThisMonth = visits.filter((v) => new Date(v.visitedAt) >= monthStart).length;
  const tripsRemaining = Math.max(0, allowance - tripsThisMonth);

  // Payments
  const paymentsThisMonth = payments
    .filter((p) => new Date(p.paidAt) >= monthStart)
    .reduce((s, p) => s + Number(p.amount), 0);
  const paymentsTotal = payments.reduce((s, p) => s + Number(p.amount), 0);

  // Spend (labor + materials)
  const laborThisMonth = visits
    .filter((v) => new Date(v.visitedAt) >= monthStart)
    .reduce((s, v) => s + (Number(v.laborCostTotal) || 0), 0);
  const materialsThisMonth = visits
    .filter((v) => new Date(v.visitedAt) >= monthStart)
    .reduce((s, v) => s + (Number(v.materialCostTotal) || 0), 0);
  const spentThisMonth = laborThisMonth + materialsThisMonth;

  const recentVisits = visits.slice(0, 8);

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Maintenance</h1>
          <p style={{ color: "var(--stone)", fontSize: 14, margin: "4px 0 0" }}>{monthName}</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/maintenance/reports" style={secondaryBtn}>
            Reports{reportsPending > 0 ? ` (${reportsPending})` : ""}
          </Link>
          {isAdmin && (
            <>
              <Link href="/maintenance/reports/new" style={secondaryBtn}>+ Report</Link>
              <Link href="/maintenance/agreements/new" style={primaryBtn}>+ Agreement</Link>
            </>
          )}
        </div>
      </div>

      {/* Main metrics — the numbers you asked for */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 28 }}>
        <MetricCard
          label="Payments This Month"
          value={`$${paymentsThisMonth.toFixed(0)}`}
          sub={paymentsTotal > 0 ? `$${paymentsTotal.toFixed(0)} total` : undefined}
          accent="var(--blue)"
        />
        <MetricCard
          label="Trips Used This Month"
          value={tripsThisMonth.toString()}
          sub={allowance > 0 ? `of ${allowance} allowed` : "no agreement set"}
          accent="var(--purple)"
        />
        <MetricCard
          label="Trips Remaining"
          value={tripsRemaining.toString()}
          sub={allowance > 0 ? `${allowance} − ${tripsThisMonth}` : undefined}
          accent={tripsRemaining === 0 && allowance > 0 ? "var(--red)" : "var(--green)"}
        />
        <MetricCard
          label="Spent This Month"
          value={`$${spentThisMonth.toFixed(0)}`}
          sub={spentThisMonth > 0 ? `Labor $${laborThisMonth.toFixed(0)} · Materials $${materialsThisMonth.toFixed(0)}` : "labor + materials"}
          accent="var(--orange)"
        />
      </div>

      {/* Agreements */}
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 14px" }}>Agreements</h2>
      {agreements.length === 0 ? (
        <EmptyState
          message="No maintenance agreements yet."
          action={isAdmin ? <Link href="/maintenance/agreements/new" style={primaryBtn}>+ Create Agreement</Link> : undefined}
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14, marginBottom: 32 }}>
          {agreements.map((a) => {
            const usedTrips = visits.filter((v) => v.agreementId === a.id && new Date(v.visitedAt) >= monthStart).length;
            const pct = allowance > 0 ? Math.min(100, Math.round((usedTrips / a.tripsPerMonth) * 100)) : 0;
            return (
              <Link
                key={a.id}
                href={`/maintenance/agreements/${a.id}`}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  borderRadius: 14,
                  border: "1px solid var(--border-1)",
                  padding: "18px 20px",
                  textDecoration: "none",
                  color: "inherit",
                  display: "block",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{a.name}</div>
                    <div style={{ fontSize: 13, color: "var(--stone)" }}>{a.contact.name}</div>
                  </div>
                  <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: a.status === "Active" ? "rgba(34,197,94,0.12)" : "rgba(100,116,139,0.10)", color: a.status === "Active" ? "var(--green)" : "var(--stone)" }}>
                    {a.status}
                  </span>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--stone)", marginBottom: 4 }}>
                    <span>Trips this month</span>
                    <span>{usedTrips} / {a.tripsPerMonth}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: pct >= 100 ? "var(--red)" : pct >= 70 ? "var(--orange)" : "var(--green)", transition: "width 0.3s" }} />
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--stone)" }}>
                  ${Number(a.retainerAmount).toFixed(0)}/mo
                  {a.payments[0] && ` · Last paid $${Number(a.payments[0].amount).toFixed(0)}`}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Recent visits */}
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 14px" }}>Recent Trips</h2>
      {recentVisits.length === 0 ? (
        <EmptyState message="No trips logged yet." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recentVisits.map((v) => (
            <Link
              key={v.id}
              href={`/maintenance/visits/${v.id}`}
              style={{
                background: "rgba(255,255,255,0.04)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                borderRadius: 12,
                border: "1px solid var(--border-1)",
                padding: "14px 18px",
                display: "flex",
                alignItems: "center",
                gap: 14,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{v.property.code} — {v.property.address}</div>
                <div style={{ fontSize: 12, color: "var(--stone)", marginTop: 2 }}>
                  {v.contact.name} · Trip #{v.tripNumber} · {new Date(v.visitedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {Number(v.laborCostTotal) > 0 && ` · Labor $${Number(v.laborCostTotal).toFixed(0)}`}
                  {Number(v.materialCostTotal) > 0 && ` · Materials $${Number(v.materialCostTotal).toFixed(0)}`}
                </div>
              </div>
              <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: v.status === "Completed" ? "rgba(34,197,94,0.12)" : "rgba(234,179,8,0.12)", color: v.status === "Completed" ? "var(--green)" : "var(--amber)" }}>
                {v.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderRadius: 14, border: "1px solid var(--border-1)", padding: "18px 20px" }}>
      <div style={{ fontSize: 12, color: "var(--stone)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--stone)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--stone)", background: "rgba(255,255,255,0.03)", borderRadius: 14, border: "1px solid var(--border-1)", marginBottom: 28 }}>
      <p style={{ margin: "0 0 12px" }}>{message}</p>
      {action}
    </div>
  );
}

const secondaryBtn: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: 10,
  border: "1px solid var(--border-1)",
  background: "transparent",
  color: "var(--ink)",
  fontSize: 14,
  fontWeight: 500,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

const primaryBtn: React.CSSProperties = {
  ...secondaryBtn,
  background: "var(--blue)",
  color: "#fff",
  border: "none",
};
