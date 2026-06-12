import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadProjectByCode } from "@/lib/rehab/queries";
import { prisma } from "@/lib/prisma";
import ChangeOrdersClient, {
  type ChangeOrderDTO,
} from "@/components/rehab/ChangeOrdersClient";

export const dynamic = "force-dynamic";

export default async function ChangeOrdersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const code = decodeURIComponent(projectId);
  const project = await loadProjectByCode(user.companyId, code);
  if (!project) notFound();

  const rows = await prisma.changeOrder.findMany({
    where: { projectId: project.id },
    orderBy: { number: "asc" },
  });

  const approverIds = Array.from(
    new Set(rows.map((r) => r.approvedById).filter((x): x is string => !!x))
  );
  const approvers = approverIds.length
    ? await prisma.user.findMany({
        where: { id: { in: approverIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const nameById = new Map(
    approvers.map((u) => [
      u.id,
      [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || "Unknown",
    ])
  );

  const changeOrders: ChangeOrderDTO[] = rows.map((co) => ({
    id: co.id,
    number: co.number,
    title: co.title,
    reason: co.reason,
    amount: Number(co.amount),
    status: co.status,
    phaseId: co.phaseId,
    approvedById: co.approvedById,
    approvedByName: co.approvedById ? nameById.get(co.approvedById) ?? null : null,
    approvedAt: co.approvedAt ? co.approvedAt.toISOString() : null,
    createdAt: co.createdAt.toISOString(),
  }));

  const phases = project.phases.map((p) => ({
    id: p.id,
    number: p.number,
    name: p.name,
    budget: Number(p.budget ?? 0),
  }));

  return (
    <ChangeOrdersClient
      projectCode={project.code}
      phases={phases}
      initialChangeOrders={changeOrders}
    />
  );
}
