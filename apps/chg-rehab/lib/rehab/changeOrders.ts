import { prisma } from "../prisma";
import { ChangeOrderStatus } from "@prisma/client";

/**
 * Pending change-order exposure for a project.
 *
 * Approved COs are already folded into Phase.budget on approval (one-time
 * transition, source fields lock afterwards) and Rejected ones never count.
 * Pending COs live in neither budget nor committed/actual, so they can be
 * added to the forecast (EAC) without double-counting.
 */
export type PendingChangeOrders = {
  /** phaseId → summed Pending CO amount for that phase. */
  byPhase: Map<string, number>;
  /** All Pending COs on the project, including ones not linked to a phase. */
  total: number;
};

export async function computePendingChangeOrders(
  projectId: string
): Promise<PendingChangeOrders> {
  const groups = await prisma.changeOrder.groupBy({
    by: ["phaseId"],
    where: { projectId, status: ChangeOrderStatus.Pending },
    _sum: { amount: true },
  });
  const byPhase = new Map<string, number>();
  let total = 0;
  for (const g of groups) {
    const amount = Number(g._sum.amount ?? 0);
    total += amount;
    if (g.phaseId) byPhase.set(g.phaseId, amount);
  }
  return { byPhase, total };
}
