import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [agreements, reports, recentVisits] = await Promise.all([
    prisma.maintenanceAgreement.findMany({
      where: { companyId: user.companyId },
      include: {
        contact: { select: { id: true, name: true } },
        visits: { where: { visitedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } },
        payments: { orderBy: { paidAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.maintenanceReport.count({
      where: { companyId: user.companyId, status: { in: ["New", "Reviewed"] } },
    }),
    prisma.maintenanceVisit.findMany({
      where: { companyId: user.companyId },
      include: {
        property: { select: { id: true, code: true, address: true } },
        contact: { select: { id: true, name: true } },
        agreement: { select: { id: true, name: true } },
      },
      orderBy: { visitedAt: "desc" },
      take: 10,
    }),
  ]);

  const isAdmin = user.role === "Admin" || user.role === "ProjectManager";

  // Compute monthly totals
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyVisits = await prisma.maintenanceVisit.findMany({
    where: { companyId: user.companyId, visitedAt: { gte: monthStart } },
    select: { laborCostTotal: true, materialCostTotal: true },
  });
  const totalLabor = monthlyVisits.reduce((s, v) => s + (Number(v.laborCostTotal) || 0), 0);
  const totalMaterials = monthlyVisits.reduce((s, v) => s + (Number(v.materialCostTotal) || 0), 0);

  const monthName = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Maintenance</h1>
          <p style={{ color: "var(--stone)", fontSize: 14, margin: "4px 0 0" }}>{monthName}</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/maintenance/reports" style={linkBtnStyle}>
            Reports {reports > 0 ? `(${reports})` : ""}
          </Link>
          {isAdmin && (
            <Link href="/maintenance/reports/new" style={primaryBtnStyle}>
              + New Report
            </Link>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 28 }}>
        <SummaryCard label="Pending Reports" value={reports} color="var(--blue)" />
        <SummaryCard label="Active Agreements" value={agreements.filter((a) => a.status === "Active").length} color="var(--green)" />
        <SummaryCard label="Labor This Month" value={`$${totalLabor.toFixed(0)}`} color="var(--purple)" />
        <SummaryCard label="Materials This Month" value={`$${totalMaterials.toFixed(0)}`} color="var(--orange)" />
      </div>

      {/* Agreements */}
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 14px" }}>Agreements</h2>
      {agreements.length === 0 ? (
        <EmptyState message="No maintenance agreements yet." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14, marginBottom: 32 }}>
          {agreements.map((a) => {
            const usedTrips = a.visits.length;
            const pct = Math.min(100, Math.round((usedTrips / a.tripsPerMonth) * 100));
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
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 500,
                      background: a.status === "Active" ? "rgba(34,197,94,0.12)" : "rgba(100,116,139,0.10)",
                      color: a.status === "Active" ? "var(--green)" : "var(--stone)",
                    }}
                  >
                    {a.status}
                  </span>
                </div>

                {/* Trip gauge */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--stone)", marginBottom: 4 }}>
                    <span>Trips this month</span>
                    <span>
                      {usedTrips} / {a.tripsPerMonth}
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        borderRadius: 3,
                        background: pct >= 100 ? "var(--red)" : pct >= 70 ? "var(--orange)" : "var(--green)",
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "var(--stone)" }}>
                  ${Number(a.retainerAmount).toFixed(0)}/mo
                  {a.payments[0] && ` · Last paid ${new Date(a.payments[0].paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Recent visits */}
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 14px" }}>Recent Visits</h2>
      {recentVisits.length === 0 ? (
        <EmptyState message="No visits logged yet." />
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
                <div style={{ fontWeight: 500, fontSize: 14 }}>
                  {v.property.code} — {v.property.address}
                </div>
                <div style={{ fontSize: 12, color: "var(--stone)", marginTop: 2 }}>
                  {v.contact.name} · Trip #{v.tripNumber} · {new Date(v.visitedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
              </div>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 500,
                  background: v.status === "Completed" ? "rgba(34,197,94,0.12)" : "rgba(234,179,8,0.12)",
                  color: v.status === "Completed" ? "var(--green)" : "var(--amber)",
                }}
              >
                {v.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderRadius: 14,
        border: "1px solid var(--border-1)",
        padding: "18px 20px",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--stone)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "40px 20px",
        color: "var(--stone)",
        background: "rgba(255,255,255,0.03)",
        borderRadius: 14,
        border: "1px solid var(--border-1)",
        marginBottom: 28,
      }}
    >
      {message}
    </div>
  );
}

const linkBtnStyle: React.CSSProperties = {
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

const primaryBtnStyle: React.CSSProperties = {
  ...linkBtnStyle,
  background: "var(--blue)",
  color: "#fff",
  border: "none",
};
