import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PropertyManagementPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixtyDaysOut = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [rentalProperties, leases, payments] = await Promise.all([
    prisma.property.findMany({
      where: { companyId: user.companyId, status: { in: ["rental", "Rental"], not: null } },
      select: { id: true, code: true, address: true, city: true, state: true, status: true },
    }),
    prisma.lease.findMany({
      where: { companyId: user.companyId },
      include: {
        property: { select: { id: true, code: true, address: true } },
        payments: { select: { amount: true, period: true }, orderBy: { receivedAt: "desc" } },
      },
    }),
    prisma.rentPayment.findMany({
      where: { companyId: user.companyId },
      include: {
        lease: { select: { tenantName: true, property: { select: { code: true, address: true } } } },
      },
      orderBy: { receivedAt: "desc" },
      take: 10,
    }),
  ]);

  const activeLeases = leases.filter((l) => l.status === "Active");
  const occupied = activeLeases.length;
  const totalProperties = rentalProperties.length;

  // Monthly rent roll
  const monthlyRentRoll = activeLeases.reduce((s, l) => s + (Number(l.rent) || 0), 0);

  // Collected this month
  let collectedThisMonth = 0;
  for (const l of leases) {
    if (l.payments.some((p) => p.period === currentPeriod)) {
      collectedThisMonth += Number(l.rent) || 0;
    }
  }

  // Outstanding = unpaid rent from lease start through now
  let outstanding = 0;
  for (const l of activeLeases) {
    if (!l.startDate || !l.rent) continue;
    const ls = new Date(Math.max(l.startDate.getTime(), new Date(now.getFullYear(), 0, 1).getTime()));
    let cursor = new Date(ls.getFullYear(), ls.getMonth(), 1);
    while (cursor <= now) {
      const p = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      if (!l.payments.some((pay) => pay.period === p)) {
        outstanding += Number(l.rent);
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  }

  // Deposits
  const depositsHeld = leases.reduce((s, l) => s + (Number(l.securityDeposit) || 0), 0);

  // Upcoming expirations
  const upcoming = leases
    .filter((l) => l.status === "Active" && l.endDate && l.endDate >= now && l.endDate <= sixtyDaysOut)
    .sort((a, b) => (a.endDate!.getTime() - b.endDate!.getTime()))
    .slice(0, 8);

  const isAdmin = user.role === "Admin" || user.role === "ProjectManager";

  const secondaryBtn: React.CSSProperties = {
    padding: "8px 16px", fontSize: 13, fontWeight: 500,
    background: "var(--paper)", color: "var(--ink)", border: "1px solid var(--border-1)",
    borderRadius: 8, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6,
  };
  const primaryBtn: React.CSSProperties = {
    ...secondaryBtn, background: "var(--blue)", color: "#fff", border: "1px solid var(--blue)",
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Property Management</h1>
          <p style={{ color: "var(--stone)", fontSize: 14, margin: "4px 0 0" }}>
            {now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/property-management/properties" style={secondaryBtn}>View Properties</Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 28 }}>
        <MetricCard label="Total Properties" value={String(totalProperties)} accent="var(--blue)" />
        <MetricCard label="Occupied" value={String(occupied)} sub={`${totalProperties - occupied} vacant`} accent="var(--green)" />
        <MetricCard label="Monthly Rent Roll" value={`$${monthlyRentRoll.toLocaleString()}`} accent="var(--purple)" />
        <MetricCard label="Collected This Month" value={`$${collectedThisMonth.toLocaleString()}`} sub={outstanding > 0 ? `$${outstanding.toLocaleString()} outstanding` : "All caught up"} accent={outstanding > 0 ? "var(--amber)" : "var(--green)"} />
        <MetricCard label="Deposits Held" value={`$${depositsHeld.toLocaleString()}`} accent="var(--teal)" />
      </div>

      {/* Recent Payments & Upcoming Expirations */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div className="glass-card" style={{ padding: 20, borderRadius: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 16px" }}>Recent Payments</h2>
          {payments.length === 0 ? (
            <p style={{ color: "var(--stone)", fontSize: 14 }}>No payments recorded yet.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--stone)", textAlign: "left" }}>
                  <th style={{ padding: "6px 8px", fontWeight: 500 }}>Tenant</th>
                  <th style={{ padding: "6px 8px", fontWeight: 500 }}>Amount</th>
                  <th style={{ padding: "6px 8px", fontWeight: 500 }}>Period</th>
                  <th style={{ padding: "6px 8px", fontWeight: 500 }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--border-1)" }}>
                    <td style={{ padding: "8px" }}>{p.lease.tenantName}</td>
                    <td style={{ padding: "8px", fontWeight: 500 }}>${Number(p.amount).toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>{p.period}</td>
                    <td style={{ padding: "8px", color: "var(--stone)" }}>{new Date(p.receivedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="glass-card" style={{ padding: 20, borderRadius: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 16px" }}>Upcoming Lease Expirations</h2>
          {upcoming.length === 0 ? (
            <p style={{ color: "var(--stone)", fontSize: 14 }}>No leases expiring in the next 60 days.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--stone)", textAlign: "left" }}>
                  <th style={{ padding: "6px 8px", fontWeight: 500 }}>Tenant</th>
                  <th style={{ padding: "6px 8px", fontWeight: 500 }}>Property</th>
                  <th style={{ padding: "6px 8px", fontWeight: 500 }}>Rent</th>
                  <th style={{ padding: "6px 8px", fontWeight: 500 }}>Expires</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((l) => (
                  <tr key={l.id} style={{ borderTop: "1px solid var(--border-1)" }}>
                    <td style={{ padding: "8px" }}>
                      <Link href={`/property-management/leases/${l.id}`} style={{ color: "var(--blue)", textDecoration: "none" }}>
                        {l.tenantName}
                      </Link>
                    </td>
                    <td style={{ padding: "8px", color: "var(--stone)", fontSize: 12 }}>{l.property?.address ?? "—"}</td>
                    <td style={{ padding: "8px", fontWeight: 500 }}>${Number(l.rent || 0).toLocaleString()}</td>
                    <td style={{ padding: "8px", color: "var(--amber)" }}>{new Date(l.endDate!).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="glass-card" style={{ padding: "18px 20px", borderRadius: 12 }}>
      <div style={{ fontSize: 12, color: "var(--stone)", marginBottom: 6, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, color: "var(--stone)", marginTop: 4 }}>{sub}</div> : null}
    </div>
  );
}