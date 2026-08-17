import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import PropertyDetailClient from "./Client";

export const dynamic = "force-dynamic";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const property = await prisma.property.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      leases: {
        include: {
          payments: { orderBy: { receivedAt: "desc" } },
        },
        orderBy: { startDate: "desc" },
      },
    },
  });

  if (!property) {
    return (
      <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
        <h1>Property not found</h1>
        <Link href="/property-management/properties" style={{ color: "var(--blue)" }}>← Back to Properties</Link>
      </div>
    );
  }

  const isAdmin = user.role === "Admin" || user.role === "ProjectManager";
  const activeLease = property.leases.find((l) => l.status === "Active");

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 28 }}>
        <Link href="/property-management/properties" style={{ fontSize: 13, color: "var(--blue)", textDecoration: "none" }}>
          ← All Properties
        </Link>
      </div>

      {/* Property header */}
      <div className="glass-card" style={{ padding: 24, borderRadius: 12, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{property.address}</h1>
              <span style={{
                display: "inline-block", padding: "3px 10px", borderRadius: 10, fontSize: 12, fontWeight: 500,
                background: activeLease ? "var(--green-bg, #dcfce7)" : "var(--stone-bg, #f1f5f9)",
                color: activeLease ? "var(--green)" : "var(--stone)",
              }}>
                {activeLease ? "Occupied" : "Vacant"}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--stone)", display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span>Code: <strong style={{ color: "var(--ink)" }}>{property.code}</strong></span>
              {property.city && <span>{property.city}, {property.state} {property.zip}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {isAdmin && (
              <Link
                href={`/property-management/leases/new?propertyId=${property.id}`}
                style={{
                  padding: "8px 16px", fontSize: 13, fontWeight: 500,
                  background: "var(--blue)", color: "#fff", border: "1px solid var(--blue)",
                  borderRadius: 8, cursor: "pointer", textDecoration: "none",
                }}
              >
                + Add Lease
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Leases section */}
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 16px" }}>Leases</h2>

      {property.leases.length === 0 ? (
        <div className="glass-card" style={{ padding: 40, borderRadius: 12, textAlign: "center" }}>
          <p style={{ color: "var(--stone)", fontSize: 14 }}>No leases yet.</p>
          {isAdmin && (
            <Link
              href={`/property-management/leases/new?propertyId=${property.id}`}
              style={{
                display: "inline-block", marginTop: 12,
                padding: "8px 16px", fontSize: 13, fontWeight: 500,
                background: "var(--blue)", color: "#fff", borderRadius: 8, textDecoration: "none",
              }}
            >
              Add First Lease
            </Link>
          )}
        </div>
      ) : (
        property.leases.map((lease) => (
          <div key={lease.id} className="glass-card" style={{ padding: 20, borderRadius: 12, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>{lease.tenantName}</h3>
                <div style={{ fontSize: 13, color: "var(--stone)", display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {lease.tenantEmail && <span>{lease.tenantEmail}</span>}
                  {lease.tenantPhone && <span>{lease.tenantPhone}</span>}
                  <span style={{
                    padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 500,
                    background: lease.status === "Active" ? "var(--green-bg, #dcfce7)" : "var(--stone-bg, #f1f5f9)",
                    color: lease.status === "Active" ? "var(--green)" : "var(--stone)",
                  }}>
                    {lease.status}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {isAdmin && (
                  <Link
                    href={`/property-management/leases/${lease.id}?action=edit`}
                    style={{
                      padding: "6px 12px", fontSize: 12, fontWeight: 500,
                      background: "var(--paper)", color: "var(--ink)", border: "1px solid var(--border-1)",
                      borderRadius: 6, textDecoration: "none",
                    }}
                  >
                    Edit
                  </Link>
                )}
                <PropertyDetailClient leaseId={lease.id} />
              </div>
            </div>

            {/* Lease financials */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--stone)", marginBottom: 2 }}>Monthly Rent</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>${Number(lease.rent || 0).toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--stone)", marginBottom: 2 }}>Security Deposit</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {Number(lease.securityDeposit || 0) > 0
                    ? `$${Number(lease.securityDeposit).toLocaleString()}`
                    : "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--stone)", marginBottom: 2 }}>Start Date</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{lease.startDate ? new Date(lease.startDate).toLocaleDateString() : "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--stone)", marginBottom: 2 }}>End Date</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{lease.endDate ? new Date(lease.endDate).toLocaleDateString() : "—"}</div>
              </div>
            </div>

            {/* Payment history */}
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 13, fontWeight: 500, color: "var(--blue)", cursor: "pointer" }}>
                Payment History ({lease.payments.length})
              </summary>
              <div style={{ marginTop: 12 }}>
                {lease.payments.length === 0 ? (
                  <p style={{ color: "var(--stone)", fontSize: 13 }}>No payments recorded yet.</p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: "var(--stone)", textAlign: "left" }}>
                        <th style={{ padding: "6px 8px", fontWeight: 500 }}>Period</th>
                        <th style={{ padding: "6px 8px", fontWeight: 500 }}>Amount</th>
                        <th style={{ padding: "6px 8px", fontWeight: 500 }}>Method</th>
                        <th style={{ padding: "6px 8px", fontWeight: 500 }}>Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lease.payments.map((p) => (
                        <tr key={p.id} style={{ borderTop: "1px solid var(--border-1)" }}>
                          <td style={{ padding: "8px" }}>{p.period}</td>
                          <td style={{ padding: "8px", fontWeight: 500 }}>${Number(p.amount).toLocaleString()}</td>
                          <td style={{ padding: "8px" }}>{p.method || "—"}</td>
                          <td style={{ padding: "8px", color: "var(--stone)" }}>{new Date(p.receivedAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </details>
          </div>
        ))
      )}
    </div>
  );
}