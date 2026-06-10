import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import PmLayout from "@/components/pm/PmLayout";

export const dynamic = "force-dynamic";

export default async function PmPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const spaces = await prisma.pmSpace.findMany({
    where: { companyId: user.companyId },
    include: {
      lists: { orderBy: { order: "asc" } },
      statuses: { orderBy: { order: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <PmLayout spaces={spaces}>
      {spaces.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 16, color: "#6B7280" }}>
          <div style={{ fontSize: 48 }}>📋</div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827" }}>No spaces yet</h2>
          <p style={{ margin: 0, fontSize: 14 }}>Create your first space to start managing tasks.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 8, color: "#6B7280" }}>
          <p style={{ fontSize: 14 }}>Select a list from the sidebar to view tasks.</p>
        </div>
      )}
    </PmLayout>
  );
}
