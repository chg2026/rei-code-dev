import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const q = sp.q || "";
  const statusFilter = sp.status || "all";

  const properties = await prisma.property.findMany({
    where: {
      companyId: user.companyId,
      status: { in: ["rental", "Rental"], not: null },
      ...(q ? {
        OR: [
          { address: { contains: q, mode: "insensitive" as const } },
          { code: { contains: q, mode: "insensitive" as const } },
        ],
      } : {}),
    },
    include: {
      leases: {
        where: { status: "Active" },
        select: {
          id: true,
          tenantName: true,
          rent: true,
          startDate: true,
          endDate: true,
          securityDeposit: true,
        },
        orderBy: { startDate: "desc" },
        take: 1,
      },
    },
    orderBy: { code: "asc" },
  });

  const filtered = statusFilter === "occupied"
    ? properties.filter((p) => p.leases.length > 0)
    : statusFilter === "vacant"
    ? properties.filter((p) => p.leases.length === 0)
    : properties;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    background: active ? "var(--blue)" : "var(--paper)",
    color: active ? "#fff" : "var(--ink)",
    border: active ? "1px solid var(--blue)" : "1px solid var(--border-1)",
    borderRadius: 8,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  });

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Properties</h1>
          <p style={{ color: "var(--stone)", fontSize: 14, margin: "4px 0 0" }}>
            {filtered.length} rental {filtered.length === 1 ? "property" : "properties"}
          </p>
        </div>
        <Link href="/property-management" style={{ fontSize: 13, color: "var(--blue)", textDecoration: "none" }}>
          ← Back to Dashboard
        </Link>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <Link href="?status=all&q=" style={tabStyle(statusFilter === "all")}>All</Link>
        <Link href="?status=occupied&q=" style={tabStyle(statusFilter === "occupied")}>Occupied</Link>
        <Link href="?status=vacant&q=" style={tabStyle(statusFilter === "vacant")}>Vacant</Link>
        <form method="GET" style={{ display: "flex", gap: 6, flex: 1, maxWidth: 300, marginLeft: "auto" }}>
          <input type="hidden" name="status" value={statusFilter} />
          <input
            name="q"
            type="search"
            placeholder="Search address or code…"
            defaultValue={q}
            style={{
              width: "100%", padding: "6px 12px", fontSize: 13,
              border: "1px solid var(--border-1)", borderRadius: 8,
              background: "var(--paper)", color: "var(--ink)", fontFamily: "inherit",
            }}
          />
        </form>
      </div>

      {/* Properties table */}
      {filtered.length === 0 ? (
        <div className="glass-card" style={{ padding: 40, borderRadius: 12, textAlign: "center" }}>
          <p style={{ color: "var(--stone)", fontSize: 14 }}>
            {q ? "No properties match your search." : "No rental properties yet."}
          </p>
        </div>
      ) : (
        <div className="glass-card" style={{ borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--stone)", textAlign: "left", borderBottom: "1px solid var(--border-1)" }}>
                <th style={{ padding: "10px 16px", fontWeight: 500 }}>Code</th>
                <th style={{ padding: "10px 16px", fontWeight: 500 }}>Address</th>
                <th style={{ padding: "10px 16px", fontWeight: 500 }}>Tenant</th>
                <th style={{ padding: "10px 16px", fontWeight: 500 }}>Rent</th>
                <th style={{ padding: "10px 16px", fontWeight: 500 }}>Lease Dates</th>
                <th style={{ padding: "10px 16px", fontWeight: 500 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const lease = p.leases[0];
                return (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--border-1)" }}>
                    <td style={{ padding: "10px 16px" }}>
                      <Link
                        href={`/property-management/properties/${p.id}`}
                        style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 500 }}
                      >
                        {p.code}
                      </Link>
                    </td>
                    <td style={{ padding: "10px 16px" }}>{p.address}{p.city ? `, ${p.city}` : ""}</td>
                    <td style={{ padding: "10px 16px" }}>
                      {lease ? lease.tenantName : <span style={{ color: "var(--stone)" }}>Vacant</span>}
                    </td>
                    <td style={{ padding: "10px 16px", fontWeight: 500 }}>
                      {lease ? `$${Number(lease.rent || 0).toLocaleString()}` : "—"}
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 12, color: "var(--stone)" }}>
                      {lease
                        ? `${lease.startDate ? new Date(lease.startDate).toLocaleDateString() : "?"} – ${lease.endDate ? new Date(lease.endDate).toLocaleDateString() : "?"}`
                        : "—"}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 500,
                        background: lease ? "var(--green-bg, #dcfce7)" : "var(--stone-bg, #f1f5f9)",
                        color: lease ? "var(--green)" : "var(--stone)",
                      }}>
                        {lease ? "Occupied" : "Vacant"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}