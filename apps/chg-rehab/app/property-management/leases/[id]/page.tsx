import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import LeaseForm from "../new/LeaseForm";

export const dynamic = "force-dynamic";

export default async function EditLeasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "Admin" && user.role !== "ProjectManager") redirect("/");

  const { id } = await params;
  const lease = await prisma.lease.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      property: { select: { id: true, code: true, address: true } },
      payments: { orderBy: { receivedAt: "desc" } },
    },
  });

  if (!lease) {
    return (
      <div style={{ padding: "24px 32px", maxWidth: 700, margin: "0 auto" }}>
        <h1>Lease not found</h1>
        <Link href="/property-management/properties" style={{ color: "var(--blue)" }}>← Back to Properties</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 700, margin: "0 auto" }}>
      <Link
        href={`/property-management/properties/${lease.propertyId}`}
        style={{ fontSize: 13, color: "var(--blue)", textDecoration: "none" }}
      >
        ← Back to Property
      </Link>

      <h1 style={{ fontSize: 24, fontWeight: 600, margin: "16px 0 4px" }}>Edit Lease</h1>
      <p style={{ fontSize: 13, color: "var(--stone)", margin: "0 0 24px" }}>
        {lease.property.address} — {lease.tenantName}
      </p>

      <LeaseForm
        propertyId={lease.propertyId}
        lease={{
          id: lease.id,
          tenantName: lease.tenantName,
          tenantEmail: lease.tenantEmail,
          tenantPhone: lease.tenantPhone,
          rent: Number(lease.rent) || 0,
          securityDeposit: Number(lease.securityDeposit) || 0,
          startDate: lease.startDate?.toISOString() ?? null,
          endDate: lease.endDate?.toISOString() ?? null,
          status: lease.status,
        }}
      />

      {/* Payment history */}
      <div className="glass-card" style={{ padding: 20, borderRadius: 12, marginTop: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>
          Payment History ({lease.payments.length})
        </h3>
        {lease.payments.length === 0 ? (
          <p style={{ color: "var(--stone)", fontSize: 13 }}>No payments recorded.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--stone)", textAlign: "left" }}>
                <th style={{ padding: "6px 8px", fontWeight: 500 }}>Period</th>
                <th style={{ padding: "6px 8px", fontWeight: 500 }}>Amount</th>
                <th style={{ padding: "6px 8px", fontWeight: 500 }}>Method</th>
                <th style={{ padding: "6px 8px", fontWeight: 500 }}>Date</th>
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
    </div>
  );
}