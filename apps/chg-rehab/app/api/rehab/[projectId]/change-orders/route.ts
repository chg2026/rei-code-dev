import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChangeOrderStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUSES = Object.values(ChangeOrderStatus);

/**
 * Resolve a project the current user is allowed to see. The route param holds
 * either the project `code` (how the Rehab UI links) or the raw `id`; either
 * resolves, always scoped to the user's company.
 */
async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true },
  });
}

/** Attach a human-readable approver name to each change order. */
async function withApproverNames<T extends { approvedById: string | null }>(rows: T[]) {
  const ids = Array.from(
    new Set(rows.map((r) => r.approvedById).filter((x): x is string => !!x))
  );
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const nameById = new Map(
    users.map((u) => [
      u.id,
      [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || "Unknown",
    ])
  );
  return rows.map((r) => ({
    ...r,
    approvedByName: r.approvedById ? nameById.get(r.approvedById) ?? null : null,
  }));
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params;
  const project = await resolveProject(decodeURIComponent(projectId), user.companyId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await prisma.changeOrder.findMany({
    where: { projectId: project.id },
    orderBy: { number: "asc" },
  });
  return NextResponse.json({ changeOrders: await withApproverNames(rows) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params;
  const project = await resolveProject(decodeURIComponent(projectId), user.companyId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(body.amount);
  } catch {
    return NextResponse.json({ error: "A valid amount is required" }, { status: 400 });
  }

  let phaseId: string | null = null;
  if (typeof body.phaseId === "string" && body.phaseId) {
    const phase = await prisma.phase.findFirst({
      where: { id: body.phaseId, projectId: project.id },
      select: { id: true },
    });
    if (!phase) return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
    phaseId = phase.id;
  }

  const status: ChangeOrderStatus = STATUSES.includes(body.status)
    ? body.status
    : ChangeOrderStatus.Pending;

  // Auto-increment the per-project change-order number. The unique constraint
  // (projectId, number) guards against races — retry once on collision.
  const reason =
    typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const max = await prisma.changeOrder.aggregate({
      where: { projectId: project.id },
      _max: { number: true },
    });
    const number = (max._max.number ?? 0) + 1;
    try {
      const created = await prisma.$transaction(async (tx) => {
        const co = await tx.changeOrder.create({
          data: {
            projectId: project.id,
            phaseId,
            number,
            title,
            reason,
            amount,
            status,
            approvedById: status === ChangeOrderStatus.Approved ? user.id : null,
            approvedAt: status === ChangeOrderStatus.Approved ? new Date() : null,
          },
        });
        // Created already-approved with a phase → fold the delta into the phase budget.
        if (status === ChangeOrderStatus.Approved && phaseId) {
          await tx.phase.update({
            where: { id: phaseId },
            data: { budget: { increment: amount } },
          });
        }
        return co;
      });
      return NextResponse.json({ changeOrder: created }, { status: 201 });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        attempt < 2
      ) {
        continue; // number collided — recompute and retry
      }
      throw err;
    }
  }
  return NextResponse.json({ error: "Could not assign change-order number" }, { status: 409 });
}
