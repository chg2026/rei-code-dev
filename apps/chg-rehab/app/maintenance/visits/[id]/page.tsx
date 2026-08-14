import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function VisitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const visit = await prisma.maintenanceVisit.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      property: { select: { id: true, code: true, address: true } },
      contact: { select: { id: true, name: true } },
      agreement: { select: { id: true, name: true, retainerAmount: true, tripsPerMonth: true } },
      workItems: true,
      report: { select: { id: true, description: true, priority: true } },
    },
  });

  if (!visit) notFound();

  const labor = Number(visit.laborCostTotal) || 0;
  const materials = Number(visit.materialCostTotal) || 0;
  const total = labor + materials;

  const statusColor =
    visit.status === "Completed" ? "var(--green)" : visit.status === "InProgress" ? "var(--amber)" : "var(--blue)";

  return (
    <div style={{ padding: "24px 32px", maxWidth: 820, margin: "0 auto" }}>
      <Link href="/maintenance" style={{ fontSize: 13, color: "var(--stone)", textDecoration: "none" }}>← Maintenance</Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", margin: "8px 0 24px" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
            {visit.property.code} — {visit.property.address}
          </h1>
          <div style={{ fontSize: 14, color: "var(--stone)", marginTop: 4 }}>
            {visit.contact.name} · {new Date(visit.visitedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </div>
        </div>
        <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, background: "rgba(255,255,255,0.05)", color: statusColor }}>
          {visit.status}
        </span>
      </div>

      {/* Meta */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        <InfoCard label="Trip #" value={String(visit.tripNumber)} />
        <InfoCard label="Agreement" value={visit.agreement.name} />
        <InfoCard label="Labor" value={`$${labor.toFixed(2)}`} />
        <InfoCard label="Materials" value={`$${materials.toFixed(2)}`} />
        <InfoCard label="Total" value={`$${total.toFixed(2)}`} accent />
      </div>

      {visit.isRepeatFix && (
        <div style={{ background: "rgba(234,88,12,0.10)", borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "var(--orange)" }}>
          Repeat fix — same issue revisited (payment stays at $150).
        </div>
      )}

      {/* Description */}
      {visit.description && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>Description</h2>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--ink)" }}>{visit.description}</p>
        </div>
      )}

      {/* Linked report */}
      {visit.report && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>Original Report</h2>
          <div style={{ background: "rgba(37,99,235,0.06)", borderRadius: 10, padding: "12px 16px", fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--blue)" }}>{visit.report.priority}</span> — {visit.report.description}
          </div>
        </div>
      )}

      {/* Work items */}
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>Work Items</h2>
      {visit.workItems.length === 0 ? (
        <p style={{ color: "var(--stone)", fontSize: 14 }}>No work items recorded.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visit.workItems.map((wi) => (
            <div
              key={wi.id}
              style={{
                background: "rgba(255,255,255,0.04)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                borderRadius: 12,
                border: "1px solid var(--border-1)",
                padding: "14px 16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{wi.description}</div>
                  <div style={{ fontSize: 12, color: "var(--stone)", marginTop: 2 }}>{wi.category}</div>
                </div>
                <div style={{ textAlign: "right", fontSize: 13, whiteSpace: "nowrap" }}>
                  {Number(wi.laborCost) > 0 && <div>Labor ${Number(wi.laborCost).toFixed(2)}</div>}
                  {Number(wi.materialCost) > 0 && <div>Materials ${Number(wi.materialCost).toFixed(2)}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderRadius: 12, border: "1px solid var(--border-1)", padding: "12px 16px" }}>
      <div style={{ fontSize: 11, color: "var(--stone)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: accent ? 700 : 500, color: accent ? "var(--green)" : "var(--ink)" }}>{value}</div>
    </div>
  );
}
