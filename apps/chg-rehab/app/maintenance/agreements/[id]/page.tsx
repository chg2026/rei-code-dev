import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecordPaymentButton } from "./RecordPaymentButton";

export const dynamic = "force-dynamic";

export default async function AgreementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const agreement = await prisma.maintenanceAgreement.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      contact: { select: { id: true, name: true, phone: true, email: true } },
      visits: {
        include: { property: { select: { id: true, code: true, address: true } }, workItems: true },
        orderBy: { visitedAt: "desc" },
      },
      payments: { orderBy: { paidAt: "desc" } },
    },
  });

  if (!agreement) notFound();

  const isAdmin = user.role === "Admin" || user.role === "ProjectManager";
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyVisits = agreement.visits.filter((v) => new Date(v.visitedAt) >= monthStart);
  const totalSpend = agreement.payments.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <Link href="/maintenance" style={{ fontSize: 13, color: "var(--stone)", textDecoration: "none" }}>← Maintenance</Link>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: "4px 0" }}>{agreement.name}</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 14, color: "var(--stone)" }}>
            <span>{agreement.contact.name}</span>
            {agreement.contact.email && <span>{agreement.contact.email}</span>}
            <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: agreement.status === "Active" ? "rgba(34,197,94,0.12)" : "rgba(100,116,139,0.10)", color: agreement.status === "Active" ? "var(--green)" : "var(--stone)" }}>{agreement.status}</span>
          </div>
        </div>
        {isAdmin && (
          <div style={{ display: "flex", gap: 8 }}>
            <RecordPaymentButton agreementId={agreement.id} />
            <Link href={`/maintenance/visits/new?agreementId=${agreement.id}`} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid var(--border-1)", background: "transparent", color: "var(--ink)", fontSize: 14, fontWeight: 500, textDecoration: "none" }}>+ Log Visit</Link>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
        <StatCard label="Retainer" value={`$${Number(agreement.retainerAmount).toFixed(0)}/mo`} />
        <StatCard label="Trips This Month" value={`${monthlyVisits.length} / ${agreement.tripsPerMonth}`} />
        <StatCard label="Total Visits" value={agreement.visits.length.toString()} />
        <StatCard label="Total Paid" value={`$${totalSpend.toFixed(0)}`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Visits */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 14px" }}>Visits</h2>
          {agreement.visits.length === 0 ? (
            <p style={{ color: "var(--stone)", fontSize: 14 }}>No visits logged.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {agreement.visits.map((v) => (
                <Link
                  key={v.id}
                  href={`/maintenance/visits/${v.id}`}
                  style={{
                    background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                    borderRadius: 12, border: "1px solid var(--border-1)", padding: "14px 16px",
                    textDecoration: "none", color: "inherit", display: "block",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>{v.property.code} — {v.property.address}</div>
                      <div style={{ fontSize: 12, color: "var(--stone)", marginTop: 2 }}>
                        Trip #{v.tripNumber} · {new Date(v.visitedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        {v.isRepeatFix && " · Repeat fix"}
                      </div>
                    </div>
                    <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 500, background: v.status === "Completed" ? "rgba(34,197,94,0.12)" : "rgba(234,179,8,0.12)", color: v.status === "Completed" ? "var(--green)" : "var(--amber)" }}>{v.status}</span>
                  </div>
                  {v.description && <p style={{ fontSize: 13, color: "var(--stone)", margin: "6px 0 0", lineHeight: 1.4 }}>{v.description}</p>}
                  {v.workItems.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 12, color: "var(--stone)" }}>
                      {v.workItems.length} work item{v.workItems.length !== 1 ? "s" : ""}
                      {Number(v.laborCostTotal) > 0 && ` · Labor $${Number(v.laborCostTotal).toFixed(0)}`}
                      {Number(v.materialCostTotal) > 0 && ` · Materials $${Number(v.materialCostTotal).toFixed(0)}`}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Payments */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 14px" }}>Payments</h2>
          {agreement.payments.length === 0 ? (
            <p style={{ color: "var(--stone)", fontSize: 14 }}>No payments recorded.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {agreement.payments.map((p) => (
                <div
                  key={p.id}
                  style={{
                    background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                    borderRadius: 12, border: "1px solid var(--border-1)", padding: "14px 16px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 16 }}>${Number(p.amount).toFixed(2)}</div>
                      <div style={{ fontSize: 12, color: "var(--stone)", marginTop: 2 }}>{p.period} · {new Date(p.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                    </div>
                  </div>
                  {p.notes && <p style={{ fontSize: 13, color: "var(--stone)", margin: "6px 0 0" }}>{p.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderRadius: 14, border: "1px solid var(--border-1)", padding: "16px 18px" }}>
      <div style={{ fontSize: 12, color: "var(--stone)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
