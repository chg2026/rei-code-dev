import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ReportsClient } from "./ReportsClient";

export const dynamic = "force-dynamic";

type SearchParams = {
  status?: string;
  propertyId?: string;
  priority?: string;
};

const priorityOrder: Record<string, number> = { Emergency: 0, High: 1, Medium: 2, Low: 3 };
const priorityColors: Record<string, string> = {
  Emergency: "var(--red)",
  High: "var(--orange)",
  Medium: "var(--blue)",
  Low: "var(--stone)",
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const where: Record<string, unknown> = { companyId: user.companyId };
  if (sp.status) where.status = sp.status;
  if (sp.propertyId) where.propertyId = sp.propertyId;
  if (sp.priority) where.priority = sp.priority;

  const [reports, properties, agreements] = await Promise.all([
    prisma.maintenanceReport.findMany({
      where,
      include: {
        property: { select: { id: true, code: true, address: true } },
        convertedToVisit: { select: { id: true, visitedAt: true, status: true } },
      },
      orderBy: [{ priority: "asc" }, { reportedAt: "desc" }],
    }),
    prisma.property.findMany({
      where: { companyId: user.companyId },
      select: { id: true, code: true, address: true },
      orderBy: { code: "asc" },
    }),
    prisma.maintenanceAgreement.findMany({
      where: { companyId: user.companyId, status: "Active" },
      include: { contact: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const isAdmin = user.role === "Admin" || user.role === "ProjectManager";

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Maintenance Reports</h1>
          <p style={{ color: "var(--stone)", fontSize: 14, margin: "4px 0 0" }}>
            {reports.length} report{reports.length !== 1 ? "s" : ""}
            {sp.status ? ` · ${sp.status}` : ""}
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/maintenance/reports/new"
            style={{
              background: "var(--blue)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            + New Report
          </Link>
        )}
      </div>

      <ReportsClient reports={reports} properties={properties} agreements={agreements} isAdmin={isAdmin} />
    </div>
  );
}
