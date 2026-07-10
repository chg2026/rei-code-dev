import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadProjectByCode } from "@/lib/rehab/queries";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { computePhaseActualBreakdowns } from "@/lib/rehab/invoiceActuals";
import { computePendingChangeOrders } from "@/lib/rehab/changeOrders";
import { computeProjectForecastTotals } from "@/lib/rehab/projectForecast";
import ReturnsClient, { type ReturnsInitial } from "@/components/rehab/ReturnsClient";

export const dynamic = "force-dynamic";

export default async function ReturnsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const project = await loadProjectByCode(user.companyId, decodeURIComponent(projectId));
  if (!project) notFound();
  const canEdit = await can(user, "rehab", "edit");

  const [actualsMap, pendingCOs, propertyRow] = await Promise.all([
    computePhaseActualBreakdowns(project.id),
    computePendingChangeOrders(project.id),
    prisma.property.findUnique({
      where: { id: project.propertyId },
      select: { meta: true },
    }),
  ]);
  const { projectedFinal } = computeProjectForecastTotals(project.phases, actualsMap, pendingCOs);

  // Prefill acquisition cost from the property's purchase price (the same
  // source the Overview "Acquisition cost" row uses) until one is saved here.
  const propMeta =
    propertyRow?.meta && typeof propertyRow.meta === "object" && !Array.isArray(propertyRow.meta)
      ? (propertyRow.meta as { purchasePrice?: number })
      : {};
  const purchasePrice =
    typeof propMeta.purchasePrice === "number" ? propMeta.purchasePrice : null;

  const initial: ReturnsInitial = {
    arv: project.arv == null ? null : Number(project.arv),
    acquisitionCost:
      project.acquisitionCost == null ? purchasePrice : Number(project.acquisitionCost),
    refiLtvPct: project.refiLtvPct == null ? null : Number(project.refiLtvPct),
    refiRatePct: project.refiRatePct == null ? null : Number(project.refiRatePct),
    refiTermYears: project.refiTermYears,
    monthlyRent: project.monthlyRent == null ? null : Number(project.monthlyRent),
    monthlyExpenses: project.monthlyExpenses == null ? null : Number(project.monthlyExpenses),
  };

  return (
    <div className="tab-panel active">
      <div style={{ flex: 1, overflowY: "auto" }}>
        <ReturnsClient
          projectCode={project.code}
          projectedRehab={projectedFinal}
          initial={initial}
          canEdit={canEdit}
        />
      </div>
    </div>
  );
}
