import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import LeaseForm from "./LeaseForm";

export const dynamic = "force-dynamic";

export default async function NewLeasePage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "Admin" && user.role !== "ProjectManager") redirect("/");

  const sp = await searchParams;
  const propertyId = sp.propertyId;

  let property = null;
  if (propertyId) {
    property = await prisma.property.findFirst({
      where: { id: propertyId, companyId: user.companyId },
    });
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 700, margin: "0 auto" }}>
      <Link href={propertyId ? `/property-management/properties/${propertyId}` : "/property-management/properties"} style={{ fontSize: 13, color: "var(--blue)", textDecoration: "none" }}>
        ← Back
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: "16px 0 24px" }}>New Lease</h1>
      {property && (
        <div className="glass-card" style={{ padding: 16, borderRadius: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "var(--stone)", marginBottom: 2 }}>Property</div>
          <div style={{ fontWeight: 500 }}>{property.address} ({property.code})</div>
        </div>
      )}
      <LeaseForm propertyId={propertyId || ""} />
    </div>
  );
}