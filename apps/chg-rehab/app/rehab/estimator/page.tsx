import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { formatET } from "@/lib/datetime";
import EstimatorClient, {
  type EstimateDTO,
  type ProjectOption,
} from "@/components/rehab/EstimatorClient";

export const dynamic = "force-dynamic";

export default async function EstimatorPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "rehab", "view"))) {
    return <div style={{ padding: 20 }}>You do not have access to the Rehab Manager.</div>;
  }
  const canEdit = await can(user, "rehab", "edit");
  const sp = await searchParams;

  const [estimates, projects] = await Promise.all([
    prisma.estimate.findMany({
      where: { companyId: user.companyId },
      include: { lines: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.project.findMany({
      where: { companyId: user.companyId },
      select: { id: true, code: true, name: true, status: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const dtos: EstimateDTO[] = estimates.map((e) => ({
    id: e.id,
    title: e.title,
    rehabType: e.rehabType,
    sqft: e.sqft,
    notes: e.notes,
    status: e.status,
    updatedAtLabel: formatET(e.updatedAt),
    lines: e.lines.map((l) => ({
      costCode: l.costCode,
      name: l.name,
      laborCost: Number(l.laborCost),
      materialCost: Number(l.materialCost),
      unit: l.unit,
      unitPrice: l.unitPrice == null ? null : Number(l.unitPrice),
      quantity: l.quantity == null ? null : Number(l.quantity),
    })),
  }));

  const projectOptions: ProjectOption[] = projects.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    status: p.status,
  }));

  const selectedId = sp.id && dtos.some((e) => e.id === sp.id) ? sp.id : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="proj-bar">
        <div className="proj-l">
          <Link href="/rehab" className="btn-sm" style={{ textDecoration: "none" }}>
            ← Rehab Manager
          </Link>
          <span className="proj-addr" style={{ marginLeft: 6 }}>Scenario Estimator</span>
        </div>
        <div className="proj-r">
          <span className="proj-ts">
            {dtos.length} estimate{dtos.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
      <EstimatorClient
        estimates={dtos}
        projects={projectOptions}
        selectedId={selectedId}
        canEdit={canEdit}
      />
    </div>
  );
}
