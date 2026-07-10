import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import MaterialsClient, {
  type MaterialRow,
  type PhaseOption,
} from "@/components/rehab/MaterialsClient";

export const dynamic = "force-dynamic";

export default async function MaterialsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { companyId_code: { companyId: user.companyId, code: decodeURIComponent(projectId) } },
    select: { id: true, code: true },
  });
  if (!project) notFound();
  const canEdit = await can(user, "rehab", "edit");

  const [orders, phases] = await Promise.all([
    prisma.materialOrder.findMany({
      where: { projectId: project.id },
      include: { phase: { select: { id: true, number: true, name: true } } },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.phase.findMany({
      where: { projectId: project.id },
      select: { id: true, number: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { number: "asc" }],
    }),
  ]);

  const rows: MaterialRow[] = orders.map((o) => ({
    id: o.id,
    vendor: o.vendor,
    description: o.description,
    quantity: o.quantity,
    trackingNumber: o.trackingNumber,
    eta: o.eta ? o.eta.toISOString().slice(0, 10) : null,
    status: o.status,
    urgent: o.urgent,
    cost: o.cost == null ? null : Number(o.cost),
    notes: o.notes,
    phaseId: o.phaseId,
    phaseLabel: o.phase ? `${o.phase.number} — ${o.phase.name}` : null,
  }));

  const phaseOptions: PhaseOption[] = phases;

  return (
    <div className="tab-panel active">
      <MaterialsClient
        projectCode={project.code}
        orders={rows}
        phases={phaseOptions}
        canEdit={canEdit}
      />
    </div>
  );
}
